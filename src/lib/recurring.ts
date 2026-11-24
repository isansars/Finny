// Recurring transactions (FINNY-142). Days from recurring-rule.ts; adding goes through the ordinary transaction path,
// so balances, budgets and reports need nothing new. Every query is scoped to the owner.
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, moneyAccounts, recurring, recurringDismissed, recurringRuns, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { parseRupiah } from "@/lib/money";
import { todayIn } from "@/lib/dates";
import { createTransaction } from "@/lib/data";
import { txnProblem } from "@/lib/txn-rule";
import { addDays, comingUp, dueDays, nextDay, perMonth, suggestionKey, suggestions, type Every } from "@/lib/recurring-rule";

const bad = (m: string, status = 400): never => { throw new HttpError(status, m); };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
type Row = typeof recurring.$inferSelect;

async function own(userId: string, id: string): Promise<Row> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) bad("Recurring item not found.", 404);
  const [r] = await db.select().from(recurring).where(and(eq(recurring.userId, userId), eq(recurring.id, id)));
  return r ?? bad("Recurring item not found.", 404);
}
const began = (r: Row) => todayIn(r.createdAt); // the day it was made, in Jakarta
async function doneDays(ids: string[]) {
  const runs = ids.length ? await db.select().from(recurringRuns).where(inArray(recurringRuns.recurringId, ids)) : [];
  const m = new Map<string, Set<string>>();
  for (const x of runs) { const s = m.get(x.recurringId) ?? new Set(); s.add(x.dueOn); m.set(x.recurringId, s); }
  return { runs, m };
}
/** A changing amount counts its last added amount. */
async function lastAmounts(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const rows = await db.select({ rid: recurringRuns.recurringId, on: recurringRuns.dueOn, sen: transactions.amountSen }).from(recurringRuns)
    .innerJoin(transactions, eq(transactions.id, recurringRuns.txnId)).where(inArray(recurringRuns.recurringId, ids)).orderBy(desc(recurringRuns.dueOn));
  const m = new Map<string, number>(); for (const x of rows) if (!m.has(x.rid)) m.set(x.rid, x.sen);
  return m;
}

export async function listRecurring(userId: string) {
  const today = todayIn();
  const rows = await db.select().from(recurring).where(eq(recurring.userId, userId)).orderBy(asc(recurring.name));
  const last = await lastAmounts(rows.map((r) => r.id));
  const items = rows.map((r) => ({ ...r, nextOn: nextDay(r, today), lastAmountSen: last.get(r.id) ?? null }));
  let inSen = 0, outSen = 0;
  for (const r of items) {
    const a = r.amountSen ?? r.lastAmountSen; if (a == null || (r.endOn && r.endOn < today)) continue;
    if (r.kind === "income") inSen += perMonth(r.every as Every, a); else if (r.kind === "spend") outSen += perMonth(r.every as Every, a);
  }
  // Suggestions from the last 13 months, leaving out what's already recurring or dismissed.
  const [hist, dismissed] = await Promise.all([
    db.select({ on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId, categoryId: transactions.categoryId, description: transactions.description })
      .from(transactions).where(and(eq(transactions.userId, userId), gte(transactions.on, addDays(today, -400)))),
    db.select().from(recurringDismissed).where(eq(recurringDismissed.userId, userId)),
  ]);
  const taken = new Set([...dismissed.map((d) => d.key), ...rows.filter((r) => r.amountSen != null).map((r) => suggestionKey(r.name, r.accountId, r.amountSen!))]);
  return { today, items, perMonth: { inSen, outSen }, suggestions: suggestions(hist, today.slice(0, 7), taken).slice(0, 8) };
}

/** Home: what's due (up to today, not added or skipped) and what's coming in the next 7 days. */
export async function dueRecurring(userId: string) {
  const today = todayIn();
  const rows = await db.select().from(recurring).where(eq(recurring.userId, userId));
  const { m } = await doneDays(rows.map((r) => r.id));
  const due = rows.flatMap((r) => dueDays(r, began(r), m.get(r.id) ?? new Set(), today).map((dueOn) => ({ id: r.id, dueOn, name: r.name, kind: r.kind, amountSen: r.amountSen, accountId: r.accountId, toAccountId: r.toAccountId, categoryId: r.categoryId, every: r.every })))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.name.localeCompare(b.name));
  const coming = rows.flatMap((r) => comingUp(r, today).map((on) => ({ id: r.id, on, name: r.name, kind: r.kind, amountSen: r.amountSen, accountId: r.accountId, toAccountId: r.toAccountId })))
    .sort((a, b) => a.on.localeCompare(b.on));
  return { today, due, coming };
}

