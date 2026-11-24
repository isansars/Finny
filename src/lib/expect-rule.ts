// FINNY-193: a change or delete made offline carries the transaction as the phone last saw it (`expect`). If the row
// has changed since (on another device), Finny refuses rather than overwrite it. Pure, shared with the tests.
export const SEEN_FIELDS = ["on", "kind", "amountSen", "accountId", "toAccountId", "categoryId", "description", "note", "entity"] as const;
export type SeenField = (typeof SEEN_FIELDS)[number];
export type Seen = Partial<Record<SeenField, unknown>>;

const norm = (k: SeenField, v: unknown) => {
  if (v === undefined || v === null || v === "") return null;
  if (k === "amountSen") return Number(v);
  return typeof v === "string" ? v.trim() : v;
};

/** The fields that differ between what the phone saw and the row now (empty: unchanged). */
export function changedSince(seen: Seen, now: Seen): SeenField[] {
  return SEEN_FIELDS.filter((k) => norm(k, seen[k]) !== norm(k, now[k]));
}

/** `expect` from a request body, or null when the request didn't send one (online edits work as before). */
export function expectFrom(body: Record<string, unknown> | null | undefined): Seen | null {
  const e = body?.expect;
  return e && typeof e === "object" && !Array.isArray(e) ? (e as Seen) : null;
}
