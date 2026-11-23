// FINNY-102: the emergency fund. Pure; tests/unit/emergency-rule.test.mts. Money is integer sen.
export type Stability = "stable" | "fair" | "uncertain";
const BASE: Record<Stability, [number, number]> = { stable: [3, 6], fair: [6, 9], uncertain: [9, 12] };

/** Recommended months: 3–6 (very stable), 6–9 (fairly stable), 9–12 (uncertain), one more for each dependent (up to 3). */
export function recommendedMonths(stability: Stability, dependents: number): [number, number] {
  const d = Math.max(0, Math.min(3, Math.floor(dependents || 0)));
  const [lo, hi] = BASE[stability] ?? BASE.fair;
  return [lo + d, hi + d];
}

export type FundInput = { stability: Stability; dependents: number; spendingSen: number; target: "low" | "high" | "own"; ownTargetSen: number | null; monthlySen: number };
export type Source = { accountId: string; valueSen: number; partSen: number | null };

/** What a source holds for the fund today: all of its value, or a part never above it (and never below 0). */
export const sourceAmount = (s: Source) => Math.max(0, s.partSen == null ? s.valueSen : Math.min(s.partSen, s.valueSen));

/** The month (YYYY-MM) set aside + n × monthly first reaches the target, counting this month as n = 0. */
export function reachedMonth(setAsideSen: number, targetSen: number, monthlySen: number, thisMonth: string): string | null {
  if (setAsideSen >= targetSen) return thisMonth;
  if (monthlySen <= 0) return null;
  const n = Math.ceil((targetSen - setAsideSen) / monthlySen);
  const [y, m] = thisMonth.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function emergencyFund(inp: FundInput, sources: Source[], thisMonth: string) {
  const [lo, hi] = recommendedMonths(inp.stability, inp.dependents);
  const lowSen = lo * inp.spendingSen, highSen = hi * inp.spendingSen;
  const targetSen = inp.target === "own" && inp.ownTargetSen != null ? inp.ownTargetSen : inp.target === "high" ? highSen : lowSen;
  const setAsideSen = sources.reduce((n, s) => n + sourceAmount(s), 0);
  return {
    months: [lo, hi] as [number, number], lowSen, highSen, targetSen, targetMonths: inp.spendingSen ? Math.round((targetSen / inp.spendingSen) * 10) / 10 : null,
    setAsideSen, pct: targetSen ? Math.min(100, Math.round((setAsideSen / targetSen) * 100)) : 0,
    coveredMonths: inp.spendingSen ? Math.round((setAsideSen / inp.spendingSen) * 10) / 10 : null,
    toGoSen: Math.max(0, targetSen - setAsideSen), reached: reachedMonth(setAsideSen, targetSen, inp.monthlySen, thisMonth),
  };
}
