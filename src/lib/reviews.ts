// The month-end review (FINNY-111). Figures from review-rule.ts, budget-rule.ts, report-rule.ts and the emergency fund.
// Every query is scoped to the owner.
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories, importBatches, monthReviews, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { monthRange, todayIn } from "@/lib/dates";
import { getBudget } from "@/lib/budgets";
import { loadWealth } from "@/lib/assets";
import { emergencyOverview } from "@/lib/emergency";
import { OWED, holdingAt } from "@/lib/asset-rule";
import { balanceSheet, cashflow, monthEnd, monthsBetween } from "@/lib/report-rule";
import { averageKeptPct, budgetCheck, budgetWarnings, daysSince, debtsPaid, dueMonth, planNext, shiftMonth, statementStep, steps } from "@/lib/review-rule";

const bad = (m: string): never => { throw new HttpError(400, m); };
function monthOf(v: unknown, today: string): string {
  const m = typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : bad("month must look like 2026-10");
  if (m > today.slice(0, 7)) bad("That month hasn't happened yet.");
  return m;
}

export type Summary = {
  inSen: number; outSen: number; keptSen: number; keptPct: number | null; avgKeptPct: number | null;
  netSen: number; netChangeSen: number; usedPct: number | null; over: number; under: number;
  emergencyPct: number | null; emergencyPrevPct: number | null; debtsPaidSen: number;
};

async function reviewRow(userId: string, month: string) {
  const [r] = await db.select().from(monthReviews).where(and(eq(monthReviews.userId, userId), eq(monthReviews.month, month)));
  return r ?? null;
}
async function statementsFor(userId: string, month: string, accs: { id: string; name: string; type: string; archived: boolean }[]) {
  const batches = await db.select({ accountId: importBatches.accountId, periodFrom: importBatches.periodFrom, periodTo: importBatches.periodTo, txns: importBatches.txns })
    .from(importBatches).where(and(eq(importBatches.userId, userId), eq(importBatches.kind, "statement")));
  return statementStep(accs, batches, month);
}
async function lastClosedBefore(userId: string, month: string) {
  const [r] = await db.select().from(monthReviews).where(and(eq(monthReviews.userId, userId), isNotNull(monthReviews.closedAt), lt(monthReviews.month, month))).orderBy(desc(monthReviews.month)).limit(1);
  return r ?? null;
}

/** Everything the review shows for one month. A closed month shows the summary saved at close. */
export async function getReview(userId: string, monthIn: unknown) {
  const today = todayIn(), month = monthOf(monthIn, today), next = shiftMonth(month, 1);
  const [row, w, bud, ef, prev, nextRows, cats] = await Promise.all([
    reviewRow(userId, month), loadWealth(userId), getBudget(userId, month), emergencyOverview(userId), lastClosedBefore(userId, month),
    db.select({ categoryId: budgets.categoryId }).from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.month, next))),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
  ]);
  const statements = await statementsFor(userId, month, w.accs);
  const name = new Map(cats.map((c) => [c.id, c.name]));
  const flow = cashflow(w.txns, monthsBetween(shiftMonth(month, -5), month));
  const thisFlow = flow.months[flow.months.length - 1];
  const check = budgetCheck(bud.lines, thisFlow.inSen, thisFlow.outSen);
  const end = monthEnd(month);
  const sheet = balanceSheet(w.accs, w.txns.filter((t) => t.on <= end), month, 2, { vals: w.vals, things: w.things });
  const holdings = w.accs.filter((a) => a.type === "investment" && !a.archived).map((a) => holdingAt(a, w.txns, w.vals, today));
  const valuesOn = holdings.filter((h) => !h.fixed).map((h) => h.valuedOn).filter(Boolean).sort().pop() ?? null;
  const owed = new Set(w.accs.filter((a) => OWED.has(a.type)).map((a) => a.id));
  const live: Summary = {
    inSen: check.inSen, outSen: check.outSen, keptSen: check.keptSen, keptPct: check.keptPct, avgKeptPct: averageKeptPct(flow.months),
    netSen: sheet.netSen, netChangeSen: sheet.changeSen, usedPct: check.usedPct, over: check.over.length, under: check.under.length,
    emergencyPct: ef.configured ? ef.pct : null, emergencyPrevPct: (prev?.summary as Summary | null)?.emergencyPct ?? null, debtsPaidSen: debtsPaid(w.txns, owed, month),
  };
  const named = <T extends { categoryId: string }>(l: T) => ({ ...l, name: name.get(l.categoryId) ?? "" });
  return {
    month, next, today, closed: !!row?.closedAt, closedAt: row?.closedAt ?? null, note: row?.note ?? "",
    steps: steps(statements.done, row), statements,
    budget: { ...check, over: check.over.map(named), under: check.under.map(named), nextPlanned: nextRows.length, planNext: planNext(bud.lines, new Set(nextRows.map((r) => r.categoryId))).map(named) },
    wealth: { netSen: sheet.netSen, changeSen: sheet.changeSen, holdings: holdings.length, valuesOn, valuesDays: daysSince(valuesOn, today),
      emergency: { configured: ef.configured, pct: ef.pct, setAsideSen: ef.setAsideSen, targetSen: ef.targetSen, prevPct: live.emergencyPrevPct } },
    summary: row?.closedAt && row.summary ? (row.summary as Summary) : live,
  };
}

