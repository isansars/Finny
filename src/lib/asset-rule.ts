// FINNY-94: assets. A holding's invested amount, value and profit or loss; fixed-income interest; a thing's worth over
// time; net worth with everything. Pure; tests/unit/asset-rule.test.mts. Money is integer sen.
import type { RTxn } from "./report-rule.ts";

export type HAcc = { id: string; name: string; type: string; openingSen: number; openingOn: string; holdingKind?: string | null; rateBp?: number | null; maturityOn?: string | null; archived?: boolean };
export type Val = { accountId: string; on: string; valueSen: number };
export type Thing = { id: string; name: string; kind: string; boughtOn: string; costSen: number; yearlyBp: number; shareBp: number; valueSen: number | null; valueOn: string | null; soldOn: string | null };

export const FIXED = new Set(["bond", "deposit", "p2p"]);
export const CASH = new Set(["cash", "bank", "ewallet"]);
export const OWED = new Set(["card", "loan"]);
const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

/** Money into a holding minus money out of it, up to a day (its opening balance counts as put in). */
export function investedAt(acc: HAcc, txns: RTxn[], on: string): number {
  let n = acc.openingOn <= on ? acc.openingSen : 0;
  for (const t of txns) {
    if (t.on > on) continue;
    if (t.accountId === acc.id) n += t.kind === "income" ? t.amountSen : -t.amountSen;
    else if (t.kind === "transfer" && t.toAccountId === acc.id) n += t.amountSen;
  }
  return n;
}
/** Interest paid into a holding (income into it) up to a day. */
export function interestReceivedAt(acc: HAcc, txns: RTxn[], on: string): number {
  return txns.filter((t) => t.on <= on && t.kind === "income" && t.accountId === acc.id).reduce((n, t) => n + t.amountSen, 0);
}
/** The first day money went into a holding (or its opening date). */
export function startOf(acc: HAcc, txns: RTxn[]): string {
  const first = txns.filter((t) => t.kind === "transfer" && t.toAccountId === acc.id).map((t) => t.on).sort()[0];
  return acc.openingSen > 0 || !first ? acc.openingOn : first < acc.openingOn ? acc.openingOn : first;
}
/** Fixed income: principal × yearly rate × days since the start ÷ 365, stopping at maturity; less what's been paid out. */
export function accruedAt(acc: HAcc, txns: RTxn[], on: string): number {
  if (!acc.rateBp || !FIXED.has(acc.holdingKind ?? "")) return 0;
  const start = startOf(acc, txns), end = acc.maturityOn && acc.maturityOn < on ? acc.maturityOn : on;
  if (end <= start) return 0;
  const principal = investedAt(acc, txns, on) - interestReceivedAt(acc, txns, on);
  const earned = Math.round((principal * acc.rateBp * days(start, end)) / 10000 / 365 / 100) * 100; // whole rupiah
  return Math.max(0, earned - interestReceivedAt(acc, txns, on));
}

/** A holding on a day: what's in it, what it's worth (the latest value typed on or before, else invested + accrued), P/L. */
export function holdingAt(acc: HAcc, txns: RTxn[], vals: Val[], on: string) {
  const invested = investedAt(acc, txns, on) - interestReceivedAt(acc, txns, on);
  const last = vals.filter((v) => v.accountId === acc.id && v.on <= on).sort((a, b) => b.on.localeCompare(a.on))[0];
  const interest = interestReceivedAt(acc, txns, on), accrued = accruedAt(acc, txns, on);
  const valueSen = last ? last.valueSen : invested + interest + accrued;
  const plSen = valueSen - invested;
  return { id: acc.id, name: acc.name, kind: acc.holdingKind ?? "other", investedSen: invested, valueSen, plSen, plPct: invested > 0 ? Math.round((plSen / invested) * 1000) / 10 : 0,
    valuedOn: last?.on ?? null, interestSen: interest, accruedSen: accrued, rateBp: acc.rateBp ?? null, maturityOn: acc.maturityOn ?? null, fixed: FIXED.has(acc.holdingKind ?? "") };
}

/** A thing's worth on a day: the price paid (or the last value set by hand), changed by its yearly % for the years since; × its share. */
export function thingAt(t: Thing, on: string): number {
  if (on < t.boughtOn || (t.soldOn && on >= t.soldOn)) return 0;
  const useSet = t.valueSen != null && t.valueOn != null && t.valueOn <= on;
  const base = useSet ? t.valueSen! : t.costSen, from = useSet ? t.valueOn! : t.boughtOn;
  const years = days(from, on) / 365.25;
  // An estimate: whole thousands of rupiah, never false precision (a value set by hand on the day stays exact).
  const v = (base * Math.pow(1 + t.yearlyBp / 10000, years) * t.shareBp) / 10000;
  return years === 0 ? Math.round(v) : Math.round(v / 100_000) * 100_000;
}
/** What it cost (your share of it). */
export const thingCost = (t: Thing) => Math.round((t.costSen * t.shareBp) / 10000);

/** Each account's balance on a day (opening from its opening date + every flow up to it). */
export function balanceAt(acc: HAcc, txns: RTxn[], on: string): number {
  let b = acc.openingOn <= on ? acc.openingSen : 0;
  for (const t of txns) {
    if (t.on > on) continue;
    if (t.accountId === acc.id) b += t.kind === "income" ? t.amountSen : -t.amountSen;
    else if (t.kind === "transfer" && t.toAccountId === acc.id) b += t.amountSen;
  }
  return b;
}

export type Group = "cash" | "investments" | "fixed" | "things" | "business" | "other";
/** Net worth on a day with everything, by group (debts as what's owed). */
export function wealthAt(accounts: HAcc[], txns: RTxn[], vals: Val[], ts: Thing[], on: string) {
  const groups: Record<Group, { sen: number; costSen: number; count: number }> = { cash: { sen: 0, costSen: 0, count: 0 }, investments: { sen: 0, costSen: 0, count: 0 }, fixed: { sen: 0, costSen: 0, count: 0 }, things: { sen: 0, costSen: 0, count: 0 }, business: { sen: 0, costSen: 0, count: 0 }, other: { sen: 0, costSen: 0, count: 0 } };
  let oweSen = 0;
  for (const a of accounts) {
    if (a.openingOn > on && !txns.some((t) => t.on <= on && (t.accountId === a.id || t.toAccountId === a.id))) continue;
    if (OWED.has(a.type)) { oweSen += Math.max(0, -balanceAt(a, txns, on)); continue; }
    if (a.type === "investment") {
      const h = holdingAt(a, txns, vals, on); const g = h.fixed ? groups.fixed : groups.investments;
      if (h.valueSen || h.investedSen) { g.sen += h.valueSen; g.costSen += h.investedSen; g.count++; }
      continue;
    }
    const b = balanceAt(a, txns, on); const g = CASH.has(a.type) ? groups.cash : groups.other;
    g.sen += b; g.costSen += b; if (!a.archived || b) g.count++;
  }
  for (const t of ts) {
    const v = thingAt(t, on); if (!v && (on < t.boughtOn || (t.soldOn && on >= t.soldOn))) continue;
    const g = t.kind === "business" ? groups.business : groups.things;
    g.sen += v; g.costSen += thingCost(t); g.count++;
  }
  const haveSen = Object.values(groups).reduce((n, g) => n + g.sen, 0);
  return { on, groups, haveSen, oweSen, netSen: haveSen - oweSen };
}
