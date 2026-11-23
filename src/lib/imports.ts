// Workbook imports (FINNY-48). The browser reads the workbook and builds the plan (import-rule.ts); the server creates a
// batch with the accounts and categories, takes the transactions in chunks (skipping what's already in Finny), and can
// undo a batch exactly. Every query is scoped to the owner.
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, entities, importBatches, moneyAccounts, transactions, ACCOUNT_TYPES } from "@/db/schema";
import { HttpError } from "@/lib/session";

const bad = (m: string): never => { throw new HttpError(400, m); };
const s = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isDay = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const int = (v: unknown) => (Number.isSafeInteger(v) ? (v as number) : bad("Amounts must be whole sen."));

type InAccount = { key: string; name: string; type: string; openingSen: number; openingOn: string; limitSen: number | null };
type InCategory = { key: string; kind: "income" | "expense"; path: string[] };

/** Starts an import: matches or creates the accounts and categories; returns their ids by the plan's keys. */
export async function startImport(userId: string, body: Record<string, unknown>) {
  const source = s(body.source, 200) || "workbook";
  const inAccounts = (Array.isArray(body.accounts) ? body.accounts : []) as InAccount[];
  const inCats = (Array.isArray(body.categories) ? body.categories : []) as InCategory[];
  if (inAccounts.length > 200 || inCats.length > 1000) bad("That's more than a workbook should hold.");
  const [batch] = await db.insert(importBatches).values({ userId, source }).returning();
  const existingAcc = await db.select().from(moneyAccounts).where(eq(moneyAccounts.userId, userId));
  const accIds: Record<string, string> = {}; let newAccounts = 0, matchedAccounts = 0;
  let pos = existingAcc.reduce((m, a) => Math.max(m, a.position), 0);
  for (const a of inAccounts) {
    const name = s(a.name, 80) || bad("An account needs a name.");
    const found = existingAcc.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (found) { accIds[a.key] = found.id; matchedAccounts++; continue; }
    if (!(ACCOUNT_TYPES as readonly string[]).includes(a.type)) bad(`Unknown account type "${a.type}".`);
    if (!isDay(a.openingOn)) bad("An opening date is missing.");
    const [row] = await db.insert(moneyAccounts).values({ userId, name, type: a.type as (typeof ACCOUNT_TYPES)[number], openingSen: int(a.openingSen), openingOn: a.openingOn,
      limitSen: a.limitSen == null ? null : int(a.limitSen), position: ++pos, importBatchId: batch.id }).returning();
    accIds[a.key] = row.id; newAccounts++;
  }
  // Categories: a leaf that already exists (same kind and name, anywhere) is matched; otherwise the path is created,
  // reusing groups with the same kind, parent and name.
  const cats = await db.select().from(categories).where(eq(categories.userId, userId));
  const catIds: Record<string, string> = {}; let newCats = 0, matchedCats = 0;
  for (const c of inCats) {
    if (c.kind !== "income" && c.kind !== "expense") bad("Unknown category kind.");
    const path = (Array.isArray(c.path) ? c.path : []).map((p) => s(p, 80)).filter(Boolean).slice(0, 3);
    if (!path.length) bad("A category needs a name.");
    const leaf = path[path.length - 1];
    const existing = cats.find((x) => x.kind === c.kind && x.name.toLowerCase() === leaf.toLowerCase());
    if (existing) { catIds[c.key] = existing.id; matchedCats++; continue; }
    let parent: string | null = null;
    for (const name of path) {
      let node = cats.find((x) => x.kind === c.kind && x.parentId === parent && x.name.toLowerCase() === name.toLowerCase());
      if (!node) { [node] = await db.insert(categories).values({ userId, kind: c.kind, name, parentId: parent, importBatchId: batch.id }).returning(); cats.push(node); newCats++; }
      parent = node.id;
    }
    catIds[c.key] = parent!;
  }
  await db.update(importBatches).set({ accounts: newAccounts, categories: newCats }).where(eq(importBatches.id, batch.id));
  return { batchId: batch.id, accounts: accIds, categories: catIds, newAccounts, matchedAccounts, newCategories: newCats, matchedCategories: matchedCats };
}

type InRow = { on: string; kind: string; sen: number; accountId: string; toAccountId?: string | null; categoryId?: string | null; description?: string; entity?: string | null };

