// CSV for the export (FINNY-24). Pure; tests/unit/csv.test.mts.
export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    // Quote when needed; a leading = + - @ is prefixed with ' so a spreadsheet never runs it as a formula.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? "'" + s : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\n") + "\n";
}
/** Sen as plain rupiah for a spreadsheet: 2499391 → "24993.91", 4389000 → "43890". */
export const senToPlain = (sen: number | null | undefined) => sen == null ? "" : (sen % 100 ? (sen / 100).toFixed(2) : String(sen / 100));
