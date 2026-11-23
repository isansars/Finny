// FINNY-118: net worth goals. Pure; tests/unit/goal-rule.test.mts. Money is integer sen.
import { reachedMonth, sourceAmount, type Source } from "./emergency-rule.ts";

export const ROUND_NEEDED = 100_000_00; // needed a month is rounded up to Rp 100.000

/** What a "save" goal holds: each source all or a part, never above its value, never below 0. */
export const savedFrom = (sources: Pick<Source, "valueSen" | "partSen">[]) => sources.reduce((n, s) => n + sourceAmount({ accountId: "", ...s }), 0);

export const pctOf = (savedSen: number, targetSen: number) => (targetSen > 0 ? Math.max(0, Math.min(100, Math.round((savedSen / targetSen) * 100))) : 0);

/** Months between this month and the goal's month (at least 1, so a missed date asks for the rest now). */
export function monthsLeft(byMonth: string, thisMonth: string): number {
  const [y1, m1] = thisMonth.split("-").map(Number), [y2, m2] = byMonth.split("-").map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1));
}

/** Needed a month to reach the target by its month, rounded up to Rp 100.000; 0 once reached; null without a date. */
export function neededPerMonth(savedSen: number, targetSen: number, byMonth: string | null, thisMonth: string): number | null {
  if (savedSen >= targetSen) return 0;
  if (!byMonth) return null;
  return Math.ceil((targetSen - savedSen) / monthsLeft(byMonth, thisMonth) / ROUND_NEEDED) * ROUND_NEEDED;
}

/** How much saved grew a month: (now − then) ÷ months, to the whole rupiah; 0 without history. */
export const paceOf = (nowSen: number, thenSen: number, months: number) => (months > 0 ? Math.round((nowSen - thenSen) / months / 100) * 100 : 0);

export type GoalInput = { targetSen: number; byMonth: string | null; savedSen: number; thenSen: number; paceMonths: number };

/** Every figure a goal shows. */
export function goalFigures(g: GoalInput, thisMonth: string) {
  const reached = g.savedSen >= g.targetSen;
  const needed = neededPerMonth(g.savedSen, g.targetSen, g.byMonth, thisMonth);
  const pace = paceOf(g.savedSen, g.thenSen, g.paceMonths);
  const atPace = reachedMonth(g.savedSen, g.targetSen, pace, thisMonth);
  const onTrack = reached || (needed == null ? pace > 0 : pace >= needed);
  return {
    savedSen: g.savedSen, targetSen: g.targetSen, leftSen: Math.max(0, g.targetSen - g.savedSen), pct: pctOf(g.savedSen, g.targetSen),
    neededSen: needed, paceSen: pace, paceMonths: g.paceMonths, reachedAtPace: atPace, reached, onTrack,
    behindSen: needed != null && pace < needed ? needed - pace : 0,
  };
}

const addMonths = (month: string, n: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

/** The chart's lines from this month: needed (to the goal's month) and pace (to the target or the goal's month, at most 60 months). */
export function projection(savedSen: number, targetSen: number, neededSen: number | null, paceSen: number, byMonth: string | null, thisMonth: string) {
  const toBy = byMonth ? monthsLeft(byMonth, thisMonth) : 0;
  const toTarget = paceSen > 0 ? Math.ceil(Math.max(0, targetSen - savedSen) / paceSen) : 0;
  const len = Math.min(60, Math.max(toBy, toTarget, 1));
  const line = (step: number, n: number) => Array.from({ length: n + 1 }, (_, i) => ({ month: addMonths(thisMonth, i), sen: Math.min(targetSen, savedSen + step * i) }));
  return { needed: neededSen ? line(neededSen, toBy) : [], pace: paceSen > 0 ? line(paceSen, len) : [], months: len };
}

/** The change shown in the month-end review: % at the month's end minus % at the end of the month before. */
export const pctChange = (savedEnd: number, savedBefore: number, targetSen: number) => pctOf(savedEnd, targetSen) - pctOf(savedBefore, targetSen);
