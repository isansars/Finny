// The data layer. Every function takes the signed-in owner's id and every query is scoped to it (Shield).
import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, entities, moneyAccounts, transactions, ACCOUNT_TYPES, CATEGORY_KINDS } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { addFlow, balanceOf, cardView, type Flows } from "@/lib/balance-rule";
import { placeProblem, mergeProblem, type Cat } from "@/lib/category-rule";
import { txnProblem } from "@/lib/txn-rule";
import { suggestCategory } from "@/lib/suggest-rule";
import { parseRupiah } from "@/lib/money";
import { monthRange, todayIn } from "@/lib/dates";
import { STARTER } from "@/lib/starter-categories";
import { PALETTE } from "@/lib/category-look";
import { dashboard } from "@/lib/dashboard-rule";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const bad = (msg: string): never => { throw new HttpError(400, msg); };
/** An amount from a form ("43.890", "Rp 1.250.000") or an API client (amountSen). */
function senFrom(body: Record<string, unknown>, field: string, required: boolean): number | null | undefined {
  const senKey = `${field}Sen`;
  if (typeof body[senKey] === "number") return body[senKey] as number;
  if (body[field] === undefined || body[field] === null || body[field] === "") return required ? bad("Enter an amount.") : body[field] === undefined ? undefined : null;
  const v = parseRupiah(String(body[field]));
  return v === null ? bad(`"${String(body[field])}" isn't an amount.`) : v;
}

// ---------- accounts (FINNY-8)
export async function listAccounts(userId: string) {
  const rows = await db.select().from(moneyAccounts).where(eq(moneyAccounts.userId, userId)).orderBy(asc(moneyAccounts.position), asc(moneyAccounts.createdAt));
  const sums = await db.select({ kind: transactions.kind, accountId: transactions.accountId, toAccountId: transactions.toAccountId, total: sql<string>`sum(${transactions.amountSen})` })
    .from(transactions).where(eq(transactions.userId, userId)).groupBy(transactions.kind, transactions.accountId, transactions.toAccountId);
  const flows = new Map<string, Flows>();
  for (const s of sums) addFlow(flows, { kind: s.kind, accountId: s.accountId, toAccountId: s.toAccountId, amountSen: Number(s.total) });
  return rows.map((a) => {
    const balanceSen = balanceOf(a.openingSen, flows.get(a.id));
    return { ...a, balanceSen, ...(a.type === "card" || a.type === "loan" ? { card: cardView(balanceSen, a.limitSen) } : {}) };
  });
}

function accountFields(body: Record<string, unknown>, creating: boolean) {
  const out: Partial<typeof moneyAccounts.$inferInsert> = {};
  const name = str(body.name, 80);
  if (creating || name !== undefined) out.name = name || bad("Give the account a name.");
  if (creating || body.type !== undefined) out.type = (ACCOUNT_TYPES as readonly string[]).includes(String(body.type)) ? body.type as (typeof ACCOUNT_TYPES)[number] : bad("Choose an account type.");
  if (body.emoji !== undefined) out.emoji = str(body.emoji, 8) || null;
  const opening = senFrom(body, "opening", false);
  if (opening !== undefined) out.openingSen = opening ?? 0;
  if (body.openingOn !== undefined || creating) {
    const on = str(body.openingOn) || todayIn();
    out.openingOn = /^\d{4}-\d{2}-\d{2}$/.test(on) ? on : bad("Pick the opening date.");
  }
  const limit = senFrom(body, "limit", false);
  if (limit !== undefined) out.limitSen = limit;
  if (body.statementDay !== undefined) {
    const d = body.statementDay === null || body.statementDay === "" ? null : Number(body.statementDay);
    out.statementDay = d === null ? null : Number.isInteger(d) && d >= 1 && d <= 31 ? d : bad("The statement day is a day of the month (1–31).");
  }
  if (body.archived !== undefined) out.archived = Boolean(body.archived);
  if (body.position !== undefined) out.position = Number(body.position) || 0;
  return out;
}

