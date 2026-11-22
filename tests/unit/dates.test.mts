import { test } from "node:test";
import assert from "node:assert/strict";
import { todayIn, monthRange, shiftMonth, monthLabel, dayLabel } from "../../src/lib/dates.ts";
test("today in Jakarta", () => { assert.equal(todayIn(new Date("2026-11-22T18:30:00Z")), "2026-11-23"); });
test("month ranges and shifts", () => {
  assert.deepEqual(monthRange("2026-12"), ["2026-12-01", "2027-01-01"]);
  assert.equal(shiftMonth("2026-01", -1), "2025-12"); assert.equal(shiftMonth("2026-11", 1), "2026-12");
  assert.equal(monthLabel("2026-11"), "November 2026");
  assert.throws(() => monthRange("2026-1"));
});
test("day labels", () => {
  assert.equal(dayLabel("2026-11-22", "2026-11-22"), "Hari ini");
  assert.equal(dayLabel("2026-11-21", "2026-11-22"), "Kemarin");
  assert.match(dayLabel("2026-11-03", "2026-11-22"), /3 Nov/);
});