function amountOf(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? v : bad("Amounts must be whole sen above 0.");
  const s = parseRupiah(String(v)); return s === null || s <= 0 ? bad(`"${String(v)}" isn't an amount.`) : s;
}
async function clean(userId: string, body: Record<string, unknown>, cur?: Row) {
  const pick = <K extends keyof Row>(k: K, b: string) => (b in body ? body[b] : cur?.[k]);
  const name = String(pick("name", "name") ?? "").trim();
  if (!name || name.length > 60) bad("Give it a name (up to 60 characters).");
  const kind = String(pick("kind", "kind") ?? "");
  if (!["spend", "income", "transfer"].includes(kind)) bad("Spend, income or transfer.");
  const amountSen = "amount" in body || "amountSen" in body ? amountOf(body.amountSen ?? body.amount) : cur?.amountSen ?? null;
  const every = String(pick("every", "every") ?? "month");
  if (!["month", "week", "year"].includes(every)) bad("Monthly, weekly or yearly.");
  const anchorOn = pick("anchorOn", "anchorOn"); if (!isDay(anchorOn)) bad("Pick the first day, like 2026-12-01.");
  const endRaw = pick("endOn", "endOn"), endOn = endRaw == null || endRaw === "" ? null : endRaw;
  if (endOn !== null && (!isDay(endOn) || endOn < (anchorOn as string))) bad("The end can't be before the first day.");
  const accountId = String(pick("accountId", "accountId") ?? "");
  const toAccountId = kind === "transfer" ? String(pick("toAccountId", "toAccountId") ?? "") || null : null;
  const categoryId = kind === "transfer" ? null : String(pick("categoryId", "categoryId") ?? "") || null;
  // The same checks as a transaction (owner's accounts and category, the right kinds, a transfer's two accounts).
  const [accs, cats] = await Promise.all([
    db.select({ id: moneyAccounts.id, archived: moneyAccounts.archived }).from(moneyAccounts).where(eq(moneyAccounts.userId, userId)),
    db.select({ id: categories.id, kind: categories.kind, active: categories.active }).from(categories).where(eq(categories.userId, userId)),
  ]);
  const p = txnProblem({ kind, amountSen: amountSen ?? 100, on: anchorOn as string, accountId, toAccountId, categoryId }, accs, cats); if (p) bad(p);
  return { name, kind: kind as Row["kind"], amountSen, every: every as Every, anchorOn: anchorOn as string, endOn: endOn as string | null, accountId, toAccountId, categoryId };
}

export async function createRecurring(userId: string, body: Record<string, unknown>) {
  const c = await clean(userId, body);
  const [r] = await db.insert(recurring).values({ userId, ...c }).returning();
  return { ...r, nextOn: nextDay(r, todayIn()) };
}
export async function updateRecurring(userId: string, id: string, body: Record<string, unknown>) {
  const cur = await own(userId, id);
  const c = await clean(userId, body, cur);
  const [r] = await db.update(recurring).set(c).where(eq(recurring.id, id)).returning();
  return { ...r, nextOn: nextDay(r, todayIn()) };
}
/** Deleting keeps the transactions already added. */
export async function deleteRecurring(userId: string, id: string) {
  await own(userId, id);
  await db.delete(recurring).where(eq(recurring.id, id));
  return { ok: true };
}

async function claim(userId: string, id: string, dueOnIn: unknown) {
  const r = await own(userId, id);
  const today = todayIn();
  if (!isDay(dueOnIn)) bad("Which day?");
  const dueOn = dueOnIn as string;
  const { m } = await doneDays([r.id]);
  if (m.get(r.id)?.has(dueOn)) bad("That day is already done.", 409);
  if (!dueDays(r, began(r), new Set(), today).includes(dueOn)) bad("That day isn't due.", 409);
  // The unique (item, day) row claims the day: a second tap, or another tab, gets 409.
  const [run] = await db.insert(recurringRuns).values({ recurringId: r.id, dueOn }).onConflictDoNothing().returning();
  if (!run) bad("That day is already done.", 409);
  return { r, run: run!, dueOn };
}

/** Adds a due day as an ordinary transaction, once only. */
export async function addRecurring(userId: string, id: string, body: Record<string, unknown>) {
  const { r, run, dueOn } = await claim(userId, id, body.dueOn);
  try {
    const amountSen = r.amountSen ?? amountOf(body.amountSen ?? body.amount) ?? bad("Enter the amount for this one.");
    const txn = await createTransaction(userId, { kind: r.kind, amountSen, on: dueOn, accountId: r.accountId, toAccountId: r.toAccountId, categoryId: r.categoryId, description: r.name });
    await db.update(recurringRuns).set({ txnId: txn.id }).where(eq(recurringRuns.id, run.id));
    return { dueOn, transaction: txn };
  } catch (e) {
    await db.delete(recurringRuns).where(eq(recurringRuns.id, run.id)); // nothing half-done: the day is due again
    throw e;
  }
}

export async function skipRecurring(userId: string, id: string, body: Record<string, unknown>) {
  const { run, dueOn } = await claim(userId, id, body.dueOn);
  await db.update(recurringRuns).set({ skipped: true }).where(eq(recurringRuns.id, run.id));
  return { dueOn, skipped: true };
}

export async function dismissSuggestion(userId: string, body: Record<string, unknown>) {
  const key = String(body.key ?? "").slice(0, 300);
  if (!key.includes("|")) bad("Which suggestion?");
  await db.insert(recurringDismissed).values({ userId, key }).onConflictDoNothing();
  return { ok: true };
}
