// FINNY-141: recurring transactions. Pure; tests/unit/recurring-rule.test.mts. Dates are "YYYY-MM-DD", money is sen.
export type Every = "month" | "week" | "year";
export type Rule = { every: Every; anchorOn: string; endOn: string | null };

const DAY = 864e5;
const t = (d: string) => Date.parse(d + "T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(t(d) + n * DAY);
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1–12
const at = (y: number, m: number, day: number) => `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, daysIn(y, m))).padStart(2, "0")}`;

/** Every day the rule falls on from `from` to `to` (both included), never before its anchor or after its end. Monthly
 *  on the anchor's day (the last day of a shorter month), weekly on its weekday, yearly on its date. */
export function daysOf(r: Rule, from: string, to: string): string[] {
  const start = from > r.anchorOn ? from : r.anchorOn, end = r.endOn && r.endOn < to ? r.endOn : to;
  if (start > end) return [];
  const out: string[] = [];
  const [ay, am, ad] = r.anchorOn.split("-").map(Number);
  if (r.every === "week") {
    const k = Math.max(0, Math.ceil((t(start) - t(r.anchorOn)) / (7 * DAY)));
    for (let d = addDays(r.anchorOn, 7 * k); d <= end; d = addDays(d, 7)) out.push(d);
    return out;
  }
  const [sy, sm] = start.split("-").map(Number), [ey, em] = end.split("-").map(Number);
  if (r.every === "year") {
    for (let y = Math.max(sy, ay); y <= ey; y++) { const d = at(y, am, ad); if (d >= start && d <= end) out.push(d); }
    return out;
  }
  for (let y = sy, m = sm; y < ey || (y === ey && m <= em); m === 12 ? (y++, m = 1) : m++) {
    const d = at(y, m, ad); if (d >= start && d <= end) out.push(d);
  }
  return out;
}

export const LOOK_BACK = 60;
/** Days up to today, at most 60 days back and not before the item began, that aren't done (added or skipped). */
export function dueDays(r: Rule, began: string, done: Set<string>, today: string): string[] {
  const back = addDays(today, -LOOK_BACK), from = [r.anchorOn, began, back].sort().pop()!;
  return daysOf(r, from, today).filter((d) => !done.has(d));
}

/** The first day after today. */
export const nextDay = (r: Rule, today: string): string | null => daysOf(r, addDays(today, 1), addDays(today, 400))[0] ?? null;

/** Days in the next 7 days (tomorrow to a week from today). */
export const comingUp = (r: Rule, today: string): string[] => daysOf(r, addDays(today, 1), addDays(today, 7));

/** What an item comes to in a month: weekly × 52 ÷ 12, yearly ÷ 12, to the whole rupiah. */
export function perMonth(every: Every, amountSen: number): number {
  if (every === "month") return amountSen;
  return Math.round((every === "week" ? (amountSen * 52) / 12 : amountSen / 12) / 100) * 100;
}

// ---------------------------------------------------------------- suggestions

export type HTxn = { on: string; kind: string; amountSen: number; accountId: string; categoryId: string | null; description: string };
export type Suggestion = { key: string; name: string; kind: "spend" | "income"; amountSen: number; accountId: string; categoryId: string | null; day: number; months: number; lastOn: string };
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
export const suggestionKey = (description: string, accountId: string, amountSen: number) => `${norm(description)}|${accountId}|${amountSen}`;
const monthIndex = (d: string) => { const [y, m] = d.split("-").map(Number); return y * 12 + m - 1; };

/** Spending or income with the same description, account and amount in 3+ months in a row (one a month), on days no
 *  more than 3 apart, still going (its last month is this month or the one before), and not already recurring or
 *  dismissed. Longest runs first. */
export function suggestions(history: HTxn[], thisMonth: string, taken: Set<string>, minMonths = 3): Suggestion[] {
  const groups = new Map<string, HTxn[]>();
  for (const x of history) {
    if ((x.kind !== "spend" && x.kind !== "income") || !norm(x.description)) continue;
    const k = suggestionKey(x.description, x.accountId, x.amountSen);
    if (taken.has(k)) continue;
    const g = groups.get(k) ?? []; g.push(x); groups.set(k, g);
  }
  const now = monthIndex(thisMonth + "-01"), out: Suggestion[] = [];
  for (const [k, g] of groups) {
    const byMonth = new Map<number, HTxn[]>();
    for (const x of g) { const m = monthIndex(x.on); byMonth.set(m, [...(byMonth.get(m) ?? []), x]); }
    if ([...byMonth.values()].some((xs) => xs.length > 1)) continue; // twice in a month isn't a monthly bill
    const months = [...byMonth.keys()].sort((a, b) => a - b), last = months[months.length - 1];
    if (now - last > 1) continue;
    let run = 1; for (let i = months.length - 1; i > 0 && months[i] - months[i - 1] === 1; i--) run++;
    if (run < minMonths) continue;
    const recent = months.slice(-run).map((m) => byMonth.get(m)![0]);
    const days = recent.map((x) => Number(x.on.slice(8)));
    if (Math.max(...days) - Math.min(...days) > 3) continue;
    const latest = recent[recent.length - 1];
    out.push({ key: k, name: latest.description.trim(), kind: latest.kind as "spend" | "income", amountSen: latest.amountSen, accountId: latest.accountId, categoryId: latest.categoryId, day: Number(latest.on.slice(8)), months: run, lastOn: latest.on });
  }
  return out.sort((a, b) => b.months - a.months || b.amountSen - a.amountSen);
}
