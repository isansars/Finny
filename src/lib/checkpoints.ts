// FINNY-212: "Check with statements" for one account, and "Possible doubles" across all of them. Owner-scoped.
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { importBatches, moneyAccounts, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { checkpoints } from "@/lib/checkpoint-rule";
import { findDoubles } from "@/lib/doubles-rule";

const bad = (m: string, status = 400): never => { throw new HttpError(status, m); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function accountCheckpoints(userId: string, id: string) {
  if (!UUID.test(id)) bad("Account not found.", 404);
  const [acc] = await db.select().from(moneyAccounts).where(and(eq(moneyAccounts.userId, userId), eq(moneyAccounts.id, id)));
  if (!acc) bad("Account not found.", 404);
  const txns = await db.select({ on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId, toAccountId: transactions.toAccountId })
    .from(transactions).where(and(eq(transactions.userId, userId), or(eq(transactions.accountId, id), eq(transactions.toAccountId, id))));
  const batches = await db.select({ id: importBatches.id, periodFrom: importBatches.periodFrom, periodTo: importBatches.periodTo, openingSen: importBatches.openingSen, closingSen: importBatches.closingSen })
    .from(importBatches).where(and(eq(importBatches.userId, userId), eq(importBatches.accountId, id), eq(importBatches.kind, "statement")));
  const c = checkpoints(acc!, txns, batches);
  return { account: { id: acc!.id, name: acc!.name, type: acc!.type }, statements: batches.length, withoutDates: batches.filter((b) => b.closingSen === null).length, ...c };
}

export async function listDoubles(userId: string) {
  const accs = await db.select({ id: moneyAccounts.id, name: moneyAccounts.name, type: moneyAccounts.type }).from(moneyAccounts).where(eq(moneyAccounts.userId, userId));
  const cardBills = new Set((await db.select({ id: importBatches.id }).from(importBatches)
    .where(and(eq(importBatches.userId, userId), isNotNull(importBatches.bank), inArray(importBatches.bank, ["bri-card", "bca-card", "mandiri-card"])))).map((b) => b.id));
  const rows = await db.select({ id: transactions.id, on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId, toAccountId: transactions.toAccountId,
    description: transactions.description, looksOk: transactions.looksOk, createdAt: transactions.createdAt, importBatchId: transactions.importBatchId }).from(transactions).where(eq(transactions.userId, userId));
  const type = new Map(accs.map((a) => [a.id, a.type])), name = new Map(accs.map((a) => [a.id, a.name]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const found = findDoubles(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), fromCardBill: !!r.importBatchId && cardBills.has(r.importBatchId) })), (id) => type.get(id) ?? "");
  const view = (id: string) => { const r = byId.get(id)!; return { id, on: r.on, kind: r.kind, amountSen: r.amountSen, description: r.description, account: name.get(r.accountId) ?? "", toAccount: r.toAccountId ? name.get(r.toAccountId) ?? "" : null }; };
  return { doubles: found.map((d) => ({ ...d, remove: view(d.removeId), keep: view(d.keepId) })) };
}
