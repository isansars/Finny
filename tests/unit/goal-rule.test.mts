import { test } from "node:test";
import assert from "node:assert/strict";
import { goalFigures, monthsLeft, neededPerMonth, paceOf, pctChange, pctOf, projection, savedFrom } from "../../src/lib/goal-rule.ts";

const rp = (n: number) => n * 100; // rupiah → sen

test("saved: all or a part of each account, never above its value, never below 0", () => {
  // 45.000.000 of BCA's 64.000.000 + all of RDPU 36.000.000 = 81.000.000; a part above a 1.000.000 balance counts 1.000.000;
  // an overdrawn account counts 0.
  assert.equal(savedFrom([{ valueSen: rp(64_000_000), partSen: rp(45_000_000) }, { valueSen: rp(36_000_000), partSen: null }]), rp(81_000_000));
  assert.equal(savedFrom([{ valueSen: rp(1_000_000), partSen: rp(5_000_000) }, { valueSen: rp(-200_000), partSen: null }]), rp(1_000_000));
});

test("% of target, at most 100", () => {
  assert.equal(pctOf(rp(81_000_000), rp(150_000_000)), 54);
  assert.equal(pctOf(rp(160_000_000), rp(150_000_000)), 100);
  assert.equal(pctOf(rp(-5), rp(100)), 0);
});

test("needed a month: what's left over the months left, rounded up to Rp 100.000", () => {
  // From Nov 2026 to Jun 2028: 19 months. 69.000.000 ÷ 19 = 3.631.578,9 → 3.700.000.
  assert.equal(monthsLeft("2028-06", "2026-11"), 19);
  assert.equal(neededPerMonth(rp(81_000_000), rp(150_000_000), "2028-06", "2026-11"), rp(3_700_000));
  // A date already passed asks for the rest now; reached needs nothing; no date, no figure.
  assert.equal(monthsLeft("2026-09", "2026-11"), 1);
  assert.equal(neededPerMonth(rp(10_000_000), rp(12_000_000), "2026-09", "2026-11"), rp(2_000_000));
  assert.equal(neededPerMonth(rp(12_000_000), rp(12_000_000), "2026-12", "2026-11"), 0);
  assert.equal(neededPerMonth(rp(1), rp(2), null, "2026-11"), null);
});

test("pace: growth a month over the months there are", () => {
  // 81.000.000 now, 68.400.000 six month-ends ago: 12.600.000 ÷ 6 = 2.100.000 a month.
  assert.equal(paceOf(rp(81_000_000), rp(68_400_000), 6), rp(2_100_000));
  assert.equal(paceOf(rp(10_000_000), rp(10_000_000), 0), 0, "no history");
  assert.equal(paceOf(rp(9_000_000), rp(10_000_000), 2), rp(-500_000), "shrinking");
});

test("goal figures: behind, on track, reached, no date", () => {
  const behind = goalFigures({ targetSen: rp(150_000_000), byMonth: "2028-06", savedSen: rp(81_000_000), thenSen: rp(68_400_000), paceMonths: 6 }, "2026-11");
  // Needed 3.700.000, pace 2.100.000: behind by 1.600.000. At the pace: 69.000.000 ÷ 2.100.000 = 32,9 → 33 months → Aug 2029.
  assert.deepEqual([behind.pct, behind.neededSen, behind.paceSen, behind.onTrack, behind.behindSen, behind.reachedAtPace], [54, rp(3_700_000), rp(2_100_000), false, rp(1_600_000), "2029-08"]);
  const trip = goalFigures({ targetSen: rp(30_000_000), byMonth: "2027-04", savedSen: rp(21_600_000), thenSen: rp(9_600_000), paceMonths: 6 }, "2026-11");
  // Needed: 8.400.000 ÷ 5 = 1.680.000 → 1.700.000; pace 12.000.000 ÷ 6 = 2.000.000: on track; 8,4 ÷ 2 = 4,2 → 5 months → Apr 2027.
  assert.deepEqual([trip.neededSen, trip.paceSen, trip.onTrack, trip.behindSen, trip.reachedAtPace], [rp(1_700_000), rp(2_000_000), true, 0, "2027-04"]);
  const done = goalFigures({ targetSen: rp(10_000_000), byMonth: null, savedSen: rp(12_000_000), thenSen: rp(12_000_000), paceMonths: 6 }, "2026-11");
  assert.deepEqual([done.reached, done.onTrack, done.pct, done.leftSen, done.reachedAtPace], [true, true, 100, 0, "2026-11"]);
  const noDate = goalFigures({ targetSen: rp(100_000_000), byMonth: null, savedSen: rp(40_000_000), thenSen: rp(40_000_000), paceMonths: 3 }, "2026-11");
  assert.deepEqual([noDate.neededSen, noDate.onTrack, noDate.reachedAtPace], [null, false, null], "no date and no growth");
});

test("projection lines for the chart", () => {
  const p = projection(rp(80_000_000), rp(100_000_000), rp(5_000_000), rp(2_000_000), "2027-03", "2026-11");
  assert.equal(p.needed.length, 5, "Nov to Mar: 4 months, 5 points");
  assert.deepEqual(p.needed.at(-1), { month: "2027-03", sen: rp(100_000_000) });
  assert.equal(p.pace.length, 11, "20.000.000 at 2.000.000 a month: 10 months");
  assert.deepEqual(p.pace.at(-1), { month: "2027-09", sen: rp(100_000_000) });
  assert.equal(projection(rp(1), rp(100_000_000_000), null, rp(1_000), null, "2026-11").months, 60, "at most 60 months");
});

test("change in the review: % at the month's end minus the month before", () => {
  assert.equal(pctChange(rp(21_600_000), rp(19_200_000), rp(30_000_000)), 8);
});
