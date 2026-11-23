// FINNY-110: the month-end review. Pure; tests/unit/review-rule.test.mts. Money is integer sen.
import type { Line } from "./budget-rule.ts";

const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The month to review: last month, from the 1st, until it is closed, and only if it has transactions. */
export function dueMonth(today: string, closed: Set<string>, monthsWithTxns: Set<string>): string | null {
  const prev = shiftMonth(today.slice(0, 7), -1);
  return isMonth(prev) && !closed.has(prev) && monthsWithTxns.has(prev) ? prev : null;
}

export type SAcc = { id: string; name: string; type: string; archived?: boolean };
export type Batch = { accountId: string | null; periodFrom: string | null; periodTo: string | null; txns: number };

/** Accounts read by statement (open ones with at least one statement batch); read for a month when a batch ends in it. */
export function statementStep(accs: SAcc[], batches: Batch[], month: string) {
  const ever = new Set(batches.map((b) => b.accountId).filter(Boolean) as string[]);
  const accounts = accs.filter((a) => !a.archived && ever.has(a.id)).map((a) => {
    const b = batches.filter((x) => x.accountId === a.id && x.periodTo?.slice(0, 7) === month).sort((x, y) => (y.periodTo ?? "").localeCompare(x.periodTo ?? ""))[0];
    return { accountId: a.id, name: a.name, type: a.type, read: !!b, periodFrom: b?.periodFrom ?? null, periodTo: b?.periodTo ?? null, lines: b?.txns ?? 0 };
  });
  const read = accounts.filter((a) => a.read).length;
  return { accounts, read, total: accounts.length, done: read === accounts.length };
}

/** Budget vs actual for the review: over (most over first) and under, and how much was kept of the month's income. */
export function budgetCheck(lines: Line[], inSen: number, outSen: number) {
  const planned = lines.filter((l) => l.plannedSen > 0);
  const over = planned.filter((l) => l.spentSen > l.plannedSen).map((l) => ({ ...l, overSen: l.spentSen - l.plannedSen })).sort((a, b) => b.pct - a.pct || b.overSen - a.overSen);
  const under = planned.filter((l) => l.spentSen <= l.plannedSen).map((l) => ({ ...l, underSen: l.plannedSen - l.spentSen })).sort((a, b) => b.underSen - a.underSen);
  const plannedSen = planned.reduce((n, l) => n + l.plannedSen, 0), spentSen = planned.reduce((n, l) => n + l.spentSen, 0);
  const keptSen = inSen - outSen;
  return { over, under, plannedSen, spentSen, usedPct: plannedSen ? Math.round((spentSen / plannedSen) * 100) : null, inSen, outSen, keptSen, keptPct: keptPctOf(inSen, keptSen) };
}

export const keptPctOf = (inSen: number, keptSen: number): number | null => (inSen > 0 ? Math.round((keptSen / inSen) * 100) : null);

/** Kept as a % of income over several months together (not an average of percentages). */
export function averageKeptPct(months: { inSen: number; keptSen: number }[]): number | null {
  const inSen = months.reduce((n, m) => n + m.inSen, 0), kept = months.reduce((n, m) => n + m.keptSen, 0);
  return keptPctOf(inSen, kept);
}

export const ROUND_TO = 50_000_00; // Rp 50.000
export const roundUp = (sen: number) => Math.ceil(sen / ROUND_TO) * ROUND_TO;

/** Next month's budget from this month: each line copies; a line that ran over becomes what was spent, rounded up to
 *  Rp 50.000. A category already planned for next month is left alone, and an every-month line that wasn't over needs
 *  nothing (it applies already). */
export function planNext(lines: Line[], plannedNext: Set<string>) {
  return lines.filter((l) => l.plannedSen > 0 && !plannedNext.has(l.categoryId)).flatMap((l) => {
    const over = l.spentSen > l.plannedSen;
    if (l.every && !over) return [];
    return [{ categoryId: l.categoryId, fromSen: l.plannedSen, amountSen: over ? roundUp(l.spentSen) : l.plannedSen, raised: over }];
  });
}

/** This month's lines at 90% of their budget or over, most used first, with the days left. */
export function budgetWarnings(lines: Line[], daysLeft: number) {
  return lines.filter((l) => l.plannedSen > 0 && l.spentSen >= l.plannedSen * 0.9)
    .sort((a, b) => b.pct - a.pct).map((l) => ({ categoryId: l.categoryId, pct: l.pct, spentSen: l.spentSen, plannedSen: l.plannedSen, over: l.spentSen > l.plannedSen, daysLeft }));
}

export type DTxn = { on: string; kind: string; amountSen: number; toAccountId: string | null };
/** Debts paid down in a month: money moved into card and loan accounts. */
export function debtsPaid(txns: DTxn[], owedIds: Set<string>, month: string): number {
  return txns.filter((t) => t.kind === "transfer" && t.toAccountId && owedIds.has(t.toAccountId) && t.on.slice(0, 7) === month).reduce((n, t) => n + t.amountSen, 0);
}

/** The four steps and how many are done. */
export function steps(statementsDone: boolean, r: { budgetDone: boolean; wealthDone: boolean; closedAt: Date | string | null } | null) {
  const s = { statements: statementsDone, budget: !!r?.budgetDone, wealth: !!r?.wealthDone, closed: !!r?.closedAt };
  return { ...s, done: Object.values(s).filter(Boolean).length, of: 4 };
}

/** Whole days since a date (for "values last updated 40 days ago"); null when never. */
export const daysSince = (on: string | null, today: string): number | null => (on ? Math.round((Date.parse(today) - Date.parse(on)) / 864e5) : null);
