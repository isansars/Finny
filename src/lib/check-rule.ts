// FINNY-171: Finny's guesses at a mistake in the records. Pure: no database, no DOM.
//  - "twice": two or more transactions with the same kind, account (and, for a transfer, the same other account), day and
//    amount. A statement read on top of a typed entry, or the same spend typed twice, looks like this.
//  - "usual": a spend at least 5× the median of the same category's spends in the 90 days before it, when there are at least
//    3 of them. A typo with an extra zero looks like this.
// A transaction the owner marked as looking fine is never flagged.

export type CheckRow = { id: string; on: string; kind: string; amountSen: number; accountId: string; toAccountId: string | null; categoryId: string | null; looksOk?: boolean };
export type Flag = { kind: "twice" } | { kind: "usual"; times: number };

export const USUAL_TIMES = 5;
export const USUAL_DAYS = 90;
export const USUAL_MIN = 3;

const dayNo = (d: string) => Date.parse(d + "T00:00:00Z") / 86_400_000;
function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/** Flags for `rows`, judged against `history` (every transaction that could be a twin or set the usual; it may include `rows`). */
export function checkFlags(rows: CheckRow[], history: CheckRow[]): Map<string, Flag[]> {
  const out = new Map<string, Flag[]>();
  const all = new Map<string, CheckRow>(); for (const r of [...history, ...rows]) all.set(r.id, r);
  const key = (r: CheckRow) => [r.kind, r.accountId, r.kind === "transfer" ? r.toAccountId ?? "" : "", r.on, r.amountSen].join("|");
  const twins = new Map<string, number>(); for (const r of all.values()) twins.set(key(r), (twins.get(key(r)) ?? 0) + 1);
  // Spends by category, in day order, for the median of the 90 days before each one.
  const byCat = new Map<string, { day: number; sen: number }[]>();
  for (const r of all.values()) if (r.kind === "spend" && r.categoryId) { const l = byCat.get(r.categoryId) ?? []; l.push({ day: dayNo(r.on), sen: r.amountSen }); byCat.set(r.categoryId, l); }
  for (const r of rows) {
    if (r.looksOk) continue;
    const f: Flag[] = [];
    if ((twins.get(key(r)) ?? 0) > 1) f.push({ kind: "twice" });
    if (r.kind === "spend" && r.categoryId) {
      const d = dayNo(r.on);
      const before = (byCat.get(r.categoryId) ?? []).filter((x) => x.day < d && x.day >= d - USUAL_DAYS).map((x) => x.sen);
      if (before.length >= USUAL_MIN) { const m = median(before); if (m > 0 && r.amountSen >= USUAL_TIMES * m) f.push({ kind: "usual", times: Math.floor(r.amountSen / m) }); }
    }
    if (f.length) out.set(r.id, f);
  }
  return out;
}

/** "Twice?", "10× usual". */
export const flagLabel = (f: Flag) => (f.kind === "twice" ? "Twice?" : `${f.times}× usual`);
