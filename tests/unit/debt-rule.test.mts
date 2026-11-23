import { test } from "node:test";
import assert from "node:assert/strict";
import { minimumFor, monthlyRate, orderFor, simulate, progressPct, nextDue, type Debt } from "../../src/lib/debt-rule.ts";

const none = { interestBp: null, interestPer: null, minFixedSen: null, minPctBp: null, minFloorSen: null } as const;
const D = (id: string, owedSen: number, t: Partial<Debt> = {}): Debt => ({ ...none, id, name: id, owedSen, ...t });

test("minimums: fixed, % with a floor, the 5% / Rp 50.000 default, never more than owed", () => {
  assert.equal(minimumFor({ ...none, minFixedSen: 25_000_000 }, 100_000_000), 25_000_000);
  assert.equal(minimumFor({ ...none, minPctBp: 1000, minFloorSen: 5_000_000 }, 312_000_000), 31_200_000);
  assert.equal(minimumFor({ ...none, minPctBp: 1000, minFloorSen: 5_000_000 }, 20_000_000), 5_000_000);
  assert.equal(minimumFor(none, 300_000_000), 15_000_000, "5% of 3.000.000");
  assert.equal(minimumFor(none, 30_000_000), 5_000_000, "the Rp 50.000 floor");
  assert.equal(minimumFor(none, 3_000_000), 3_000_000, "never more than owed");
  assert.equal(minimumFor(none, 0), 0);
  assert.equal(monthlyRate({ ...none, interestBp: 175, interestPer: "month" }), 0.0175);
  assert.equal(monthlyRate({ ...none, interestBp: 1200, interestPer: "year" }), 0.01);
});

test("order: snowball by smallest owed, avalanche by highest rate", () => {
  const ds = [D("big-cheap", 900, { interestBp: 100, interestPer: "month" }), D("small", 100, { interestBp: 200, interestPer: "month" }), D("mid-dear", 500, { interestBp: 300, interestPer: "month" })];
  assert.deepEqual(orderFor(ds, "snowball").map((d) => d.id), ["small", "mid-dear", "big-cheap"]);
  assert.deepEqual(orderFor(ds, "avalanche").map((d) => d.id), ["mid-dear", "small", "big-cheap"]);
});

test("a 0% debt with a fixed minimum: worked by hand", () => {
  // Rp 1.000.000 at Rp 250.000 a month, no interest: 4 months, Jan to Apr.
  const p = simulate([D("a", 100_000_000, { minFixedSen: 25_000_000 })], "minimums", 0, "2027-01");
  assert.deepEqual([p.months, p.debtFreeMonth, p.totalInterestSen, p.totalPaidSen], [4, "2027-04", 0, 100_000_000]);
  assert.equal(p.line.length, 5); assert.deepEqual(p.line.map((l) => l.owedSen), [100_000_000, 75_000_000, 50_000_000, 25_000_000, 0]);
});

test("snowball rolls the extra and freed minimums; worked by hand", () => {
  // A: 300.000 at 100.000 min; B: 1.000.000 at 100.000 min; no interest; extra 100.000 → budget 300.000 a month.
  // M1: A 300→100 (min 100 + extra 100… budget left 100 → A) A=100? min A 100 → 200; min B 100 → 900; left 100 → A → 100.
  // M2: A 100 → 0 (min), B 900 → 800 (min), left 100 → B → 700. M3: B 700 → 400 (all 300). M4: 400 → 100. M5: 100 → 0.
  const p = simulate([D("A", 30_000_000, { minFixedSen: 10_000_000 }), D("B", 100_000_000, { minFixedSen: 10_000_000 })], "snowball", 10_000_000, "2027-01");
  assert.deepEqual(p.order.map((o) => [o.id, o.payoffMonth]), [["A", "2027-02"], ["B", "2027-05"]]);
  assert.equal(p.months, 5); assert.equal(p.monthlyBudgetSen, 30_000_000);
  const min = simulate([D("A", 30_000_000, { minFixedSen: 10_000_000 }), D("B", 100_000_000, { minFixedSen: 10_000_000 })], "minimums", 10_000_000, "2027-01");
  assert.equal(min.months, 10, "minimums only: B takes 10 months"); assert.equal(min.extraSen, 0);
});

test("interest is added before paying; avalanche saves interest against snowball", () => {
  const ds = [D("card", 300_000_000, { interestBp: 175, interestPer: "month", minPctBp: 1000, minFloorSen: 5_000_000 }), D("paylater", 100_000_000, { interestBp: 290, interestPer: "month", minFixedSen: 25_000_000 })];
  const sb = simulate(ds, "snowball", 50_000_000, "2026-12"), av = simulate(ds, "avalanche", 50_000_000, "2026-12"), mn = simulate(ds, "minimums", 50_000_000, "2026-12");
  assert.ok(sb.debtFreeMonth && av.debtFreeMonth && mn.debtFreeMonth);
  assert.ok(av.totalInterestSen <= sb.totalInterestSen, "avalanche never pays more interest here");
  assert.ok(mn.totalInterestSen > sb.totalInterestSen, "an extra saves interest");
  assert.equal(sb.totalPaidSen, 400_000_000 + sb.totalInterestSen, "everything owed plus interest is paid");
  // First month by hand: card 3.000.000 + 52.500 interest; paylater 1.000.000 + 29.000.
  assert.equal(sb.line[1].owedSen, 400_000_000 + 5_250_000 + 2_900_000 - sb.monthlyBudgetSen);
});

test("a debt that never shrinks is named, not looped", () => {
  const p = simulate([D("loan", 100_000_000, { interestBp: 500, interestPer: "month", minFixedSen: 1_000_000 })], "minimums", 0, "2027-01");
  assert.equal(p.debtFreeMonth, null); assert.deepEqual(p.stuck, ["loan"]); assert.ok(p.line.length <= 14);
});

test("progress and the next due date", () => {
  assert.equal(progressPct(312_000_000, 400_000_000), 22); assert.equal(progressPct(0, 400_000_000), 100); assert.equal(progressPct(5, 0), 0);
  assert.deepEqual(nextDue("2026-11-23", 5, 20), { due: "2026-12-05", statement: "2026-11-20" });
  assert.deepEqual(nextDue("2026-11-03", 5, 20), { due: "2026-11-05", statement: "2026-10-20" });
  assert.deepEqual(nextDue("2026-11-23", 1, null), { due: "2026-12-01", statement: null });
  assert.deepEqual(nextDue("2027-01-31", 31, 15), { due: "2027-01-31", statement: "2027-01-15" });
  assert.deepEqual(nextDue("2027-02-10", 31, 15), { due: "2027-02-28", statement: "2027-02-15" });
});
