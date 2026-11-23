import { test } from "node:test";
import assert from "node:assert/strict";
import { investedAt, holdingAt, accruedAt, thingAt, thingCost, wealthAt, type HAcc, type Thing } from "../../src/lib/asset-rule.ts";
import type { RTxn } from "../../src/lib/report-rule.ts";

const T = (on: string, kind: RTxn["kind"], amountSen: number, accountId: string, toAccountId: string | null = null): RTxn => ({ on, kind, amountSen, accountId, toAccountId, categoryId: kind === "transfer" ? null : "c" });
const bank: HAcc = { id: "bank", name: "BCA", type: "bank", openingSen: 10_000_000_00, openingOn: "2026-01-01" };
const fund: HAcc = { id: "fund", name: "Reksadana", type: "investment", openingSen: 0, openingOn: "2026-01-01", holdingKind: "fund" };
const dep: HAcc = { id: "dep", name: "Deposito", type: "investment", openingSen: 0, openingOn: "2026-01-01", holdingKind: "deposit", rateBp: 650, maturityOn: "2027-03-01" };
const card: HAcc = { id: "card", name: "Card", type: "card", openingSen: -1_000_000_00, openingOn: "2026-01-01" };
const txns: RTxn[] = [
  T("2026-02-01", "transfer", 4_000_000_00, "bank", "fund"), T("2026-05-01", "transfer", 1_000_000_00, "bank", "fund"), T("2026-08-01", "transfer", 500_000_00, "fund", "bank"),
  T("2026-03-01", "transfer", 3_650_000_00, "bank", "dep"), T("2026-09-01", "income", 50_000_00, "dep"),
];

test("invested = money in − money out up to a day; value = the latest typed value, else invested; P/L", () => {
  assert.equal(investedAt(fund, txns, "2026-04-30"), 4_000_000_00);
  assert.equal(investedAt(fund, txns, "2026-12-31"), 4_500_000_00);
  const before = holdingAt(fund, txns, [], "2026-06-01"); assert.deepEqual([before.valueSen, before.plSen, before.valuedOn], [5_000_000_00, 0, null]);
  const vals = [{ accountId: "fund", on: "2026-10-01", valueSen: 4_950_000_00 }, { accountId: "fund", on: "2026-11-20", valueSen: 5_058_000_00 }];
  const h = holdingAt(fund, txns, vals, "2026-11-23");
  assert.deepEqual([h.investedSen, h.valueSen, h.plSen, h.plPct, h.valuedOn], [4_500_000_00, 5_058_000_00, 558_000_00, 12.4, "2026-11-20"]);
  assert.equal(holdingAt(fund, txns, vals, "2026-10-15").valueSen, 4_950_000_00, "the value in force on that day");
});

test("fixed income: interest accrued by the day, less what's been paid; stops at maturity", () => {
  // 3.650.000 at 6,5% from 1 Mar to 1 Sep 2026 = 184 days → 3.650.000 × 0,065 × 184 / 365 = 119.600; 50.000 paid out → 69.600 still accrued.
  assert.equal(accruedAt(dep, txns, "2026-09-01"), 119_600_00 - 50_000_00);
  const h = holdingAt(dep, txns, [], "2026-09-01");
  assert.deepEqual([h.investedSen, h.interestSen, h.valueSen, h.plSen], [3_650_000_00, 50_000_00, 3_650_000_00 + 50_000_00 + 69_600_00, 119_600_00]);
  // After maturity (1 Mar 2027 = 365 days): 3.650.000 × 6,5% = 237.250 earned, 50.000 paid.
  assert.equal(accruedAt(dep, txns, "2027-06-01"), 237_250_00 - 50_000_00);
});

test("a thing's worth: depreciation by the year, a value set by hand, sold, a business share", () => {
  const motor: Thing = { id: "m", name: "Motor", kind: "vehicle", boughtOn: "2024-11-12", costSen: 24_000_000_00, yearlyBp: -1200, shareBp: 10000, valueSen: null, valueOn: null, soldOn: null };
  assert.equal(thingAt(motor, "2024-11-12"), 24_000_000_00);
  const twoYears = thingAt(motor, "2026-11-12"); assert.equal(twoYears, Math.round((24_000_000_00 * 0.88 ** (730 / 365.25)) / 100_000) * 100_000, "estimates in whole thousands of rupiah");
  assert.equal(thingAt(motor, "2024-01-01"), 0, "not bought yet");
  const set = { ...motor, valueSen: 20_000_000_00, valueOn: "2026-01-01" };
  assert.equal(thingAt(set, "2026-01-01"), 20_000_000_00, "a price check replaces the estimate");
  assert.ok(thingAt(set, "2027-01-01") < 20_000_000_00 && thingAt(set, "2025-06-01") > 20_000_000_00, "before the check, the estimate from the price paid");
  assert.equal(thingAt({ ...motor, soldOn: "2026-06-01" }, "2026-06-01"), 0, "sold");
  const stake: Thing = { id: "b", name: "Kedai", kind: "business", boughtOn: "2025-01-01", costSen: 50_000_000_00, yearlyBp: 0, shareBp: 2000, valueSen: 35_000_000_00, valueOn: "2026-10-01", soldOn: null };
  assert.equal(thingAt(stake, "2026-11-23"), 7_000_000_00); assert.equal(thingCost(stake), 10_000_000_00);
});

test("net worth with everything, by group", () => {
  const motor: Thing = { id: "m", name: "Motor", kind: "vehicle", boughtOn: "2026-01-01", costSen: 1_000_000_00, yearlyBp: 0, shareBp: 10000, valueSen: null, valueOn: null, soldOn: null };
  const w = wealthAt([bank, fund, dep, card], txns, [{ accountId: "fund", on: "2026-11-20", valueSen: 5_058_000_00 }], [motor], "2026-11-23");
  const bankBal = 10_000_000_00 - 4_000_000_00 - 1_000_000_00 + 500_000_00 - 3_650_000_00;
  assert.equal(w.groups.cash.sen, bankBal);
  assert.equal(w.groups.investments.sen, 5_058_000_00); assert.equal(w.groups.investments.costSen, 4_500_000_00);
  assert.equal(w.groups.fixed.costSen, 3_650_000_00);
  assert.equal(w.groups.things.sen, 1_000_000_00);
  assert.equal(w.oweSen, 1_000_000_00);
  assert.equal(w.netSen, bankBal + 5_058_000_00 + w.groups.fixed.sen + 1_000_000_00 - 1_000_000_00);
});
