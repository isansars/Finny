// Dates in the owner's time zone (Asia/Jakarta). Pure; tests/unit/dates.test.mts.
export const TZ = "Asia/Jakarta";
export function todayIn(now = new Date(), tz = TZ): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** "2026-11" → ["2026-11-01", "2026-12-01") */
export function monthRange(month: string): [string, string] {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error("month must look like 2026-11");
  const y = Number(m[1]), mo = Number(m[2]);
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return [`${month}-01`, `${next}-01`];
}
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export const monthLabel = (month: string) => { const [y, m] = month.split("-").map(Number); return `${MONTHS[m - 1]} ${y}`; };
/** "Hari ini", "Kemarin", or "Sen, 3 Nov". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Hari ini";
  const y = new Date(Date.parse(today + "T00:00:00Z") - 864e5).toISOString().slice(0, 10);
  if (day === y) return "Kemarin";
  const d = new Date(day + "T00:00:00Z");
  return new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(d);
}
