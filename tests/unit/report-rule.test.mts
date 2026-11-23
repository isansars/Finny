import { test } from "node:test";
import assert from "node:assert/strict";
import { cashflow, categoryTree, balanceSheet, spendingPace, accountMonths, monthsBetween, type RTxn } from "../../src/lib/report-rule.ts";

const cats = [
  { id: "gaji", kind: "income", parentId: null, name: "Gaji" },
  { id: "rt", kind: "expense", parentId: null, name: "Rumah Tangga" }, { id: "makan", kind: "expense", parentId: "rt", name: "Makan di Luar" }, { id: "listrik", kind: "expense", parentId: "rt", name: "Biaya Listrik" },
  { id: "kopi", kind: "expense", parentId: null, name: "Beli Kopi" }, { id: "tab", kind: "saving", parentId: null, name: "Tabungan" },
];
const accs = [
  { id: "bca", name: "BCA", type: "bank", openingSen: 1_000_000, openingOn: "2026-01-01" },
  { id: "card", name: "Card", type: "card", openingSen: -200_000, openingOn: "2026-01-01" },
  { id: "late", name: "GoPay", type: "ewallet", openingSen: 50_000, openingOn: "2026-10-15" },
];
const T = (on: string, kind: RTxn["kind"], amountSen: number, accountId: string, cat: string | null, toAccountId: string | null = null): RTxn => ({ on, kind, amountSen, accountId, toAccountId, categoryId: cat });
const txns: RTxn[] = [
  T("2026-08-25", "income", 1_500_000, "bca", "gaji"), T("2026-08-10", "spend", 300_000, "bca", "makan"),
  T("2026-09-25", "income", 1_500_000, "bca", "gaji"), T("2026-09-10", "spend", 600_000, "bca", "makan"),
  T("2026-10-25", "income", 1_500_000, "bca", "gaji"), T("2026-10-10", "spend", 900_000, "bca", "makan"), T("2026-10-11", "spend", 100_000, "card", "kopi"),
  T("2026-11-02", "spend", 400_000, "bca", "makan"), T("2026-11-03", "spend", 50_000, "bca", "listrik"), T("2026-11-04", "spend", 200_000, "bca", "tab"),
  T("2026-11-05", "transfer", 300_000, "bca", null, "card"), T("2026-11-06", "spend", 30_000, "card", "kopi"), T("2026-11-20", "income", 1_500_000, "bca", "gaji"),
];

test("cashflow: in, out and kept per month; transfers are neither", () => {
  const c = cashflow(txns, monthsBetween("2026-10", "2026-11"));
  assert.deepEqual(c.months, [{ month: "2026-10", inSen: 1_500_000, outSen: 1_000_000, keptSen: 500_000 }, { month: "2026-11", inSen: 1_500_000, outSen: 680_000, keptSen: 820_000 }]);
  assert.deepEqual(c.totals, { inSen: 3_000_000, outSen: 1_680_000, keptSen: 1_320_000 });
  assert.deepEqual(monthsBetween("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

test("the month's category tree rolls up to groups, with the 3-month average", () => {
  const t = categoryTree(txns, cats, "2026-11");
  const exp = t.sections.find((s) => s.kind === "expense")!;
  assert.equal(exp.sen, 480_000);
  const rt = exp.nodes.find((n) => n.id === "rt")!, makan = exp.nodes.find((n) => n.id === "makan")!;
  assert.deepEqual([rt.sen, rt.avg3Sen, rt.depth, rt.hasChildren], [450_000, 600_000, 0, true]);
  assert.deepEqual([makan.sen, makan.avg3Sen, makan.depth], [400_000, 600_000, 1]);
  assert.equal(exp.nodes[0].id, "rt", "biggest first");
  assert.deepEqual(t.sections.map((s) => s.kind), ["income", "expense", "saving"]);
  assert.equal(t.sections.find((s) => s.kind === "income")!.avg3Sen, 1_500_000);
});

test("balance sheet: month-end balances, what's owed, net worth, change, an account opened mid-year", () => {
  const b = balanceSheet(accs, txns, "2026-11", 3);
  assert.deepEqual(b.series.map((s) => s.month), ["2026-09", "2026-10", "2026-11"]);
  // BCA end of Nov: 1,000,000 + 4×1,500,000 − (300+600+900+400+50+200 thousand) − 300,000 transfer
  const bca = b.have.find((a) => a.id === "bca")!; assert.equal(bca.sen, 1_000_000 + 6_000_000 - 2_450_000 - 300_000);
  const card = b.owe.find((a) => a.id === "card")!; assert.equal(card.sen, 200_000 + 100_000 + 30_000 - 300_000, "owed after a payment");
  assert.equal(b.have.find((a) => a.id === "late")!.sen, 50_000);
  assert.equal(b.netSen, b.haveSen - b.oweSen);
  assert.equal(b.series[0].haveSen, 1_000_000 + 3_000_000 - 900_000, "September: two salaries, two meals, no GoPay yet");
  const oct = b.series[1]; assert.equal(b.changeSen, b.netSen - oct.netSen);
  assert.equal(b.yearChangeSen, null, "less than a year of history asked");
});

test("spending pace: running totals, the projection, a past month", () => {
  const p = spendingPace(txns, cats, "2026-11", "2026-11-10");
  assert.equal(p.daysGone, 10); assert.equal(p.thisMonth.length, 10);
  assert.equal(p.spentSen, 480_000, "saving isn't spending");
  assert.equal(p.projectedSen, 1_440_000);
  assert.equal(p.lastMonthSen, 1_000_000); assert.equal(p.lastMonth.length, 31);
  assert.equal(p.avg3[29], Math.round((1_000_000 + 600_000 + 300_000) / 3));
  assert.equal(p.biggest[0].amountSen, 400_000);
  const past = spendingPace(txns, cats, "2026-10", "2026-11-10"); assert.equal(past.projectedSen, past.spentSen); assert.equal(past.daysGone, 31);
});

test("one account month by month: transfers in and out count", () => {
  const m = accountMonths(accs[1], txns, ["2026-10", "2026-11"]);
  assert.deepEqual(m[1], { month: "2026-11", inSen: 300_000, outSen: 30_000, netSen: 270_000, endSen: -30_000 });
  assert.equal(m[0].endSen, -300_000);
});
