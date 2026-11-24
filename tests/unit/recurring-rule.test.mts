import { test } from "node:test";
import assert from "node:assert/strict";
import { comingUp, daysOf, dueDays, nextDay, perMonth, suggestionKey, suggestions, type HTxn, type Rule } from "../../src/lib/recurring-rule.ts";

const rp = (n: number) => n * 100;
const M = (anchorOn: string, endOn: string | null = null): Rule => ({ every: "month", anchorOn, endOn });

test("monthly: the anchor's day, or the last day of a shorter month", () => {
  // By hand: from 31 Jan 2027, Feb has 28 days (2027) and Apr 30; 2028 is a leap year (29 Feb).
  assert.deepEqual(daysOf(M("2027-01-31"), "2027-01-01", "2027-05-31"), ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
  assert.deepEqual(daysOf(M("2027-01-31"), "2028-02-01", "2028-02-29"), ["2028-02-29"]);
  assert.deepEqual(daysOf(M("2026-11-05"), "2026-10-01", "2026-12-31"), ["2026-11-05", "2026-12-05"], "never before its anchor");
  assert.deepEqual(daysOf(M("2026-11-05", "2027-01-04"), "2026-11-01", "2027-03-31"), ["2026-11-05", "2026-12-05"], "never after its end");
  assert.deepEqual(daysOf(M("2026-12-25"), "2026-12-26", "2027-01-24"), [], "nothing in between");
});

test("weekly on its weekday; yearly on its date", () => {
  // 24 Nov 2026 is a Tuesday; the Tuesdays after it in the range are 1, 8 and 15 Dec.
  assert.deepEqual(daysOf({ every: "week", anchorOn: "2026-11-24", endOn: null }, "2026-11-30", "2026-12-15"), ["2026-12-01", "2026-12-08", "2026-12-15"]);
  assert.deepEqual(daysOf({ every: "year", anchorOn: "2024-02-29", endOn: null }, "2024-01-01", "2028-12-31"), ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
});

test("due: up to today, at most 60 days back, not before it began, not done", () => {
  const r = M("2026-01-01");
  // Today 24 Nov 2026; 60 days back is 25 Sep, so the days are 1 Oct and 1 Nov; 1 Oct was skipped.
  assert.deepEqual(dueDays(r, "2026-01-01", new Set(), "2026-11-24"), ["2026-10-01", "2026-11-01"]);
  assert.deepEqual(dueDays(r, "2026-01-01", new Set(["2026-10-01"]), "2026-11-24"), ["2026-11-01"]);
  assert.deepEqual(dueDays(r, "2026-11-10", new Set(), "2026-11-24"), [], "made on 10 Nov: 1 Nov isn't owed");
  assert.deepEqual(dueDays(M("2026-11-24"), "2026-11-24", new Set(), "2026-11-24"), ["2026-11-24"], "due today");
});

test("next day and coming up (the next 7 days)", () => {
  assert.equal(nextDay(M("2026-01-01"), "2026-11-24"), "2026-12-01");
  assert.equal(nextDay(M("2026-01-01", "2026-11-30"), "2026-11-24"), null, "ended");
  assert.deepEqual(comingUp(M("2026-01-01"), "2026-11-24"), ["2026-12-01"]);
  assert.deepEqual(comingUp(M("2026-01-02"), "2026-11-24"), [], "2 Dec is 8 days away");
  assert.deepEqual(comingUp({ every: "week", anchorOn: "2026-11-02", endOn: null }, "2026-11-24"), ["2026-11-30"]);
});

test("a month: weekly × 52 ÷ 12, yearly ÷ 12, whole rupiah", () => {
  assert.equal(perMonth("month", rp(54_900)), rp(54_900));
  assert.equal(perMonth("week", rp(100_000)), rp(433_333), "100.000 × 52 ÷ 12 = 433.333,3");
  assert.equal(perMonth("year", rp(1_200_000)), rp(100_000));
});

test("suggestions: same place and amount, 3+ months in a row, days within 3, still going", () => {
  const tx = (on: string, description: string, amount: number, kind = "spend", accountId = "cc"): HTxn => ({ on, kind, amountSen: rp(amount), accountId, categoryId: "c", description });
  const h = [
    tx("2026-06-01", "Netflix", 54_900), tx("2026-07-02", "Netflix", 54_900), tx("2026-08-01", "Netflix", 54_900), tx("2026-09-03", "Netflix", 54_900), tx("2026-10-01", "Netflix", 54_900), tx("2026-11-02", "netflix ", 54_900),
    tx("2026-09-01", "Gaji", 15_000_000, "income", "bca"), tx("2026-10-01", "Gaji", 15_000_000, "income", "bca"), tx("2026-11-01", "Gaji", 15_000_000, "income", "bca"),
    tx("2026-09-05", "Kopi", 45_000), tx("2026-09-20", "Kopi", 45_000), tx("2026-10-05", "Kopi", 45_000), tx("2026-11-05", "Kopi", 45_000), // twice in September
    tx("2026-09-01", "Gym", 300_000), tx("2026-10-15", "Gym", 300_000), tx("2026-11-01", "Gym", 300_000), // days 1, 15, 1: too far apart
    tx("2026-06-10", "Spotify", 54_990), tx("2026-07-10", "Spotify", 54_990), tx("2026-08-10", "Spotify", 54_990), // stopped in August
    tx("2026-10-03", "Sewa", 2_500_000), tx("2026-11-03", "Sewa", 2_500_000), // only 2 months
  ];
  const s = suggestions(h, "2026-11", new Set());
  assert.deepEqual(s.map((x) => [x.name, x.months, x.day]), [["netflix", 6, 2], ["Gaji", 3, 1]]);
  assert.equal(s[0].key, suggestionKey("Netflix", "cc", rp(54_900)), "the key ignores case and spaces");
  assert.deepEqual(suggestions(h, "2026-11", new Set([s[0].key])).map((x) => x.name), ["Gaji"], "already recurring or dismissed");
  assert.deepEqual(suggestions(h, "2027-01", new Set()).map((x) => x.name), [], "nothing since November: not still going");
});