export async function createAccount(userId: string, body: Record<string, unknown>) {
  const f = accountFields(body, true);
  const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${moneyAccounts.position}), 0) + 1` }).from(moneyAccounts).where(eq(moneyAccounts.userId, userId));
  const [row] = await db.insert(moneyAccounts).values({ ...(f as typeof moneyAccounts.$inferInsert), userId, position: f.position ?? Number(n) }).returning();
  return row;
}
export async function updateAccount(userId: string, id: string, body: Record<string, unknown>) {
  const [row] = await db.update(moneyAccounts).set(accountFields(body, false)).where(and(eq(moneyAccounts.id, id), eq(moneyAccounts.userId, userId))).returning();
  return row ?? bad("Account not found.");
}
/** Saves a new order: ids in the order the owner wants them. */
export async function reorderAccounts(userId: string, ids: unknown) {
  if (!Array.isArray(ids)) bad("Send the account ids in order.");
  await Promise.all((ids as string[]).map((id, i) => db.update(moneyAccounts).set({ position: i + 1 }).where(and(eq(moneyAccounts.id, String(id)), eq(moneyAccounts.userId, userId)))));
  return { ok: true };
}

// ---------- categories (FINNY-10)
export const listCategories = (userId: string) =>
  db.select().from(categories).where(eq(categories.userId, userId)).orderBy(asc(categories.kind), asc(categories.position), asc(categories.name));

/** The owner's chosen icon and colour (null = guess from the name again). */
function lookFields(body: Record<string, unknown>) {
  const out: { icon?: string | null; color?: string | null } = {};
  if (body.icon !== undefined) { const i = str(body.icon, 40) || null; if (i && !/^[a-z0-9-]+$/.test(i)) bad("Unknown icon."); out.icon = i; }
  if (body.color !== undefined) { const c = str(body.color, 20) || null; if (c && !PALETTE[c]) bad("Unknown colour."); out.color = c; }
  return out;
}
/** Categories with how often each was used in the last 90 days (quick add shows the most used first). */
export async function listCategoriesWithUse(userId: string) {
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const [cats, uses] = await Promise.all([listCategories(userId),
    db.select({ id: transactions.categoryId, n: sql<string>`count(*)` }).from(transactions).where(and(eq(transactions.userId, userId), gte(transactions.on, since))).groupBy(transactions.categoryId)]);
  const n = new Map(uses.map((u) => [u.id, Number(u.n)]));
  return cats.map((c) => ({ ...c, uses: n.get(c.id) ?? 0 }));
}

export async function createCategory(userId: string, body: Record<string, unknown>) {
  const all = await listCategories(userId);
  const kind = (CATEGORY_KINDS as readonly string[]).includes(String(body.kind)) ? String(body.kind) as (typeof CATEGORY_KINDS)[number] : bad("Choose Income, Expense, Saving or Investment.");
  const name = str(body.name, 80) || bad("Give the category a name.");
  const parentId = str(body.parentId) || null;
  const p = placeProblem("", kind, parentId, all as Cat[]); if (p) bad(p);
  if (all.some((c) => c.kind === kind && c.parentId === parentId && c.name.toLowerCase() === name.toLowerCase())) bad(`There's already a "${name}" there.`);
  const [row] = await db.insert(categories).values({ userId, kind, name, parentId, emoji: str(body.emoji, 8) || null, ...lookFields(body) }).returning();
  return row;
}
export async function updateCategory(userId: string, id: string, body: Record<string, unknown>) {
  const all = await listCategories(userId);
  const cat = all.find((c) => c.id === id) ?? bad("Category not found.");
  const set: Partial<typeof categories.$inferInsert> = {};
  if (body.name !== undefined) set.name = str(body.name, 80) || bad("Give the category a name.");
  if (body.emoji !== undefined) set.emoji = str(body.emoji, 8) || null;
  if (body.active !== undefined) set.active = Boolean(body.active);
  if (body.position !== undefined) set.position = Number(body.position) || 0;
  Object.assign(set, lookFields(body));
  if (body.parentId !== undefined) {
    const parentId = str(body.parentId) || null;
    const p = placeProblem(id, cat.kind, parentId, all as Cat[]); if (p) bad(p);
    set.parentId = parentId;
  }
  const [row] = await db.update(categories).set(set).where(and(eq(categories.id, id), eq(categories.userId, userId))).returning();
  return row;
}
/** Moves every transaction (and sub-category) of `id` to `into`, then removes `id`. */
export async function mergeCategory(userId: string, id: string, into: string) {
  const all = await listCategories(userId);
  const p = mergeProblem(id, into, all as Cat[]); if (p) bad(p);
  const kids = all.filter((c) => c.parentId === id);
  for (const k of kids) { const q = placeProblem(k.id, k.kind, into, all.map((c) => (c.id === k.id ? { ...c, parentId: into } : c)) as Cat[]); if (q) bad(`"${k.name}" can't move under the kept category: ${q}`); }
  const moved = await db.update(transactions).set({ categoryId: into }).where(and(eq(transactions.userId, userId), eq(transactions.categoryId, id))).returning({ id: transactions.id });
  if (kids.length) await db.update(categories).set({ parentId: into }).where(and(eq(categories.userId, userId), eq(categories.parentId, id)));
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  return { moved: moved.length };
}
/** Adds the starter tree, only when there are no categories yet. */
export async function addStarterCategories(userId: string) {
  if ((await listCategories(userId)).length) bad("You already have categories.");
  for (const [kind, groups] of Object.entries(STARTER) as [(typeof CATEGORY_KINDS)[number], [string, string[]][]][]) {
    for (const [i, [group, kids]] of groups.entries()) {
      const [g] = await db.insert(categories).values({ userId, kind, name: group, position: i }).returning();
      if (kids.length) await db.insert(categories).values(kids.map((name, j) => ({ userId, kind, name, parentId: g.id, position: j })));
    }
  }
  return listCategories(userId);
}
/** Removes a category nobody uses yet (else: merge it or switch it off). */
export async function deleteCategory(userId: string, id: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.categoryId, id)));
  if (Number(n) > 0) bad("This category has transactions: merge it into another or switch it off.");
  const [{ k }] = await db.select({ k: sql<number>`count(*)` }).from(categories).where(and(eq(categories.userId, userId), eq(categories.parentId, id)));
  if (Number(k) > 0) bad("Move or merge its sub-categories first.");
  await db.delete(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  return { ok: true };
}

