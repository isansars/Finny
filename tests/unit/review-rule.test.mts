import { test } from "node:test";
import assert from "node:assert/strict";
import { averageKeptPct, budgetCheck, budgetWarnings, daysSince, debtsPaid, dueMonth, keptPctOf, planNext, roundUp, shiftMonth, statementStep, steps } from "../../src/lib/review-rule.ts";
import type { Line } from "../../src/lib/budget-rule.ts";

const L = (categoryId: string, plannedSen: number, spentSen: number, every = false): Line =>
  ({ categoryId, plannedSen, spentSen, leftSen: plannedSen - spentSen, pct: Math.round((spentSen / plannedSen) * 100), state: spentSen > plannedSen ? "over" : spentSen >= plannedSen * 0.9 ? "close" : "ok", every, covers: [] });
const rp = (n: number) => n * 100; // rupiah → sen

test("the due month is last month, from the 1st, until closed, only with transactions", () => {
  const txns = new Set(["2026-10"]);
  assert.equal(dueMonth("2026-11-01", new Set(), txns), "2026-10");
  assert.equal(dueMonth("2026-11-30", new Set(), txns), "2026-10");
  assert.equal(dueMonth("2026-11-02", new Set(["2026-10"]), txns), null, "closed");
  assert.equal(dueMonth("2026-12-05", new Set(), txns), null, "November has no transactions");
  assert.equal(dueMonth("2027-01-03", new Set(), new Set(["2026-12"])), "2026-12", "across the year");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
});

test("statements: accounts ever read by statement; read for the month its period ends in", () => {
  const accs = [{ id: "bca", name: "BCA", type: "bank" }, { id: "bri", name: "BRI card", type: "card" }, { id: "cash", name: "Cash", type: "cash" }, { id: "old", name: "Old", type: "bank", archived: true }];
  const batches = [
    { accountId: "bca", periodFrom: "2026-09-01", periodTo: "2026-09-30", txns: 50 },
    { accountId: "bca", periodFrom: "2026-10-01", periodTo: "2026-10-31", txns: 64 },
    { accountId: "bri", periodFrom: "2026-08-21", periodTo: "2026-09-20", txns: 12 }, // a card period ending in September
    { accountId: "old", periodFrom: "2026-10-01", periodTo: "2026-10-31", txns: 3 },
    { accountId: null, periodFrom: null, periodTo: null, txns: 2000 }, // a workbook import
  ];
  const s = statementStep(accs, batches, "2026-10");
  assert.deepEqual(s.accounts.map((a) => [a.name, a.read, a.lines]), [["BCA", true, 64], ["BRI card", false, 0]]);
  assert.deepEqual([s.read, s.total, s.done], [1, 2, false]);
  const sep = statementStep(accs, batches, "2026-09");
  assert.deepEqual([sep.read, sep.done], [2, true], "the card's 21 Aug – 20 Sep counts for September");
  assert.equal(statementStep(accs, [], "2026-10").done, true, "no statement accounts: nothing to do");
});

test("budget check: over (most over first), under, used %, kept and its %", () => {
  // By hand: Makan 2.240.000 of 2.000.000 = 112%, over 240.000; Transport 1.040.000 of 1.000.000 = 104%, over 40.000;
  // Belanja 2.340.000 of 3.000.000, under 660.000. Planned 6.000.000, spent 5.620.000 = 94% (93,67 rounds to 94).
  // In 15.000.000, out 11.790.000: kept 3.210.000 = 21,4% → 21%.
  const lines = [L("makan", rp(2_000_000), rp(2_240_000)), L("belanja", rp(3_000_000), rp(2_340_000)), L("transport", rp(1_000_000), rp(1_040_000))];
  const b = budgetCheck(lines, rp(15_000_000), rp(11_790_000));
  assert.deepEqual(b.over.map((l) => [l.categoryId, l.pct, l.overSen]), [["makan", 112, rp(240_000)], ["transport", 104, rp(40_000)]]);
  assert.deepEqual(b.under.map((l) => [l.categoryId, l.underSen]), [["belanja", rp(660_000)]]);
  assert.deepEqual([b.plannedSen, b.spentSen, b.usedPct], [rp(6_000_000), rp(5_620_000), 94]);
  assert.deepEqual([b.keptSen, b.keptPct], [rp(3_210_000), 21]);
  assert.equal(budgetCheck([], 0, rp(100)).keptPct, null, "no income: no %");
  assert.equal(budgetCheck([], 0, 0).usedPct, null);
});

