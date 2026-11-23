import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendedMonths, sourceAmount, reachedMonth, emergencyFund } from "../../src/lib/emergency-rule.ts";

test("recommended months by stability, one more per dependent, up to 3", () => {
  assert.deepEqual(recommendedMonths("stable", 0), [3, 6]);
  assert.deepEqual(recommendedMonths("fair", 0), [6, 9]);
  assert.deepEqual(recommendedMonths("uncertain", 2), [11, 14]);
  assert.deepEqual(recommendedMonths("fair", 7), [9, 12]);
});

test("a source counts all of it, or a part never above it", () => {
  assert.equal(sourceAmount({ accountId: "a", valueSen: 500, partSen: null }), 500);
  assert.equal(sourceAmount({ accountId: "a", valueSen: 500, partSen: 200 }), 200);
  assert.equal(sourceAmount({ accountId: "a", valueSen: 100, partSen: 200 }), 100);
  assert.equal(sourceAmount({ accountId: "a", valueSen: -50, partSen: null }), 0);
});

test("the month it's reached, by hand", () => {
  // 37.200.000 to 60.000.000 at 2.000.000 a month: 22.800.000 ÷ 2.000.000 = 11,4 → 12 months after Nov 2026 = Nov 2027.
  assert.equal(reachedMonth(37_200_000_00, 60_000_000_00, 2_000_000_00, "2026-11"), "2027-11");
  assert.equal(reachedMonth(60_000_000_00, 60_000_000_00, 0, "2026-11"), "2026-11");
  assert.equal(reachedMonth(1, 2, 0, "2026-11"), null);
});

test("the fund: target, set aside, %, months covered, to go", () => {
  const f = emergencyFund({ stability: "fair", dependents: 0, spendingSen: 10_000_000_00, target: "low", ownTargetSen: null, monthlySen: 2_000_000_00 },
    [{ accountId: "krom", valueSen: 20_200_000_00, partSen: null }, { accountId: "dep", valueSen: 15_000_000_00, partSen: null }, { accountId: "bca", valueSen: 42_300_000_00, partSen: 2_000_000_00 }], "2026-11");
  assert.deepEqual([f.months, f.targetSen, f.highSen, f.setAsideSen, f.pct, f.coveredMonths, f.toGoSen, f.reached], [[6, 9], 60_000_000_00, 90_000_000_00, 37_200_000_00, 62, 3.7, 22_800_000_00, "2027-11"]);
  const own = emergencyFund({ stability: "fair", dependents: 0, spendingSen: 10_000_000_00, target: "own", ownTargetSen: 50_000_000_00, monthlySen: 0 }, [], "2026-11");
  assert.deepEqual([own.targetSen, own.targetMonths, own.reached], [50_000_000_00, 5, null]);
  assert.equal(emergencyFund({ stability: "fair", dependents: 0, spendingSen: 1, target: "low", ownTargetSen: null, monthlySen: 0 }, [{ accountId: "a", valueSen: 100, partSen: null }], "2026-11").pct, 100);
});
