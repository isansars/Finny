// FINNY-171: every transaction, to check. The table's rows for a filter (with Finny's guesses, where each came from, the
// count and totals), and changes to several at once. Every query is scoped to the owner.
import { and, desc, eq, gte, ilike, inArray, lt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { categories, entities, importBatches, moneyAccounts, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { listCategories } from "@/lib/data";
import { checkFlags, USUAL_DAYS, type Flag } from "@/lib/check-rule";
import { senToPlain, toCsv } from "@/lib/csv";

const bad = (m: string, status = 400): never => { throw new HttpError(status, m); };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const shift = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);

export type Source = "typed" | "statement" | "workbook";
export type TableFilter = { from?: string | null; to?: string | null; month?: string | null; accountId?: string | null; categoryId?: string | null; kind?: string | null; source?: string | null; q?: string | null; sort?: string | null; look?: boolean; offset?: number; limit?: number };
export type TableRow = { id: string; on: string; kind: "spend" | "income" | "transfer"; amountSen: number; accountId: string; toAccountId: string | null; categoryId: string | null; description: string; note: string | null; entity: string | null; looksOk: boolean; source: Source; flags: Flag[] };

export function filterFrom(q: URLSearchParams): TableFilter {
  return { from: q.get("from"), to: q.get("to"), month: q.get("month"), accountId: q.get("account"), categoryId: q.get("category"), kind: q.get("kind"), source: q.get("source"), q: q.get("q"), sort: q.get("sort"), look: q.get("look") === "1", offset: Number(q.get("offset")) || 0, limit: Number(q.get("limit")) || undefined };
}

/** Every row matching the filter (all of them: one owner has thousands, not millions), flagged, sorted; the page asked for. */
export async function tableTransactions(userId: string, f: TableFilter) {
  const where = [eq(transactions.userId, userId)];
  if (f.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(f.month)) bad("month must look like 2026-11");
    const [y, m] = f.month.split("-").map(Number); const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    where.push(gte(transactions.on, `${f.month}-01`), lt(transactions.on, next));
  }
  if (f.from) { if (!isDay(f.from)) bad("from must be a day like 2026-11-01"); where.push(gte(transactions.on, f.from)); }
  if (f.to) { if (!isDay(f.to)) bad("to must be a day like 2026-11-30"); where.push(lte(transactions.on, f.to)); }
  if (f.accountId) where.push(or(eq(transactions.accountId, f.accountId), eq(transactions.toAccountId, f.accountId))!);
  if (f.categoryId) {
    const all = await listCategories(userId);
    const ids = [f.categoryId]; for (let i = 0; i < ids.length; i++) for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
    where.push(inArray(transactions.categoryId, ids));
  }
  if (f.kind) { if (!["spend", "income", "transfer"].includes(f.kind)) bad("kind must be spend, income or transfer"); where.push(eq(transactions.kind, f.kind as "spend")); }
  if (f.q?.trim()) { const like = `%${f.q.trim().replace(/[%_\\]/g, "\\$&")}%`; where.push(or(ilike(transactions.description, like), ilike(transactions.note, like), ilike(entities.name, like))!); }
  if (f.source && !["typed", "statement", "workbook"].includes(f.source)) bad("source must be typed, statement or workbook");
  const sort = f.sort ?? "-date";
  if (!["date", "-date", "amount", "-amount"].includes(sort)) bad("sort must be date, -date, amount or -amount");

  const found = await db.select({ t: transactions, entity: entities.name, batchKind: importBatches.kind }).from(transactions)
    .leftJoin(entities, eq(entities.id, transactions.entityId)).leftJoin(importBatches, eq(importBatches.id, transactions.importBatchId))
    .where(and(...where)).orderBy(desc(transactions.on), desc(transactions.createdAt));
  const rows: TableRow[] = found.map(({ t, entity, batchKind }) => ({ id: t.id, on: t.on, kind: t.kind, amountSen: t.amountSen, accountId: t.accountId, toAccountId: t.toAccountId, categoryId: t.categoryId,
    description: t.description, note: t.note, entity, looksOk: t.looksOk, source: t.importBatchId ? (batchKind === "statement" ? "statement" : "workbook") : "typed", flags: [] }));

  // The guesses look at every transaction that could be a twin or set "the usual": the rows' days and the 90 before them.
  if (rows.length) {
    const days = rows.map((r) => r.on).sort();
    const history = await db.select({ id: transactions.id, on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId, toAccountId: transactions.toAccountId, categoryId: transactions.categoryId, looksOk: transactions.looksOk })
      .from(transactions).where(and(eq(transactions.userId, userId), gte(transactions.on, shift(days[0], -USUAL_DAYS)), lte(transactions.on, days[days.length - 1])));
    const flags = checkFlags(rows, history);
    for (const r of rows) r.flags = flags.get(r.id) ?? [];
  }

  const counts = { all: rows.length, look: rows.filter((r) => r.flags.length).length, typed: 0, statement: 0, workbook: 0 };
  for (const r of rows) counts[r.source]++;
  let shown = rows;
  if (f.source) shown = shown.filter((r) => r.source === f.source);
  if (f.look) shown = shown.filter((r) => r.flags.length);
  const dir = sort.startsWith("-") ? -1 : 1;
  if (sort.endsWith("amount")) shown = [...shown].sort((a, b) => dir * (a.amountSen - b.amountSen) || (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
  else if (dir === 1) shown = [...shown].reverse();
  const outSen = shown.filter((r) => r.kind === "spend").reduce((n, r) => n + r.amountSen, 0), inSen = shown.filter((r) => r.kind === "income").reduce((n, r) => n + r.amountSen, 0);
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 5000), offset = Math.max(Number(f.offset) || 0, 0);
  return { items: shown.slice(offset, offset + limit), count: shown.length, outSen, inSen, counts, more: offset + limit < shown.length };
}

/** The filtered rows as a spreadsheet (the same filter as the table, every row). */
export async function tableCsv(userId: string, f: TableFilter) {
  const { items } = await tableTransactions(userId, { ...f, offset: 0, limit: 5000 });
  const [accs, cats] = await Promise.all([db.select({ id: moneyAccounts.id, name: moneyAccounts.name }).from(moneyAccounts).where(eq(moneyAccounts.userId, userId)), listCategories(userId)]);
  const acc = new Map(accs.map((a) => [a.id, a.name])), cat = new Map(cats.map((c) => [c.id, c.name]));
  return toCsv(["date", "kind", "amount_rupiah", "account", "to_account", "category", "description", "place", "note", "from", "needs_a_look", "id"],
    items.map((r) => ({ date: r.on, kind: r.kind, amount_rupiah: senToPlain(r.amountSen), account: acc.get(r.accountId), to_account: r.toAccountId ? acc.get(r.toAccountId) : "", category: r.categoryId ? cat.get(r.categoryId) : "",
      description: r.description, place: r.entity, note: r.note, from: r.source, needs_a_look: r.flags.map((x) => (x.kind === "twice" ? "twice" : `${x.times}x usual`)).join(" "), id: r.id })));
}

/** Several at once: delete, change category (spend and income rows whose kind fits it; others are left), or mark as looking fine.
 *  All or nothing, and only the owner's rows: one id that isn't theirs refuses the whole request. */
export async function bulkTransactions(userId: string, body: Record<string, unknown>) {
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(String))] : [];
  if (!ids.length || ids.length > 500 || ids.some((id) => !UUID.test(id))) bad("ids must be 1 to 500 transaction ids.");
  const action = String(body.action ?? "");
  if (!["delete", "category", "fine"].includes(action)) bad("action must be delete, category or fine.");
  let cat: { id: string; kind: string } | undefined;
  if (action === "category") {
    const id = String(body.categoryId ?? "");
    if (!UUID.test(id)) bad("Pick a category.");
    [cat] = await db.select({ id: categories.id, kind: categories.kind }).from(categories).where(and(eq(categories.userId, userId), eq(categories.id, id)));
    if (!cat) bad("Category not found.", 404);
  }
  return db.transaction(async (tx) => {
    const mine = await tx.select({ id: transactions.id, kind: transactions.kind }).from(transactions).where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
    if (mine.length !== ids.length) bad("Some of these transactions weren't found.", 404);
    if (action === "delete") { await tx.delete(transactions).where(and(eq(transactions.userId, userId), inArray(transactions.id, ids))); return { changed: ids.length, skipped: 0 }; }
    if (action === "fine") { await tx.update(transactions).set({ looksOk: true }).where(and(eq(transactions.userId, userId), inArray(transactions.id, ids))); return { changed: ids.length, skipped: 0 }; }
    const fits = mine.filter((t) => (cat!.kind === "income" ? t.kind === "income" : t.kind === "spend")).map((t) => t.id);
    if (fits.length) await tx.update(transactions).set({ categoryId: cat!.id }).where(and(eq(transactions.userId, userId), inArray(transactions.id, fits)));
    return { changed: fits.length, skipped: ids.length - fits.length };
  });
}
