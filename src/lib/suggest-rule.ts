// Suggest a category from the owner's own history (FINNY-9): "Ngopi di Le Tusa" → Beli Kopi, because past "Ngopi …"
// transactions went there. Pure; tests/unit/suggest-rule.test.mts.
const STOP = new Set(["di", "ke", "dari", "untuk", "dan", "yang", "the", "a", "to", "for", "at", "of", "pak", "bu", "mas", "mbak", "via"]);

/** Lower-case words, without digits, punctuation or filler words. */
export function keywords(desc: string): string[] {
  return String(desc ?? "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z\s]/g, " ")
    .split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}

export type Past = { description: string; categoryId: string | null; on: string };

/** The category most often used for the same first keyword (ties: the most recent); then for any shared keyword. */
export function suggestCategory(desc: string, history: Past[]): string | null {
  const words = keywords(desc);
  if (!words.length) return null;
  const exact = desc.trim().toLowerCase();
  const pick = (match: (p: Past, kw: string[]) => boolean) => {
    const score = new Map<string, { n: number; last: string }>();
    for (const p of history) {
      if (!p.categoryId) continue;
      if (!match(p, keywords(p.description))) continue;
      const s = score.get(p.categoryId) ?? { n: 0, last: "" };
      s.n++; if (p.on > s.last) s.last = p.on; score.set(p.categoryId, s);
    }
    let best: [string, { n: number; last: string }] | null = null;
    for (const e of score) if (!best || e[1].n > best[1].n || (e[1].n === best[1].n && e[1].last > best[1].last)) best = e;
    return best?.[0] ?? null;
  };
  return pick((p) => p.description.trim().toLowerCase() === exact)
    ?? pick((_p, kw) => kw[0] === words[0])
    ?? pick((_p, kw) => kw.some((w) => words.includes(w)));
}
