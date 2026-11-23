// FINNY-61: budget vs actual for one month. Pure; tests/unit/budget-rule.test.mts.
// A budget belongs to a category and a month ("2026-11"), or to every month ("*"); a month's own row wins, and a
// month row of 0 means "no budget this month". A group's budget covers its sub-categories that have no budget of
// their own, so nothing is counted twice.

export type BCat = { id: string; kind: string; parentId: string | null; name: string };
export type BudgetRow = { categoryId: string; month: string; amountSen: number };
export type Spent = { categoryId: string; amountSen: number }; // spending this month, per category (positive)
export type State = "ok" | "close" | "over";
export type Line = { categoryId: string; plannedSen: number; spentSen: number; leftSen: number; pct: number; state: State; every: boolean; covers: string[] };

/** The budget that applies to each category in a month. */
export function budgetsFor(month: string, rows: BudgetRow[]): Map<string, { amountSen: number; every: boolean }> {
  const out = new Map<string, { amountSen: number; every: boolean }>();
  for (const r of rows) if (r.month === "*" && r.amountSen > 0) out.set(r.categoryId, { amountSen: r.amountSen, every: true });
  for (const r of rows) if (r.month === month) { if (r.amountSen > 0) out.set(r.categoryId, { amountSen: r.amountSen, every: false }); else out.delete(r.categoryId); }
  return out;
}

/** Green below 90%, amber from 90%, red over 100%. */
export const stateOf = (spent: number, planned: number): State => (spent > planned ? "over" : spent >= planned * 0.9 ? "close" : "ok");

export function budgetLines(month: string, cats: BCat[], rows: BudgetRow[], spent: Spent[]): Line[] {
  const plan = budgetsFor(month, rows);
  const byId = new Map(cats.map((c) => [c.id, c]));
  // Each category's spending goes to its nearest budgeted ancestor (itself included).
  const owner = (id: string): string | null => { let c = byId.get(id); for (let n = 0; c && n < 6; n++) { if (plan.has(c.id)) return c.id; c = c.parentId ? byId.get(c.parentId) : undefined; } return null; };
  const sums = new Map<string, number>(), covers = new Map<string, Set<string>>();
  for (const s of spent) {
    const o = owner(s.categoryId); if (!o) continue;
    sums.set(o, (sums.get(o) ?? 0) + s.amountSen);
    if (o !== s.categoryId) { const set = covers.get(o) ?? new Set(); set.add(s.categoryId); covers.set(o, set); }
  }
  return [...plan].map(([categoryId, p]) => {
    const s = sums.get(categoryId) ?? 0;
    return { categoryId, plannedSen: p.amountSen, spentSen: s, leftSen: p.amountSen - s, pct: Math.round((s / p.amountSen) * 100), state: stateOf(s, p.amountSen), every: p.every, covers: [...(covers.get(categoryId) ?? [])] };
  }).sort((a, b) => b.pct - a.pct || b.plannedSen - a.plannedSen);
}

export function incomePlanFor(month: string, rows: { month: string; amountSen: number }[]): number {
  return rows.find((r) => r.month === month)?.amountSen ?? rows.find((r) => r.month === "*")?.amountSen ?? 0;
}

/** The month's totals: planned, spent on budgeted categories, expected income and what's left to plan. */
export function budgetTotals(lines: Line[], incomePlanSen: number) {
  const planned = lines.reduce((n, l) => n + l.plannedSen, 0), spentSen = lines.reduce((n, l) => n + l.spentSen, 0);
  return { plannedSen: planned, spentSen, incomePlanSen, leftToPlanSen: incomePlanSen - planned, over: lines.filter((l) => l.state === "over").length, close: lines.filter((l) => l.state === "close").length, pct: planned ? Math.round((spentSen / planned) * 100) : 0 };
}

/** Days left in the month counting today (0 for a past month, all of them for a future one). */
export function daysLeft(month: string, today: string): number {
  const [y, m] = month.split("-").map(Number); const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const t = today.slice(0, 7);
  if (t > month) return 0; if (t < month) return days;
  return days - Number(today.slice(8, 10)) + 1;
}

/** The months a change applies to: this one, the rest of its year, or every month ("*"). */
export function monthsFor(month: string, scope: "one" | "rest" | "every"): string[] {
  if (scope === "every") return ["*"];
  if (scope === "one") return [month];
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: 13 - m }, (_, i) => `${y}-${String(m + i).padStart(2, "0")}`);
}

/** Quick fill: last month's spending and the 3-month average, rounded up to a thousand rupiah. */
export function quickFill(monthly: Map<string, number>, month: string) {
  const prev = (n: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 - n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const round = (sen: number) => Math.ceil(sen / 100_000) * 100_000;
  const last = monthly.get(prev(1)) ?? 0;
  const three = [1, 2, 3].map((n) => monthly.get(prev(n)) ?? 0);
  return { lastMonthSen: round(last), avg3Sen: round(three.reduce((a, b) => a + b, 0) / 3) };
}
