// Bank statements (FINNY-71). The browser reads the PDF and sorts its lines (statement-rule.ts, statement-match.ts);
// the server gives it what matching needs and saves the confirmed lines as one statement batch, undoable like an
// import. A statement file (its SHA-256) is saved once. Every query is scoped to the owner.
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { importBatches, moneyAccounts, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { addImportRows } from "@/lib/imports";
import { asBalance } from "@/lib/checkpoint-rule";

const bad = (m: string, status = 400): never => { throw new HttpError(status, m); };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const BANKS = ["bca", "mandiri", "krom", "bri-card", "bca-card", "mandiri-card"] as const;
const shift = (day: string, n: number) => new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);

async function ownAccount(userId: string, id: string) {
  const [a] = await db.select().from(moneyAccounts).where(and(eq(moneyAccounts.userId, userId), eq(moneyAccounts.id, id)));
  return a ?? bad("Account not found.", 404);
}

/** What the browser needs to sort a statement: the account's balance on the last day, entries around the period, history. */
export async function statementContext(userId: string, ownerName: string | null, q: URLSearchParams) {
  const accountId = q.get("accountId") ?? "", from = q.get("from"), to = q.get("to"), hash = q.get("hash");
  if (!isDay(from) || !isDay(to) || from > to) bad("from and to must be days like 2026-10-01.");
  const acc = await ownAccount(userId, accountId);
  const [sums] = await db.select({
    inn: sql<string>`coalesce(sum(case when (${transactions.kind} = 'income' and ${transactions.accountId} = ${acc.id}) or (${transactions.kind} = 'transfer' and ${transactions.toAccountId} = ${acc.id}) then ${transactions.amountSen} else 0 end), 0)`,
    out: sql<string>`coalesce(sum(case when ${transactions.kind} in ('spend', 'transfer') and ${transactions.accountId} = ${acc.id} then ${transactions.amountSen} else 0 end), 0)`,
  }).from(transactions).where(and(eq(transactions.userId, userId), lte(transactions.on, to!), or(eq(transactions.accountId, acc.id), eq(transactions.toAccountId, acc.id))));
  const balanceEndSen = acc.openingOn <= to! ? acc.openingSen + Number(sums.inn) - Number(sums.out) : 0;
  const existing = await db.select({ id: transactions.id, on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId,
    toAccountId: transactions.toAccountId, description: transactions.description }).from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.on, shift(from!, -7)), lte(transactions.on, shift(to!, 7))));
  const history = await db.select({ description: transactions.description, categoryId: transactions.categoryId, on: transactions.on }).from(transactions)
    .where(eq(transactions.userId, userId)).orderBy(desc(transactions.on)).limit(3000);
  const [already] = hash ? await db.select({ id: importBatches.id, createdAt: importBatches.createdAt, closingSen: importBatches.closingSen }).from(importBatches).where(and(eq(importBatches.userId, userId), eq(importBatches.fileHash, hash))) : [];
  // FINNY-212: a statement saved before v0.23.0 has no dates for "Check with statements" yet (hasDates false).
  return { balanceEndSen, existing, history, ownerName, alreadyRead: already ? { id: already.id, createdAt: already.createdAt, hasDates: already.closingSen !== null } : null };
}

type InLine = { on: string; kind: string; sen: number; accountId: string; toAccountId?: string | null; categoryId?: string | null; description?: string; note?: string | null };

/** Saves the confirmed lines of one statement as a batch (kind statement); the same file again is refused (409). */
export async function saveStatement(userId: string, body: Record<string, unknown>) {
  const accountId = String(body.accountId ?? "");
  const acc = await ownAccount(userId, accountId);
  const bank = String(body.bank ?? "");
  if (!(BANKS as readonly string[]).includes(bank)) bad("Unknown bank.");
  const periodFrom = isDay(body.periodFrom) ? body.periodFrom : bad("The statement's period is missing.");
  const periodTo = isDay(body.periodTo) ? body.periodTo : bad("The statement's period is missing.");
  const fileHash = typeof body.fileHash === "string" && /^[0-9a-f]{64}$/.test(body.fileHash) ? body.fileHash : bad("The file's fingerprint is missing.");
  const { openingSen, closingSen } = figures(acc.type, body);
  const lines = (Array.isArray(body.lines) ? body.lines : []) as InLine[];
  if (!lines.length) bad("Choose at least one line to save.");
  if (lines.length > 2000) bad("That's more lines than a month's statement holds.");
  for (const l of lines) if (l.accountId !== acc.id && l.toAccountId !== acc.id) bad("Every line must belong to the statement's account.");
  const [dup] = await db.select({ id: importBatches.id }).from(importBatches).where(and(eq(importBatches.userId, userId), eq(importBatches.fileHash, fileHash)));
  if (dup) bad("This statement was saved before. Undo it first to read it again.", 409);
  const source = `${body.bankName ? String(body.bankName).slice(0, 40) : bank} · ${periodFrom} to ${periodTo}`;
  let batch;
  try {
    [batch] = await db.insert(importBatches).values({ userId, source, kind: "statement", accountId: acc.id, bank, periodFrom, periodTo, fileHash, openingSen, closingSen }).returning();
  } catch (e) {
    if ((e as { code?: string; cause?: { code?: string } }).code === "23505" || (e as { cause?: { code?: string } }).cause?.code === "23505") bad("This statement was saved before. Undo it first to read it again.", 409);
    throw e;
  }
  try {
    let added = 0, skipped = 0;
    for (let i = 0; i < lines.length; i += 500) {
      const chunk = lines.slice(i, i + 500).map((l) => ({ ...l, description: [l.description, l.note].filter(Boolean).join(" · ") }));
      const r = await addImportRows(userId, batch.id, { rows: chunk });
      added += r.added; skipped += r.skipped;
    }
    const [done] = await db.update(importBatches).set({ finishedAt: new Date() }).where(eq(importBatches.id, batch.id)).returning();
    return { batch: done, added, skipped };
  } catch (e) {
    // Nothing half-saved: drop what this batch added.
    await db.delete(transactions).where(and(eq(transactions.userId, userId), eq(transactions.importBatchId, batch.id)));
    await db.delete(importBatches).where(eq(importBatches.id, batch.id));
    throw e;
  }
}

/** FINNY-212: the statement's own balances (as the bank prints them), kept as Finny balances for the account (a card bill negative). */
function figures(type: string, body: Record<string, unknown>) {
  const one = (v: unknown) => (v === undefined || v === null ? null : Number.isSafeInteger(v) && Math.abs(v as number) < 1e15 ? asBalance(type, v as number) : bad("A statement balance must be a whole number of sen."));
  return { openingSen: one(body.openingSen), closingSen: one(body.closingSen) };
}

/** FINNY-212: a statement saved before v0.23.0, uploaded again: add its dates for "Check with statements" without saving its lines again. */
export async function addStatementDates(userId: string, body: Record<string, unknown>) {
  const fileHash = typeof body.fileHash === "string" && /^[0-9a-f]{64}$/.test(body.fileHash) ? body.fileHash : bad("The file's fingerprint is missing.");
  const [b] = await db.select().from(importBatches).where(and(eq(importBatches.userId, userId), eq(importBatches.fileHash, fileHash)));
  if (!b || !b.accountId) bad("This statement hasn't been saved.", 404);
  const acc = await ownAccount(userId, b!.accountId!);
  const f = figures(acc.type, body);
  if (f.closingSen === null) bad("This statement has no closing balance to add.");
  const [done] = await db.update(importBatches).set(f).where(eq(importBatches.id, b!.id)).returning();
  return { batch: done };
}
