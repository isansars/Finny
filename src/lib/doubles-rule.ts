// FINNY-212: "Possible doubles". Lines that look recorded twice, each with its reason. Pure; tests/unit/doubles-rule.test.mts.
//   card:      two payments into the same card up to 3 days and Rp 10.000 apart (one typed from the card bill, one from the bank)
//   transfer:  the same move between the same two accounts, the same amount, up to 3 days apart (seen by both banks' statements)
//   same-day:  the same day, account, kind, amount and description: perhaps two purchases, so never ticked for the owner
// A line marked "Looks fine" (looksOk) is never listed. Each line is in one pair at most.

export const FEE_SEN = 1_000_000; // Rp 10.000
export type DTxn = { id: string; on: string; kind: "spend" | "income" | "transfer"; amountSen: number; accountId: string; toAccountId: string | null;
  description: string; looksOk: boolean; createdAt: string; fromCardBill?: boolean };
export type Double = { reason: "card" | "transfer" | "same-day"; sure: boolean; removeId: string; keepId: string; daysApart: number; apartSen: number };

const days = (a: string, b: string) => Math.abs(Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function findDoubles(txns: DTxn[], typeOf: (accountId: string) => string): Double[] {
  const live = txns.filter((t) => !t.looksOk).sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : a.createdAt.localeCompare(b.createdAt)));
  const used = new Set<string>();
  const out: Double[] = [];
  const later = (a: DTxn, b: DTxn) => (a.createdAt > b.createdAt ? [a, b] : [b, a]);
  const owes = (id: string | null) => !!id && (typeOf(id) === "card" || typeOf(id) === "loan");
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < live.length && days(live[j].on, a.on) <= 3; j++) {
      const b = live[j];
      if (used.has(b.id) || a.kind !== b.kind) continue;
      const gap = Math.abs(a.amountSen - b.amountSen), d = days(a.on, b.on);
      let pick: Double | null = null;
      if (a.kind === "transfer" && a.toAccountId === b.toAccountId && owes(a.toAccountId) && gap <= FEE_SEN) {
        const [rm, keep] = a.fromCardBill && !b.fromCardBill ? [a, b] : b.fromCardBill && !a.fromCardBill ? [b, a] : later(a, b);
        pick = { reason: "card", sure: true, removeId: rm.id, keepId: keep.id, daysApart: d, apartSen: gap };
      } else if (a.kind === "transfer" && gap === 0 && a.accountId === b.accountId && a.toAccountId === b.toAccountId) {
        const [rm, keep] = later(a, b);
        pick = { reason: "transfer", sure: true, removeId: rm.id, keepId: keep.id, daysApart: d, apartSen: 0 };
      } else if (a.kind !== "transfer" && d === 0 && gap === 0 && a.accountId === b.accountId && norm(a.description) === norm(b.description)) {
        const [rm, keep] = later(a, b);
        pick = { reason: "same-day", sure: false, removeId: rm.id, keepId: keep.id, daysApart: 0, apartSen: 0 };
      }
      if (pick) { out.push(pick); used.add(a.id); used.add(b.id); break; }
    }
  }
  return out;
}