test("kept % over several months is total kept over total income", () => {
  // (3.000.000 + 1.000.000) ÷ (15.000.000 + 5.000.000) = 20%, not the average of 20% and 20%… and with a loss month:
  assert.equal(averageKeptPct([{ inSen: rp(15_000_000), keptSen: rp(3_000_000) }, { inSen: rp(5_000_000), keptSen: rp(1_000_000) }]), 20);
  assert.equal(averageKeptPct([{ inSen: rp(10_000_000), keptSen: rp(3_000_000) }, { inSen: rp(10_000_000), keptSen: rp(-1_000_000) }]), 10);
  assert.equal(keptPctOf(0, rp(5)), null);
});

test("plan next month: copy, raise what ran over to spent rounded up to Rp 50.000, leave planned lines alone", () => {
  assert.equal(roundUp(rp(2_240_000)), rp(2_250_000));
  assert.equal(roundUp(rp(2_250_000)), rp(2_250_000), "already a multiple");
  assert.equal(roundUp(rp(1_000_001)), rp(1_050_000));
  const lines = [L("makan", rp(2_000_000), rp(2_240_000)), L("belanja", rp(3_000_000), rp(2_340_000)), L("listrik", rp(500_000), rp(600_000)),
    L("kopi", rp(300_000), rp(100_000), true), L("bensin", rp(400_000), rp(430_000), true)];
  const p = planNext(lines, new Set(["listrik"]));
  assert.deepEqual(p.map((x) => [x.categoryId, x.amountSen, x.raised]), [
    ["makan", rp(2_250_000), true], ["belanja", rp(3_000_000), false], ["bensin", rp(450_000), true],
  ], "listrik already planned; kopi is every month and wasn't over");
});

test("warnings: lines at 90% or over, most used first, with days left", () => {
  const lines = [L("a", rp(1_000_000), rp(890_000)), L("b", rp(1_000_000), rp(900_000)), L("c", rp(500_000), rp(600_000))];
  assert.deepEqual(budgetWarnings(lines, 28).map((w) => [w.categoryId, w.pct, w.over, w.daysLeft]), [["c", 120, true, 28], ["b", 90, false, 28]]);
});

test("debts paid down: transfers into cards and loans in the month", () => {
  const owed = new Set(["card", "loan"]);
  const t = [
    { on: "2026-10-05", kind: "transfer", amountSen: rp(1_000_000), toAccountId: "card" },
    { on: "2026-10-25", kind: "transfer", amountSen: rp(500_000), toAccountId: "loan" },
    { on: "2026-10-26", kind: "transfer", amountSen: rp(2_000_000), toAccountId: "bca" },
    { on: "2026-11-01", kind: "transfer", amountSen: rp(700_000), toAccountId: "card" },
    { on: "2026-10-09", kind: "spend", amountSen: rp(300_000), toAccountId: null },
  ];
  assert.equal(debtsPaid(t, owed, "2026-10"), rp(1_500_000));
});

test("steps done, and days since", () => {
  assert.deepEqual(steps(true, { budgetDone: true, wealthDone: false, closedAt: null }), { statements: true, budget: true, wealth: false, closed: false, done: 2, of: 4 });
  assert.equal(steps(false, null).done, 0);
  assert.equal(daysSince("2026-10-01", "2026-11-10"), 40);
  assert.equal(daysSince(null, "2026-11-10"), null);
});