/** Home and the review list: the month due for review (with steps done), this month's budget warnings, past reviews. */
export async function reviewsOverview(userId: string) {
  const today = todayIn(), thisMonth = today.slice(0, 7), prev = shiftMonth(thisMonth, -1);
  const [from, to] = monthRange(prev);
  const [rows, [has], bud, cats, accs] = await Promise.all([
    db.select().from(monthReviews).where(eq(monthReviews.userId, userId)).orderBy(desc(monthReviews.month)),
    db.select({ n: sql<number>`count(*)` }).from(transactions).where(and(eq(transactions.userId, userId), gte(transactions.on, from), lt(transactions.on, to))),
    getBudget(userId, thisMonth),
    db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
    loadWealth(userId).then((w) => w.accs),
  ]);
  const closed = new Set(rows.filter((r) => r.closedAt).map((r) => r.month));
  const due = dueMonth(today, closed, Number(has.n) > 0 ? new Set([prev]) : new Set());
  let dueInfo = null;
  if (due) {
    const st = await statementsFor(userId, due, accs);
    const missing = st.accounts.filter((a) => !a.read).map((a) => a.name);
    dueInfo = { month: due, steps: steps(st.done, rows.find((r) => r.month === due) ?? null), missingStatements: missing };
  }
  const name = new Map(cats.map((c) => [c.id, c.name]));
  return {
    today, due: dueInfo,
    warnings: budgetWarnings(bud.lines, bud.daysLeft).map((w) => ({ ...w, name: name.get(w.categoryId) ?? "" })),
    past: rows.filter((r) => r.closedAt).map((r) => { const s = (r.summary ?? {}) as Partial<Summary>; return { month: r.month, closedAt: r.closedAt, keptPct: s.keptPct ?? null, netChangeSen: s.netChangeSen ?? null, note: r.note ?? "" }; }),
  };
}

async function upsert(userId: string, month: string, set: Partial<typeof monthReviews.$inferInsert>) {
  await db.insert(monthReviews).values({ userId, month, ...set }).onConflictDoUpdate({ target: [monthReviews.userId, monthReviews.month], set });
}

export async function markSteps(userId: string, monthIn: unknown, body: Record<string, unknown>) {
  const month = monthOf(monthIn, todayIn());
  const set: Partial<typeof monthReviews.$inferInsert> = {};
  if ("budgetDone" in body) set.budgetDone = body.budgetDone === true;
  if ("wealthDone" in body) set.wealthDone = body.wealthDone === true;
  if (!Object.keys(set).length) bad("Nothing to change: send budgetDone or wealthDone.");
  await upsert(userId, month, set);
  return getReview(userId, month);
}

/** Copies the month's budget into the next month by the rule; returns what was added. */
export async function planNextMonth(userId: string, monthIn: unknown) {
  const month = monthOf(monthIn, todayIn()), next = shiftMonth(month, 1);
  const [bud, nextRows] = await Promise.all([
    getBudget(userId, month),
    db.select({ categoryId: budgets.categoryId }).from(budgets).where(and(eq(budgets.userId, userId), eq(budgets.month, next))),
  ]);
  const add = planNext(bud.lines, new Set(nextRows.map((r) => r.categoryId)));
  if (add.length) await db.insert(budgets).values(add.map((a) => ({ userId, categoryId: a.categoryId, month: next, amountSen: a.amountSen }))).onConflictDoNothing();
  return { month: next, added: add };
}

export async function closeMonth(userId: string, monthIn: unknown, body: Record<string, unknown>) {
  const today = todayIn(), month = monthOf(monthIn, today);
  if (month >= today.slice(0, 7)) bad("A month can be closed once it has ended.");
  const note = body.note == null ? "" : String(body.note).trim();
  if (note.length > 1000) bad("Keep the note under 1,000 characters.");
  const r = await getReview(userId, month);
  if (r.closed) bad("This month is already closed. Reopen it to close it again.");
  await upsert(userId, month, { closedAt: new Date(), note: note || null, summary: r.summary as unknown as Record<string, unknown> });
  return getReview(userId, month);
}

export async function reopenMonth(userId: string, monthIn: unknown) {
  const month = monthOf(monthIn, todayIn());
  await upsert(userId, month, { closedAt: null, summary: null });
  return getReview(userId, month);
}

