// Account balances are computed, never typed (FINNY-8). Pure; tests/unit/balance-rule.test.mts.
// balance = opening + income in − spending out − transfers out + transfers in.
// A credit card or loan carries a negative balance (what you owe): used = −balance, available = limit − used.
export type Flows = { income: number; spend: number; transferOut: number; transferIn: number };
export const NO_FLOWS: Flows = { income: 0, spend: 0, transferOut: 0, transferIn: 0 };

export function balanceOf(openingSen: number, f: Flows = NO_FLOWS): number {
  return openingSen + f.income - f.spend - f.transferOut + f.transferIn;
}

export function cardView(balanceSen: number, limitSen: number | null | undefined) {
  const used = Math.max(0, -balanceSen);
  return { used, limit: limitSen ?? null, available: limitSen == null ? null : limitSen - used };
}

/** Adds one transaction to per-account flows (used by the API after it sums rows by kind). */
export function addFlow(map: Map<string, Flows>, t: { kind: string; amountSen: number; accountId: string; toAccountId?: string | null }) {
  const get = (id: string) => { let f = map.get(id); if (!f) map.set(id, (f = { ...NO_FLOWS })); return f; };
  if (t.kind === "income") get(t.accountId).income += t.amountSen;
  else if (t.kind === "spend") get(t.accountId).spend += t.amountSen;
  else if (t.kind === "transfer" && t.toAccountId) { get(t.accountId).transferOut += t.amountSen; get(t.toAccountId).transferIn += t.amountSen; }
  return map;
}
