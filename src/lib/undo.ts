// FINNY-186: undo a delete. Deleting from the Transactions page moves the rows to a trash with one undo id, in the same
// database transaction; Undo puts them back exactly (same ids, every column), all or nothing. The trash keeps a day.
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import { categories, deletedTransactions, entities, moneyAccounts, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";

export const UNDO_FOR_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (m: string, status = 400): never => { throw new HttpError(status, m); };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The clock. QA builds (FINNY_QA=1, never production) may move it with an `x-finny-qa-now` header to test an expired undo. */
export function nowFor(req?: Request): Date {
  const qa = process.env.FINNY_QA === "1" ? req?.headers.get("x-finny-qa-now") : null;
  const t = qa ? Date.parse(qa) : NaN;
  return Number.isFinite(t) ? new Date(t) : new Date();
}

/** Inside a database transaction: copy the owner's rows to the trash under a new undo id, delete them, purge old trash. */
export async function trashTransactions(tx: Tx, userId: string, ids: string[], now = new Date()) {
  const rows = await tx.select().from(transactions).where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
  if (rows.length !== ids.length) bad("Some of these transactions weren't found.", 404);
  const undoId = crypto.randomUUID();
  await tx.delete(deletedTransactions).where(and(eq(deletedTransactions.userId, userId), lt(deletedTransactions.deletedAt, new Date(now.getTime() - UNDO_FOR_MS))));
  await tx.delete(deletedTransactions).where(and(eq(deletedTransactions.userId, userId), inArray(deletedTransactions.id, ids))); // an older trash copy of a row that was brought back
  await tx.insert(deletedTransactions).values(rows.map((r) => ({ ...r, undoId, deletedAt: now })));
  await tx.delete(transactions).where(and(eq(transactions.userId, userId), inArray(transactions.id, ids)));
  const outSen = rows.filter((r) => r.kind === "spend").reduce((n, r) => n + r.amountSen, 0);
  const inSen = rows.filter((r) => r.kind === "income").reduce((n, r) => n + r.amountSen, 0);
  return { changed: rows.length, skipped: 0, undoId, outSen, inSen };
}

/** One transaction deleted from the table, undoable. */
export async function deleteOneToTrash(userId: string, id: string, now = new Date()) {
  if (!UUID.test(id)) bad("Transaction not found.", 404);
  return db.transaction((tx) => trashTransactions(tx, userId, [id], now));
}

/** Put an undo's rows back, exactly as they were. Refuses (and changes nothing) if anything they need is gone. */
export async function undoDelete(userId: string, body: Record<string, unknown>, now = new Date()) {
  const undoId = String(body.undoId ?? "");
  if (!UUID.test(undoId)) bad("This undo wasn't found.", 404);
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(deletedTransactions).where(and(eq(deletedTransactions.userId, userId), eq(deletedTransactions.undoId, undoId)));
    if (!rows.length || rows.some((r) => now.getTime() - r.deletedAt.getTime() > UNDO_FOR_MS)) bad("This undo has expired or was already used.", 404);
    const accIds = [...new Set(rows.flatMap((r) => [r.accountId, r.toAccountId]).filter((x): x is string => !!x))];
    const catIds = [...new Set(rows.map((r) => r.categoryId).filter((x): x is string => !!x))];
    const accs = await tx.select({ id: moneyAccounts.id }).from(moneyAccounts).where(and(eq(moneyAccounts.userId, userId), inArray(moneyAccounts.id, accIds)));
    const cats = catIds.length ? await tx.select({ id: categories.id }).from(categories).where(and(eq(categories.userId, userId), inArray(categories.id, catIds))) : [];
    const missingAcc = accIds.length - accs.length, missingCat = catIds.length - cats.length;
    if (missingAcc || missingCat) {
      const what = [missingAcc && `${missingAcc === 1 ? "an account" : `${missingAcc} accounts`}`, missingCat && `${missingCat === 1 ? "a category" : `${missingCat} categories`}`].filter(Boolean).join(" and ");
      bad(`Can't bring ${rows.length === 1 ? "it" : "them"} back: ${what} ${rows.length === 1 ? "it" : "they"} used ${missingAcc + missingCat === 1 ? "was" : "were"} deleted since.`, 409);
    }
    const inUse = await tx.select({ id: transactions.id }).from(transactions).where(inArray(transactions.id, rows.map((r) => r.id)));
    if (inUse.length) bad("Can't bring them back: one of them is already back.", 409);
    const entIds = [...new Set(rows.map((r) => r.entityId).filter((x): x is string => !!x))];
    const ents = new Set(entIds.length ? (await tx.select({ id: entities.id }).from(entities).where(and(eq(entities.userId, userId), inArray(entities.id, entIds)))).map((e) => e.id) : []);
    await tx.insert(transactions).values(rows.map((t) => { const r = { ...t } as Partial<typeof t>; delete r.undoId; delete r.deletedAt; return r as Omit<typeof t, "undoId" | "deletedAt">; }).map((r) => ({ ...r, kind: r.kind as "spend" | "income" | "transfer", entityId: r.entityId && ents.has(r.entityId) ? r.entityId : null })));
    await tx.delete(deletedTransactions).where(and(eq(deletedTransactions.userId, userId), eq(deletedTransactions.undoId, undoId)));
    return { restored: rows.length, undoId };
  });
}

/** The owner's latest delete that can still be undone (for "Bring back N deleted"), or null. */
export async function lastUndo(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - UNDO_FOR_MS);
  const [latest] = await db.select({ undoId: deletedTransactions.undoId, deletedAt: deletedTransactions.deletedAt }).from(deletedTransactions)
    .where(and(eq(deletedTransactions.userId, userId), gte(deletedTransactions.deletedAt, since))).orderBy(desc(deletedTransactions.deletedAt)).limit(1);
  if (!latest) return null;
  const rows = await db.select({ kind: deletedTransactions.kind, amountSen: deletedTransactions.amountSen }).from(deletedTransactions)
    .where(and(eq(deletedTransactions.userId, userId), eq(deletedTransactions.undoId, latest.undoId)));
  return { undoId: latest.undoId, n: rows.length, deletedAt: latest.deletedAt.toISOString(),
    outSen: rows.filter((r) => r.kind === "spend").reduce((a, r) => a + r.amountSen, 0), inSen: rows.filter((r) => r.kind === "income").reduce((a, r) => a + r.amountSen, 0) };
}
