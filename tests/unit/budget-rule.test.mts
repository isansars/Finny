import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetsFor, budgetLines, budgetTotals, incomePlanFor, daysLeft, monthsFor, quickFill, stateOf } from "../../src/lib/budget-rule.ts";

const cats = [
  { id: "pribadi", kind: "expense", parentId: null, name: "Kebutuhan Pribadi" },
  { id: "kopi", kind: "expense", parentId: "pribadi", name: "Beli Kopi" },
  { id: "rokok", kind: "expense", parentId: "pribadi", name: "Beli Rokok" },
  { id: "makan", kind: "expense", parentId: null, name: "Makan di Luar" },
  { id: "bensin", kind: "expense", parentId: null, name: "Bensin" },
];

test("a month's own budget wins over every month's; 0 removes it for that month", () => {
  const p = budgetsFor("2026-11", [{ categoryId: "kopi", month: "*", amountSen: 500 }, { categoryId: "kopi", month: "2026-11", amountSen: 700 }, { categoryId: "makan", month: "*", amountSen: 900 }, { categoryId: "makan", month: "2026-11", amountSen: 0 }]);
  assert.deepEqual([...p], [["kopi", { amountSen: 700, every: false }]]);
  assert.equal(budgetsFor("2026-12", [{ categoryId: "kopi", month: "*", amountSen: 500 }]).get("kopi")?.every, true);
});

test("a group covers its sub-categories without a budget of their own; nothing counted twice", () => {
  const rows = [{ categoryId: "pribadi", month: "2026-11", amountSen: 1_000 }, { categoryId: "kopi", month: "2026-11", amountSen: 300 }];
  const lines = budgetLines("2026-11", cats, rows, [{ categoryId: "kopi", amountSen: 336 }, { categoryId: "rokok", amountSen: 200 }, { categoryId: "pribadi", amountSen: 50 }, { categoryId: "bensin", amountSen: 999 }]);
  const kopi = lines.find((l) => l.categoryId === "kopi")!, pribadi = lines.find((l) => l.categoryId === "pribadi")!;
  assert.deepEqual([kopi.spentSen, kopi.leftSen, kopi.pct, kopi.state], [336, -36, 112, "over"]);
  assert.deepEqual([pribadi.spentSen, pribadi.leftSen, pribadi.state, pribadi.covers], [250, 750, "ok", ["rokok"]]);
  assert.equal(lines[0].categoryId, "kopi", "the most used first");
  assert.equal(lines.length, 2, "an unbudgeted category isn't a line");
});

test("green, amber from 90%, red over", () => {
  assert.equal(stateOf(899, 1000), "ok"); assert.equal(stateOf(900, 1000), "close"); assert.equal(stateOf(1000, 1000), "close"); assert.equal(stateOf(1001, 1000), "over");
});

test("totals and left to plan", () => {
  const lines = budgetLines("2026-11", cats, [{ categoryId: "makan", month: "*", amountSen: 1_500 }, { categoryId: "bensin", month: "2026-11", amountSen: 600 }], [{ categoryId: "makan", amountSen: 1_440 }, { categoryId: "bensin", amountSen: 700 }]);
  const t = budgetTotals(lines, incomePlanFor("2026-11", [{ month: "*", amountSen: 15_000 }]));
  assert.deepEqual(t, { plannedSen: 2_100, spentSen: 2_140, incomePlanSen: 15_000, leftToPlanSen: 12_900, over: 1, close: 1, pct: 102 });
  assert.equal(incomePlanFor("2026-11", [{ month: "*", amountSen: 1 }, { month: "2026-11", amountSen: 2 }]), 2);
  assert.equal(incomePlanFor("2026-11", []), 0);
});

test("days left, the months a change applies to, quick fill", () => {
  assert.equal(daysLeft("2026-11", "2026-11-23"), 8); assert.equal(daysLeft("2026-10", "2026-11-23"), 0); assert.equal(daysLeft("2026-12", "2026-11-23"), 31);
  assert.deepEqual(monthsFor("2026-11", "one"), ["2026-11"]); assert.deepEqual(monthsFor("2026-11", "rest"), ["2026-11", "2026-12"]); assert.deepEqual(monthsFor("2026-11", "every"), ["*"]);
  assert.equal(monthsFor("2026-01", "rest").length, 12);
  const q = quickFill(new Map([["2026-10", 48_000_000], ["2026-09", 52_050_000], ["2026-08", 50_000_000]]), "2026-11");
  assert.deepEqual(q, { lastMonthSen: 48_000_000, avg3Sen: 50_100_000 });
});
