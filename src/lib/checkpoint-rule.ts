// FINNY-212: "Check with statements". Every saved statement's opening and closing balance is a dated checkpoint; Finny's own
// balance on that day is set beside it, and the first day they part is named. Pure; tests/unit/checkpoint-rule.test.mts.
// Balances are as Finny shows them for the account: a card's or a loan's is negative while something is owed.

export type CpAcc = { id: string; type: string; openingSen: number; openingOn: string };
export type CpTxn = { on: string; kind: "spend" | "income" | "transfer"; amountSen: number; accountId: string; toAccountId: string | null };
export type CpBatch = { id: string; periodFrom: string | null; periodTo: string | null; openingSen: number | null; closingSen: number | null };
export type Point = { on: string; bankSen: number; finnySen: number; apartSen: number };

const DAY = 86_400_000;
export const dayBefore = (iso: string) => new Date(Date.parse(iso + "T00:00:00Z") - DAY).toISOString().slice(0, 10);

/** The statement's figures as Finny's balance: a card bill or a loan's amount owed is turned negative. */
export function asBalance(type: string, sen: number): number { return type === "card" || type === "loan" ? -sen : sen; }

function effect(t: CpTxn, id: string): number {
  if (t.accountId === id) return t.kind === "income" ? t.amountSen : -t.amountSen;
  if (t.kind === "transfer" && t.toAccountId === id) return t.amountSen;
  return 0;
}

/** Finny's balance at the end of each day asked for. */
export function balancesOn(acc: CpAcc, txns: CpTxn[], days: string[]): Map<string, number> {
  const sorted = [...txns].filter((t) => effect(t, acc.id) !== 0).sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  const out = new Map<string, number>();
  let i = 0, run = 0;
  for (const d of [...new Set(days)].sort()) {
    while (i < sorted.length && sorted[i].on <= d) run += effect(sorted[i++], acc.id);
    out.set(d, (dayBefore(acc.openingOn) <= d ? acc.openingSen : 0) + run); // an opening balance on a day is how the day starts
  }
  return out;
}

/** Each statement gives two checkpoints: its opening balance (the end of the day before it starts) and its closing balance. */
export function checkpoints(acc: CpAcc, txns: CpTxn[], batches: CpBatch[]) {
  const bank = new Map<string, number>();
  for (const b of [...batches].sort((x, y) => String(x.periodTo).localeCompare(String(y.periodTo)))) {
    if (b.periodFrom && b.openingSen != null && !bank.has(dayBefore(b.periodFrom))) bank.set(dayBefore(b.periodFrom), b.openingSen);
    if (b.periodTo && b.closingSen != null) bank.set(b.periodTo, b.closingSen); // a later statement's closing wins over nothing; equal days agree
  }
  const days = [...bank.keys()].sort();
  const finny = balancesOn(acc, txns, days);
  const points: Point[] = days.map((on) => ({ on, bankSen: bank.get(on)!, finnySen: finny.get(on)!, apartSen: finny.get(on)! - bank.get(on)! }));
  const first = points.findIndex((p) => p.apartSen !== 0);
  const parted = first >= 0 ? points[first] : null;
  const since = first >= 0 ? points.slice(first) : [];
  return {
    points,
    matched: points.filter((p) => p.apartSen === 0).length,
    parted: parted ? {
      on: parted.on,
      apartSen: parted.apartSen,
      steady: since.every((p) => p.apartSen === parted.apartSen), // the same gap since: something before that day is missing or extra
      from: first > 0 ? new Date(Date.parse(points[first - 1].on + "T00:00:00Z") + DAY).toISOString().slice(0, 10) : null, // the lines to look at
    } : null,
  };
}