// ---------- entities (who was paid / who paid)
async function entityId(userId: string, name: string | null | undefined): Promise<string | null> {
  const n = (name ?? "").trim().slice(0, 80);
  if (!n) return null;
  const [found] = await db.select().from(entities).where(and(eq(entities.userId, userId), ilike(entities.name, n.replace(/[%_\\]/g, "\\$&"))));
  if (found) return found.id;
  const [row] = await db.insert(entities).values({ userId, name: n }).returning();
  return row.id;
}
export const listEntities = (userId: string) => db.select().from(entities).where(eq(entities.userId, userId)).orderBy(asc(entities.name));

// ---------- transactions (FINNY-9)
async function context(userId: string) {
  const [accs, cats] = await Promise.all([
    db.select({ id: moneyAccounts.id, archived: moneyAccounts.archived }).from(moneyAccounts).where(eq(moneyAccounts.userId, userId)),
    db.select({ id: categories.id, kind: categories.kind, active: categories.active }).from(categories).where(eq(categories.userId, userId)),
  ]);
  return { accs, cats };
}
function txnFields(body: Record<string, unknown>, existing?: typeof transactions.$inferSelect) {
  const kind = body.kind !== undefined ? String(body.kind) : existing?.kind;
  const amountSen = body.amount !== undefined || body.amountSen !== undefined ? senFrom(body, "amount", true) : existing?.amountSen;
  const transfer = kind === "transfer";
  return {
    kind, amountSen,
    on: body.on !== undefined ? str(body.on) : existing?.on ?? todayIn(),
    accountId: body.accountId !== undefined ? str(body.accountId) : existing?.accountId,
    toAccountId: transfer ? (body.toAccountId !== undefined ? str(body.toAccountId) || null : existing?.toAccountId ?? null) : null,
    categoryId: transfer ? null : (body.categoryId !== undefined ? str(body.categoryId) || null : existing?.categoryId ?? null),
    description: body.description !== undefined ? str(body.description, 300) ?? "" : existing?.description ?? "",
    note: body.note !== undefined ? str(body.note, 1000) || null : existing?.note ?? null,
  };
}
export async function createTransaction(userId: string, body: Record<string, unknown>) {
  const f = txnFields(body);
  const { accs, cats } = await context(userId);
  const p = txnProblem(f, accs, cats); if (p) bad(p);
  const eId = await entityId(userId, str(body.entity, 80));
  const [row] = await db.insert(transactions).values({ ...(f as typeof transactions.$inferInsert), userId, entityId: eId }).returning();
  return row;
}
export async function updateTransaction(userId: string, id: string, body: Record<string, unknown>) {
  const [existing] = await db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId)));
  if (!existing) bad("Transaction not found.");
  const f = txnFields(body, existing);
  const { accs, cats } = await context(userId);
  const p = txnProblem(f, accs, cats, true); if (p) bad(p);
  const eId = body.entity !== undefined ? await entityId(userId, str(body.entity, 80)) : existing.entityId;
  const [row] = await db.update(transactions).set({ ...(f as Partial<typeof transactions.$inferInsert>), entityId: eId }).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).returning();
  return row;
}
export async function deleteTransaction(userId: string, id: string) {
  const gone = await db.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.userId, userId))).returning({ id: transactions.id });
  return gone.length ? { ok: true } : bad("Transaction not found.");
}

