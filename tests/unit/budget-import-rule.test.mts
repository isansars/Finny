import { test } from "node:test";
import assert from "node:assert/strict";
import { readWorkbookBudget, learnedMatches, suggestFor, monthsOf } from "../../src/lib/budget-import-rule.ts";
import { readLog } from "../../src/lib/import-rule.ts";
// @ts-expect-error a plain .mjs fixture
import { WEALTH, BOOKS } from "../fixtures/books-fixture.mjs";

test("reads the Budgeting sheet: the year, income, spending and saving lines; empty lines and totals left out", () => {
  const b = readWorkbookBudget(WEALTH)!;
  assert.equal(b.year, 2025);
  assert.deepEqual(b.income.map((l) => l.name), ["Salary"]);
  assert.equal(b.income[0].months[0], 1_500_000_000);
  assert.deepEqual(b.lines.map((l) => [l.name, l.section]), [["Housing", "expense"], ["Food", "expense"], ["Transportation", "expense"], ["Coffee", "expense"], ["Bills", "expense"], ["General Savings", "saving"]]);
  assert.equal(b.lines.find((l) => l.name === "Coffee")!.months[11], 75_000_000, "December differs");
  assert.equal(readWorkbookBudget(BOOKS), null, "the books have no budget");
});

test("matches lines to the owner's categories: by history first, then by meaning", () => {
  const cats = [
    { id: "pribadi", kind: "expense", name: "Kebutuhan Pribadi", parentId: null }, { id: "kopi", kind: "expense", name: "Beli Kopi", parentId: "pribadi" },
    { id: "transport", kind: "expense", name: "Transportasi", parentId: null }, { id: "parkir", kind: "expense", name: "Biaya Parkir", parentId: "transport" },
    { id: "rt", kind: "expense", name: "Kebutuhan Rumah Tangga", parentId: null }, { id: "makan", kind: "expense", name: "Makan di Luar", parentId: "rt" },
    { id: "listrik", kind: "expense", name: "Biaya Listrik", parentId: "rt" }, { id: "gaji", kind: "income", name: "Gaji", parentId: null },
  ];
  const log = readLog(WEALTH)!;
  // Finny has the 2 June coffee (as Beli Kopi) but not the 15 June parking.
  const learned = learnedMatches(log, [{ on: "2024-06-02", sen: 4_389_000, categoryId: "kopi" }, { on: "2024-06-03", sen: 500_000_000, categoryId: "gaji" }]);
  assert.equal(learned.get("coffee"), "kopi");
  const b = readWorkbookBudget(WEALTH)!;
  const s = Object.fromEntries(b.lines.map((l) => [l.name, suggestFor(l, cats, learned)]));
  assert.deepEqual(s, { Housing: "rt", Food: "makan", Transportation: "transport", Coffee: "kopi", Bills: "listrik", "General Savings": null });
});

test("months: a year, and a copy into the next", () => {
  assert.deepEqual(Object.keys(monthsOf(2025, [1, 0, ...Array(10).fill(2)])).length, 11);
  const both = monthsOf(2025, Array(12).fill(5), 2026);
  assert.equal(both["2025-01"], 5); assert.equal(both["2026-12"], 5); assert.equal(Object.keys(both).length, 24);
});
