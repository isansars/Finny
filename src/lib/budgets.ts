// Budgets (FINNY-61). The month's lines come from budget-rule.ts; this file reads and writes the rows. Every query is
// scoped to the owner.
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories, incomePlans, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { parseRupiah } from "@/lib/money";
import { monthRange, shiftMonth, todayIn } from "@/lib/dates";
import { budgetLines, budgetTotals, daysLeft, incomePlanFor, monthsFor, quickFill } from "@/lib/budget-rule";

const bad = (m: string): never => { throw new HttpError(400, m); };
const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const monthOf = (v: unknown) => (isMonth(v) ? v : bad("month must look like 2026-11"));
const scopeOf = (v: unknown) => (v === "rest" || v === "every" ? v : "one") as "one" | "rest" | "every";
function amountOf(body: Record<string, unknown>): number {
  if (typeof body.amountSen === "number") return Number.isSafeInteger(body.amountSen) && body.amountSen >= 0 ? body.amountSen : bad("Amounts must be whole sen.");
  const v = parseRupiah(String(body.amount ?? ""));
  return v === null || v < 0 ? bad("Enter an amount.") : v;
}

async function spendingByCategory(userId: string, from: string, to: string) {
  const rows = await db.select({ categoryId: transactions.categoryId, total: sql<string>`sum(${transactions.amountSen})` }).from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.kind, "spend"), gte(transactions.on, from), lt(transactions.on, to))).groupBy(transactions.categoryId);
  return rows.filter((r) => r.categoryId).map((r) => ({ categoryId: r.categoryId!, amountSen: Number(r.total) }));
}

export async function getBudget(userId: string, monthIn: unknown) {
  const month = monthOf(monthIn);
  const [from, to] = monthRange(month);
  const [cats, rows, plans, spent, [inc]] = await Promise.all([
    db.select({ id: categories.id, kind: categories.kind, parentId: categories.parentId, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
    db.select({ categoryId: budgets.categoryId, month: budgets.month, amountSen: budgets.amountSen }).from(budgets).where(and(eq(budgets.userId, userId), inArray(budgets.month, [month, "*"]))),
    db.select({ month: incomePlans.month, amountSen: incomePlans.amountSen }).from(incomePlans).where(and(eq(incomePlans.userId, userId), inArray(incomePlans.month, [month, "*"]))),
    spendingByCategory(userId, from, to),
    db.select({ total: sql<string>`coalesce(sum(${transactions.amountSen}), 0)` }).from(transactions).where(and(eq(transactions.userId, userId), eq(transactions.kind, "income"), gte(transactions.on, from), lt(transactions.on, to))),
  ]);
  const lines = budgetLines(month, cats, rows, spent);
  return { month, daysLeft: daysLeft(month, todayIn()), lines, totals: budgetTotals(lines, incomePlanFor(month, plans)), incomeSen: Number(inc.total), incomeEvery: !plans.some((p) => p.month === month) && plans.some((p) => p.month === "*") };
}

async function ownExpenseCategory(userId: string, id: unknown) {
  const [c] = await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.id, String(id ?? ""))));
  if (!c) bad("Category not found.");
  if (c!.kind === "income") bad("Budgets are for spending, saving and investing; expected income is set on its own.");
  return c!;
}

/** Quick fill for one category: last month, the 3-month average (sub-categories included), and last year's budget. */
export async function budgetQuick(userId: string, q: URLSearchParams) {
  const month = monthOf(q.get("month")); const cat = await ownExpenseCategory(userId, q.get("categoryId"));
  const all = await db.select({ id: categories.id, parentId: categories.parentId }).from(categories).where(eq(categories.userId, userId));
  const ids = new Set([cat.id]); for (let n = 0; n < 4; n++) for (const c of all) if (c.parentId && ids.has(c.parentId)) ids.add(c.id);
  const from = monthRange(shiftMonth(month, -3))[0], to = monthRange(month)[1];
  const rows = await db.select({ m: sql<string>`to_char(${transactions.on}::date, 'YYYY-MM')`, total: sql<string>`sum(${transactions.amountSen})` }).from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.kind, "spend"), inArray(transactions.categoryId, [...ids]), gte(transactions.on, from), lt(transactions.on, to)))
    .groupBy(sql`to_char(${transactions.on}::date, 'YYYY-MM')`);
  const byMonth = new Map(rows.map((r) => [r.m, Number(r.total)]));
  const fill = quickFill(byMonth, month);
  const lastYear = shiftMonth(month, -12);
  const [ly] = await db.select({ amountSen: budgets.amountSen }).from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, cat.id), eq(budgets.month, lastYear)));
  return { ...fill, thisMonthSen: byMonth.get(month) ?? 0, lastYear: lastYear.slice(0, 4), lastYearSen: ly?.amountSen ?? null };
}

