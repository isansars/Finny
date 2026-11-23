// FINNY-86: debts. Minimums, a payoff plan simulated month by month in sen, progress and bills coming up. Pure;
// tests/unit/debt-rule.test.mts. "Owed" is always positive (a card's balance with the sign turned).

export type Terms = { interestBp: number | null; interestPer: "month" | "year" | null; minFixedSen: number | null; minPctBp: number | null; minFloorSen: number | null };
export type Debt = Terms & { id: string; name: string; owedSen: number };
export type Method = "minimums" | "snowball" | "avalanche";

/** Interest per month as a fraction (1,75% a month → 0.0175; 12% a year → 0.01). No terms: 0. */
export function monthlyRate(t: Terms): number {
  if (!t.interestBp) return 0;
  return t.interestPer === "year" ? t.interestBp / 10000 / 12 : t.interestBp / 10000;
}
/** Indonesian cards ask at least 5% of the bill, and Rp 50.000, when nothing else is set. */
export const DEFAULT_MIN = { pctBp: 500, floorSen: 5_000_000 };
export const hasTerms = (t: Terms) => t.interestBp != null || t.minFixedSen != null || t.minPctBp != null;

/** The minimum payment for a balance: a fixed amount, or a % with a floor; never more than what's owed. */
export function minimumFor(t: Terms, owedSen: number): number {
  if (owedSen <= 0) return 0;
  let min: number;
  if (t.minFixedSen != null) min = t.minFixedSen;
  else {
    const pct = t.minPctBp ?? DEFAULT_MIN.pctBp, floor = t.minFloorSen ?? (t.minPctBp == null ? DEFAULT_MIN.floorSen : 0);
    min = Math.max(Math.round((owedSen * pct) / 10000), floor);
  }
  return Math.min(min, owedSen);
}

const addMonths = (month: string, n: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

/** The order a method pays debts off in: snowball = smallest owed first; avalanche = highest rate first. */
export function orderFor(debts: Debt[], method: Method): Debt[] {
  const list = debts.filter((d) => d.owedSen > 0);
  if (method === "avalanche") return list.sort((a, b) => monthlyRate(b) - monthlyRate(a) || a.owedSen - b.owedSen || a.name.localeCompare(b.name));
  return list.sort((a, b) => a.owedSen - b.owedSen || monthlyRate(b) - monthlyRate(a) || a.name.localeCompare(b.name));
}

export type Plan = {
  method: Method; extraSen: number; monthlyBudgetSen: number;
  months: number | null; debtFreeMonth: string | null; totalInterestSen: number; totalPaidSen: number;
  order: { id: string; name: string; payoffMonth: string | null }[];
  line: { month: string; owedSen: number }[];
  stuck: string[]; // debts whose payment never beats their interest
};

const LIMIT = 600;
/**
 * Month by month from `start` (the first month paid): interest is added, every debt gets its minimum, and (snowball,
 * avalanche) the rest of the budget goes to the first unpaid debt in order. The budget is the first month's minimums
 * plus the extra, so a paid-off debt's minimum rolls on to the next.
 */
export function simulate(debts: Debt[], method: Method, extraSen: number, start: string): Plan {
  const order = orderFor(debts, method);
  const owed = new Map(order.map((d) => [d.id, d.owedSen]));
  const paidOff = new Map<string, string>();
  const budget = order.reduce((n, d) => n + minimumFor(d, d.owedSen), 0) + (method === "minimums" ? 0 : extraSen);
  let interest = 0, paid = 0, m = 0;
  const line: { month: string; owedSen: number }[] = [{ month: addMonths(start, -1), owedSen: order.reduce((n, d) => n + d.owedSen, 0) }];
  const lastOwed = new Map(owed); const growing = new Map<string, number>();
  while (m < LIMIT && [...owed.values()].some((v) => v > 0)) {
    const month = addMonths(start, m);
    for (const d of order) { const b = owed.get(d.id)!; if (b <= 0) continue; const i = Math.round(b * monthlyRate(d)); owed.set(d.id, b + i); interest += i; }
    let left = budget;
    for (const d of order) {
      const b = owed.get(d.id)!; if (b <= 0) continue;
      const p = Math.min(minimumFor(d, b), b, method === "minimums" ? Infinity : Math.max(left, 0));
      owed.set(d.id, b - p); paid += p; left -= p;
    }
    if (method !== "minimums") for (const d of order) {
      if (left <= 0) break;
      const b = owed.get(d.id)!; if (b <= 0) continue;
      const p = Math.min(b, left); owed.set(d.id, b - p); paid += p; left -= p;
    }
    for (const d of order) {
      const b = owed.get(d.id)!;
      if (b <= 0 && !paidOff.has(d.id)) paidOff.set(d.id, month);
      if (b > 0 && b >= lastOwed.get(d.id)!) growing.set(d.id, (growing.get(d.id) ?? 0) + 1); else growing.set(d.id, 0);
      lastOwed.set(d.id, b);
    }
    line.push({ month, owedSen: [...owed.values()].reduce((n, v) => n + Math.max(v, 0), 0) });
    m++;
    // A debt that hasn't shrunk for a year never will at this pace: stop rather than run to the limit.
    if ([...growing.values()].some((g) => g >= 12)) break;
  }
  const done = [...owed.values()].every((v) => v <= 0);
  const stuck = order.filter((d) => (owed.get(d.id) ?? 0) > 0 && (growing.get(d.id) ?? 0) >= 12).map((d) => d.name);
  return {
    method, extraSen: method === "minimums" ? 0 : extraSen, monthlyBudgetSen: budget,
    months: done ? m : null, debtFreeMonth: done ? addMonths(start, m - 1) : null, totalInterestSen: interest, totalPaidSen: paid,
    order: order.map((d) => ({ id: d.id, name: d.name, payoffMonth: paidOff.get(d.id) ?? null })), line, stuck,
  };
}

/** Paid off from the highest owed: 1 − now ÷ peak, as a whole percent. */
export function progressPct(owedNowSen: number, peakSen: number): number {
  if (peakSen <= 0 || owedNowSen <= 0) return owedNowSen <= 0 && peakSen > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((1 - owedNowSen / peakSen) * 100)));
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, daysInMonth(y, m))).padStart(2, "0")}`;
/** The next due date on or after `today`, and the statement date it belongs to (the last statement day before it). */
export function nextDue(today: string, dueDay: number, statementDay: number | null): { due: string; statement: string | null } {
  const [y, m] = today.split("-").map(Number);
  let due = iso(y, m, dueDay);
  if (due < today) { const n = new Date(Date.UTC(y, m, 1)); due = iso(n.getUTCFullYear(), n.getUTCMonth() + 1, dueDay); }
  if (!statementDay) return { due, statement: null };
  const [dy, dm] = due.split("-").map(Number);
  let st = iso(dy, dm, statementDay);
  if (st >= due) { const p = new Date(Date.UTC(dy, dm - 2, 1)); st = iso(p.getUTCFullYear(), p.getUTCMonth() + 1, statementDay); }
  return { due, statement: st };
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