/** Adds up to 500 rows to a batch; a row already in Finny (same account, day, amount, description) is skipped. */
export async function addImportRows(userId: string, batchId: string, body: Record<string, unknown>) {
  const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)));
  if (!batch) bad("Import not found.");
  if (batch.finishedAt) bad("This import is already finished.");
  const rows = (Array.isArray(body.rows) ? body.rows : []) as InRow[];
  if (rows.length > 500) bad("Send at most 500 rows at a time.");
  if (!rows.length) return { added: 0, skipped: 0 };
  const accs = new Set((await db.select({ id: moneyAccounts.id }).from(moneyAccounts).where(eq(moneyAccounts.userId, userId))).map((a) => a.id));
  const cats = new Map((await db.select({ id: categories.id, kind: categories.kind }).from(categories).where(eq(categories.userId, userId))).map((c) => [c.id, c.kind]));
  for (const r of rows) {
    if (!isDay(r.on)) bad("A row has no date.");
    if (!Number.isSafeInteger(r.sen) || r.sen <= 0) bad("A row has no amount.");
    if (!accs.has(r.accountId)) bad("A row names an unknown account.");
    if (r.kind === "transfer") { if (!r.toAccountId || !accs.has(r.toAccountId) || r.toAccountId === r.accountId) bad("A transfer needs two different accounts."); }
    else if (r.kind === "spend" || r.kind === "income") {
      const k = r.categoryId ? cats.get(r.categoryId) : undefined;
      if (!k || (r.kind === "income") !== (k === "income")) bad("A row names an unknown or wrong-kind category.");
    } else bad("A row has an unknown kind.");
  }
  // What's already in Finny for these days.
  const days = rows.map((r) => r.on).sort();
  const have = await db.select({ accountId: transactions.accountId, on: transactions.on, amountSen: transactions.amountSen, description: transactions.description }).from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.on, days[0]), lte(transactions.on, days[days.length - 1])));
  const key = (a: string, on: string, sen: number, d: string) => `${a}|${on}|${sen}|${d.trim().toLowerCase()}`;
  const seen = new Set(have.map((h) => key(h.accountId, h.on, h.amountSen, h.description)));
  const fresh = rows.filter((r) => { const k = key(r.accountId, r.on, r.sen, s(r.description, 300)); if (seen.has(k)) return false; seen.add(k); return true; });
  // People and places.
  const names = [...new Set(fresh.map((r) => s(r.entity, 80)).filter(Boolean))];
  const ents = new Map<string, string>();
  if (names.length) {
    const all = await db.select().from(entities).where(eq(entities.userId, userId));
    for (const e of all) ents.set(e.name.toLowerCase(), e.id);
    const missing = names.filter((n) => !ents.has(n.toLowerCase()));
    if (missing.length) for (const e of await db.insert(entities).values(missing.map((name) => ({ userId, name }))).returning()) ents.set(e.name.toLowerCase(), e.id);
  }
  if (fresh.length) await db.insert(transactions).values(fresh.map((r) => ({
    userId, on: r.on, kind: r.kind as "spend" | "income" | "transfer", amountSen: r.sen, accountId: r.accountId,
    toAccountId: r.kind === "transfer" ? r.toAccountId! : null, categoryId: r.kind === "transfer" ? null : r.categoryId!,
    description: s(r.description, 300), entityId: r.entity ? ents.get(s(r.entity, 80).toLowerCase()) ?? null : null, importBatchId: batchId,
  })));
  const skipped = rows.length - fresh.length;
  await db.update(importBatches).set({ txns: sql`${importBatches.txns} + ${fresh.length}`, skipped: sql`${importBatches.skipped} + ${skipped}` }).where(eq(importBatches.id, batchId));
  return { added: fresh.length, skipped };
}

/** Finishes an import: closes the accounts the workbook marks CLOSED. */
export async function finishImport(userId: string, batchId: string, body: Record<string, unknown>) {
  const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)));
  if (!batch) bad("Import not found.");
  const archive = (Array.isArray(body.archive) ? body.archive : []).map(String);
  if (archive.length) await db.update(moneyAccounts).set({ archived: true }).where(and(eq(moneyAccounts.userId, userId), inArray(moneyAccounts.id, archive), eq(moneyAccounts.importBatchId, batchId)));
  const [done] = await db.update(importBatches).set({ finishedAt: new Date() }).where(eq(importBatches.id, batchId)).returning();
  return done;
}

export const listImports = (userId: string) => db.select().from(importBatches).where(eq(importBatches.userId, userId)).orderBy(desc(importBatches.createdAt));

/** Undoes an import: its transactions, then the accounts and categories it created that nothing else uses now. */
export async function undoImport(userId: string, batchId: string) {
  const [batch] = await db.select().from(importBatches).where(and(eq(importBatches.id, batchId), eq(importBatches.userId, userId)));
  if (!batch) bad("Import not found.");
  const gone = await db.delete(transactions).where(and(eq(transactions.userId, userId), eq(transactions.importBatchId, batchId))).returning({ id: transactions.id });
  let accounts = 0, cats = 0;
  for (const a of await db.select().from(moneyAccounts).where(and(eq(moneyAccounts.userId, userId), eq(moneyAccounts.importBatchId, batchId)))) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(transactions).where(and(eq(transactions.userId, userId), sql`(${transactions.accountId} = ${a.id} or ${transactions.toAccountId} = ${a.id})`));
    if (Number(n) === 0) { await db.delete(moneyAccounts).where(eq(moneyAccounts.id, a.id)); accounts++; }
  }
  // Leaves first, so a group goes once its children are gone.
  for (let pass = 0; pass < 4; pass++) {
    for (const c of await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.importBatchId, batchId)))) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(transactions).where(eq(transactions.categoryId, c.id));
      const [{ k }] = await db.select({ k: sql<number>`count(*)` }).from(categories).where(eq(categories.parentId, c.id));
      if (Number(n) === 0 && Number(k) === 0) { await db.delete(categories).where(eq(categories.id, c.id)); cats++; }
    }
  }
  await db.delete(importBatches).where(eq(importBatches.id, batchId));
  return { removed: gone.length, accounts, categories: cats };
}

/** The days and amounts already in Finny between two days (so the wealth log only offers what's missing). */
export async function existingKeys(userId: string, from: string, to: string) {
  if (!isDay(from) || !isDay(to)) bad("from and to must be days like 2024-06-01");
  return db.select({ on: transactions.on, sen: transactions.amountSen }).from(transactions).where(and(eq(transactions.userId, userId), gte(transactions.on, from), lte(transactions.on, to)));
}