export type TxnFilter = { month?: string | null; accountId?: string | null; categoryId?: string | null; q?: string | null; limit?: number; offset?: number };
export async function listTransactions(userId: string, f: TxnFilter) {
  const where = [eq(transactions.userId, userId)];
  if (f.month) { const [a, b] = (() => { try { return monthRange(f.month!); } catch { return bad("month must look like 2026-11"); } })(); where.push(gte(transactions.on, a), lt(transactions.on, b)); }
  if (f.accountId) where.push(or(eq(transactions.accountId, f.accountId), eq(transactions.toAccountId, f.accountId))!);
  if (f.categoryId) {
    // A parent category includes its sub-categories.
    const all = await listCategories(userId);
    const ids = [f.categoryId]; for (let i = 0; i < ids.length; i++) for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
    where.push(inArray(transactions.categoryId, ids));
  }
  if (f.q) { const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`; where.push(or(ilike(transactions.description, like), ilike(transactions.note, like), ilike(entities.name, like))!); }
  const limit = Math.min(Math.max(Number(f.limit) || 200, 1), 500), offset = Math.max(Number(f.offset) || 0, 0);
  const rows = await db.select({ t: transactions, entity: entities.name }).from(transactions).leftJoin(entities, eq(entities.id, transactions.entityId))
    .where(and(...where)).orderBy(desc(transactions.on), desc(transactions.createdAt)).limit(limit + 1).offset(offset);
  return { items: rows.slice(0, limit).map((r) => ({ ...r.t, entity: r.entity })), more: rows.length > limit };
}

/** Totals for a month: income and spending (transfers excluded), by kind of category. */
export async function monthTotals(userId: string, month: string) {
  const [a, b] = monthRange(month);
  const rows = await db.select({ kind: transactions.kind, catKind: categories.kind, total: sql<string>`sum(${transactions.amountSen})` })
    .from(transactions).leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.userId, userId), gte(transactions.on, a), lt(transactions.on, b))).groupBy(transactions.kind, categories.kind);
  const out = { incomeSen: 0, spendSen: 0, savedSen: 0, investedSen: 0 };
  for (const r of rows) {
    const n = Number(r.total);
    if (r.kind === "income") out.incomeSen += n;
    else if (r.kind === "spend") { if (r.catKind === "saving") out.savedSen += n; else if (r.catKind === "investment") out.investedSen += n; else out.spendSen += n; }
  }
  return out;
}

/** The month at a glance (FINNY-42): every transaction of the month, summed by the pure rule. */
export async function monthDashboard(userId: string, month: string, accountId?: string | null) {
  const [a, b] = (() => { try { return monthRange(month); } catch { return bad("month must look like 2026-11"); } })();
  const where = [eq(transactions.userId, userId), gte(transactions.on, a), lt(transactions.on, b)];
  if (accountId) where.push(or(eq(transactions.accountId, accountId), eq(transactions.toAccountId, accountId))!);
  const [rows, cats] = await Promise.all([
    db.select({ t: transactions, entity: entities.name }).from(transactions).leftJoin(entities, eq(entities.id, transactions.entityId)).where(and(...where)),
    listCategories(userId),
  ]);
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return { month, days, ...dashboard(rows.map((r) => ({ ...r.t, entity: r.entity })), cats, days) };
}

export async function suggest(userId: string, q: string) {
  const history = await db.select({ description: transactions.description, categoryId: transactions.categoryId, on: transactions.on }).from(transactions)
    .where(eq(transactions.userId, userId)).orderBy(desc(transactions.on)).limit(3000);
  const id = suggestCategory(q, history);
  if (!id) return { categoryId: null };
  const [c] = await db.select({ id: categories.id, name: categories.name, active: categories.active }).from(categories).where(and(eq(categories.id, id), eq(categories.userId, userId)));
  return c?.active ? { categoryId: c.id, name: c.name } : { categoryId: null };
}

// ---------- export and delete (FINNY-24)
export async function exportRows(userId: string) {
  const [accs, cats, ents, txns] = await Promise.all([
    db.select().from(moneyAccounts).where(eq(moneyAccounts.userId, userId)),
    listCategories(userId), listEntities(userId),
    db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(asc(transactions.on)),
  ]);
  return { accs, cats, ents, txns };
}
export async function deleteEverything(userId: string) {
  await db.delete(transactions).where(eq(transactions.userId, userId));
  await db.delete(entities).where(eq(entities.userId, userId));
  await db.update(categories).set({ parentId: null }).where(eq(categories.userId, userId));
  await db.delete(categories).where(eq(categories.userId, userId));
  await db.delete(moneyAccounts).where(eq(moneyAccounts.userId, userId));
  return { ok: true };
}
