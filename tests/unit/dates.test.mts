import { test } from "node:test";
import assert from "node:assert/strict";
import { todayIn, monthRange, shiftMonth, monthLabel, dayLabel, dayBefore, shortDate } from "../../src/lib/dates.ts";
test("today in Jakarta", () => { assert.equal(todayIn(new Date("2026-11-22T18:30:00Z")), "2026-11-23"); });
test("month ranges and shifts", () => {
  assert.deepEqual(monthRange("2026-12"), ["2026-12-01", "2027-01-01"]);
  assert.equal(shiftMonth("2026-01", -1), "2025-12"); assert.equal(shiftMonth("2026-11", 1), "2026-12");
  assert.equal(monthLabel("2026-11"), "November 2026");
  assert.throws(() => monthRange("2026-1"));
});
test("day labels", () => {
  assert.equal(dayLabel("2026-11-22", "2026-11-22"), "Today");
  assert.equal(dayLabel("2026-11-21", "2026-11-22"), "Yesterday");
  assert.match(dayLabel("2026-11-03", "2026-11-22"), /3 Nov/);
});
test("day before and short dates", () => { assert.equal(dayBefore("2026-12-01"), "2026-11-30"); assert.equal(shortDate("2026-11-23"), "23 Nov 2026"); });
