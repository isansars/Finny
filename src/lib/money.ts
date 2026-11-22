// Rupiah ⇄ sen. Money is stored as integer sen (rupiah × 100) so sums are exact (Penny). Pure; tests/unit/money.test.mts.

/** Parses what a person types: "43890", "43.890", "Rp 43.890", "43.890,50", "43,890.50", "-25.000". Null when it isn't a number. */
export function parseRupiah(input: string): number | null {
  let s = String(input ?? "").trim().replace(/^rp\.?\s*/i, "").replace(/\s/g, "");
  let sign = 1;
  if (s.startsWith("-") || s.startsWith("−")) { sign = -1; s = s.slice(1); }
  if (!s || !/^[\d.,]+$/.test(s)) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let intPart = s, frac = "";
  // The decimal separator is the last one when it has 1–2 digits after it; otherwise every separator groups thousands.
  const sep = lastDot > lastComma ? "." : ",";
  const at = Math.max(lastDot, lastComma);
  if (at >= 0 && s.length - at - 1 <= 2 && s.length - at - 1 >= 1) {
    const other = sep === "." ? "," : ".";
    // "43.890" (3 digits after) is thousands; "43.89" is decimals only if no other separator suggests Indonesian grouping.
    if (!(sep === "." && s.indexOf(".") !== at)) { intPart = s.slice(0, at); frac = s.slice(at + 1); if (intPart.includes(sep) && !intPart.includes(other)) return null; }
  }
  const digits = intPart.replace(/[.,]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const sen = Number(digits) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(sen) ? sign * sen : null;
}

/** "Rp 43.890", "Rp 24.993,91", "−Rp 25.000". `sign: "never"` drops the minus (transfers). */
export function formatRupiah(sen: number, opts: { sign?: "auto" | "always" | "never"; prefix?: boolean } = {}): string {
  const neg = sen < 0, abs = Math.abs(Math.trunc(sen));
  const rp = Math.floor(abs / 100), cents = abs % 100;
  const grouped = String(rp).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const body = `${opts.prefix === false ? "" : "Rp "}${grouped}${cents ? "," + String(cents).padStart(2, "0") : ""}`;
  const sign = opts.sign ?? "auto";
  if (sign === "never") return body;
  if (neg) return "−" + body;
  return sign === "always" && sen > 0 ? "+" + body : body;
}