/** Sets (or, with 0, removes) a budget for this month, the rest of the year, or every month from now on. */
export async function setBudget(userId: string, body: Record<string, unknown>) {
  const month = monthOf(body.month); const cat = await ownExpenseCategory(userId, body.categoryId);
  const amountSen = body.remove ? 0 : amountOf(body); const scope = scopeOf(body.scope);
  if (!body.remove && amountSen === 0) bad("Enter an amount, or remove the budget.");
  const [every] = await db.select().from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, cat.id), eq(budgets.month, "*")));
  if (scope === "every") {
    // Every month from this one on: the "*" row, and this month's and later months' own rows give way to it.
    await db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, cat.id), sql`${budgets.month} <> '*' and ${budgets.month} >= ${month}`));
    if (amountSen > 0) await upsertBudget(userId, cat.id, "*", amountSen); else await db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, cat.id), eq(budgets.month, "*")));
    // Months before this one that relied on "*" keep what they had.
    if (every && amountSen !== every.amountSen) {
      const [first] = await db.select({ on: sql<string>`min(${transactions.on})` }).from(transactions).where(eq(transactions.userId, userId));
      const start = first?.on ? String(first.on).slice(0, 7) : month;
      for (let m = start; m < month; m = shiftMonth(m, 1)) {
        const [own] = await db.select({ id: budgets.id }).from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, cat.id), eq(budgets.month, m)));
        if (!own) await upsertBudget(userId, cat.id, m, every.amountSen);
      }
    }
  } else {
    for (const m of monthsFor(month, scope)) {
      if (amountSen > 0) await upsertBudget(userId, cat.id, m, amountSen);
      else if (every) await upsertBudget(userId, cat.id, m, 0); // "none this month" overrides every month
      else await db.delete(budgets).where(and(eq(budgets.userId, userId), eq(budgets.categoryId, cat.id), eq(budgets.month, m)));
    }
  }
  return getBudget(userId, month);
}
async function upsertBudget(userId: string, categoryId: string, month: string, amountSen: number) {
  await db.insert(budgets).values({ userId, categoryId, month, amountSen }).onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId, budgets.month], set: { amountSen } });
}

/** Expected income for this month, the rest of the year, or every month. */
export async function setIncomePlan(userId: string, body: Record<string, unknown>) {
  const month = monthOf(body.month); const amountSen = amountOf(body); const scope = scopeOf(body.scope);
  if (scope === "every") await db.delete(incomePlans).where(and(eq(incomePlans.userId, userId), sql`${incomePlans.month} <> '*' and ${incomePlans.month} >= ${month}`));
  for (const m of monthsFor(month, scope))
    await db.insert(incomePlans).values({ userId, month: m, amountSen }).onConflictDoUpdate({ target: [incomePlans.userId, incomePlans.month], set: { amountSen } });
  return getBudget(userId, month);
}

/** Brings in a year's budget (FINNY-62): each line's months for its category (lines on one category add up), and income. */
export async function importBudget(userId: string, body: Record<string, unknown>) {
  const lines = (Array.isArray(body.lines) ? body.lines : []) as { categoryId: string; months: Record<string, number> }[];
  const income = (body.income && typeof body.income === "object" ? body.income : {}) as Record<string, number>;
  if (lines.length > 200) bad("That's more budget lines than a workbook holds.");
  const sum = new Map<string, number>();
  for (const l of lines) {
    await ownExpenseCategory(userId, l.categoryId);
    for (const [m, sen] of Object.entries(l.months ?? {})) {
      if (!isMonth(m) || !Number.isSafeInteger(sen) || sen < 0) bad("A budget line has a bad month or amount.");
      const k = `${l.categoryId}|${m}`; sum.set(k, (sum.get(k) ?? 0) + sen);
    }
  }
  let set = 0;
  for (const [k, sen] of sum) { if (!sen) continue; const [categoryId, m] = k.split("|"); await upsertBudget(userId, categoryId, m, sen); set++; }
  let months = 0;
  for (const [m, sen] of Object.entries(income)) {
    if (!isMonth(m) || !Number.isSafeInteger(sen) || sen <= 0) continue;
    await db.insert(incomePlans).values({ userId, month: m, amountSen: sen }).onConflictDoUpdate({ target: [incomePlans.userId, incomePlans.month], set: { amountSen: sen } }); months++;
  }
  return { budgets: set, incomeMonths: months };
}
