import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKS, WEALTH } from "../fixtures/books-fixture.mjs";
import { buildPlan, defaultChoices, readBooks, readLog, type Sheet } from "../../src/lib/import-rule.ts";
import { compareAccounts, compareCategories, finnyRows, forAccount, forCategory, logSide, matchCounts, rowsBehind, workbookSide, type FinnySide } from "../../src/lib/match-rule.ts";

const books = readBooks(BOOKS as Sheet[])!;
const plan = buildPlan(books, defaultChoices(books));
const M = "2024-06";

/** Finny as a perfect import of the made-up workbook would leave it (ids are the plan's keys and refs). */
function importedFinny(): FinnySide {
  const cats = plan.categories.map((c) => ({ id: c.key, name: c.path[c.path.length - 1], kind: c.kind }));
  const txns = plan.txns.map((t) => ({ id: t.ref, on: t.on, kind: t.kind, amountSen: t.sen, accountId: t.account, toAccountId: t.toAccount ?? null, categoryId: t.category ?? null, description: t.description }));
  const bal = new Map(plan.accounts.map((a) => [a.key, a.openingSen]));
  for (const t of plan.txns) {
    if (t.kind === "income") bal.set(t.account, bal.get(t.account)! + t.sen);
    else if (t.kind === "spend") bal.set(t.account, bal.get(t.account)! - t.sen);
    else { bal.set(t.account, bal.get(t.account)! - t.sen); bal.set(t.toAccount!, bal.get(t.toAccount!)! + t.sen); }
  }
  return { accounts: plan.accounts.map((a) => ({ id: a.key, name: a.name, type: a.type, balanceSen: bal.get(a.key)! })), categories: cats, txns };
}
function compareInput(f: FinnySide) {
  const rows = finnyRows(f).filter((r) => r.on.slice(0, 7) === M);
  const m = new Map<string, { name: string; kind: "income" | "expense"; sen: number }>();
  for (const r of rows) if (r.category && r.categoryKind) { const k = r.categoryKind + r.category; const c = m.get(k) ?? { name: r.category, kind: r.categoryKind, sen: 0 }; c.sen += r.sen; m.set(k, c); }
  return { rows, cats: [...m.values()] };
}

test("the workbook side: Saldo at the month end, category totals, the month's rows", () => {
  const w = workbookSide(books, M, plan);
  const bal = Object.fromEntries(w.accounts.map((a) => [a.name, a.balanceSen]));
  // By hand from the fixture's Saldo: Bank Satu 1.000.000 − 43.890 + 5.000.000 − 100.000 − 200.000 − 50.000 + 50.000 − 300.000
  // − 500.000 + 10.000 − 25.000 = 4.841.110; GoPay 100.000 − 35.000 − 2.000 − 2.000 = 61.000; the card: Saldo
  // 10.000.000 − 200.000 + 200.000 − 150.000 = 9.850.000, less its 10.000.000 limit = −150.000.
  assert.equal(bal["Bank Satu"], 484_111_000);
  assert.equal(bal["GoPay"], 6_100_000);
  assert.equal(bal["Kartu Kredit"], -15_000_000);
  const cat = Object.fromEntries(w.categories.map((c) => [`${c.kind} ${c.name}`, c.sen]));
  assert.equal(cat["expense Makan di Luar"], 23_500_000, "35.000 (GoPay) + 200.000 (card)");
  assert.equal(cat["expense Biaya Parkir"], 400_000, "two identical 2.000 rows");
  assert.equal(cat["income Gaji Bulanan"], 500_000_000);
  assert.equal(workbookSide(books, "2024-07", plan).rows.length, 0, "nothing in July");
});

test("a perfect import matches everywhere", () => {
  const f = importedFinny(), w = workbookSide(books, M, plan), { cats } = compareInput(f);
  const a = compareAccounts(w.accounts, f.accounts), c = compareCategories(w.categories, cats);
  assert.ok(a.length >= 4 && a.every((x) => x.ok), JSON.stringify(a.filter((x) => !x.ok)));
  assert.ok(c.every((x) => x.ok), JSON.stringify(c.filter((x) => !x.ok)));
  assert.deepEqual(matchCounts(a, c), { accountsOk: a.length, accountsTotal: a.length, categoriesOk: c.length, categoriesTotal: c.length });
});

test("a row missing in Finny: the account and the category differ, and the row is found", () => {
  const f = importedFinny();
  const gone = f.txns.find((t) => t.description === "Makan siang")!;
  f.txns = f.txns.filter((t) => t !== gone);
  f.accounts.find((a) => a.name === "GoPay")!.balanceSen += gone.amountSen; // Finny's balance without that spend
  const w = workbookSide(books, M, plan), { rows, cats } = compareInput(f);
  const go = compareAccounts(w.accounts, f.accounts).find((x) => x.name === "GoPay")!;
  assert.deepEqual([go.ok, go.diffSen], [false, 3_500_000], "Finny 35.000 higher");
  const mk = compareCategories(w.categories, cats).find((x) => x.name === "Makan di Luar")!;
  assert.deepEqual([mk.ok, mk.workbookSen, mk.finnySen, mk.diffSen], [false, 23_500_000, 20_000_000, -3_500_000]);
  assert.equal(compareCategories(w.categories, cats)[0].name, "Makan di Luar", "differences first");
  const byAcc = rowsBehind(w.rows, rows, forAccount("GoPay"));
  assert.deepEqual(byAcc.onlyWorkbook.map((r) => [r.description, r.signedSen]), [["Makan siang", -3_500_000]]);
  assert.equal(byAcc.onlyFinny.length, 0);
  const byCat = rowsBehind(w.rows, rows, forCategory("Makan di Luar", "expense"));
  assert.deepEqual(byCat.onlyWorkbook.map((r) => r.description), ["Makan siang"]);
});

test("a row only in Finny, and a transfer dated a day apart still matches", () => {
  const f = importedFinny();
  f.txns.push({ id: "extra", on: "2024-06-20", kind: "spend", amountSen: 5_000_000, accountId: "Bank Satu", toAccountId: null, categoryId: plan.categories.find((c) => c.path.at(-1) === "Beli Kopi")!.key, description: "Kopi lagi" });
  const topUp = f.txns.find((t) => t.kind === "transfer" && t.description.startsWith("Top up"))!;
  topUp.on = "2024-06-05"; // the workbook has it on the 4th
  const w = workbookSide(books, M, plan), { rows } = compareInput(f);
  const r = rowsBehind(w.rows, rows, forAccount("Bank Satu"));
  assert.deepEqual(r.onlyFinny.map((x) => [x.description, x.signedSen]), [["Kopi lagi", -5_000_000]]);
  assert.equal(r.onlyWorkbook.length, 0, "the top-up matched within 3 days");
});

test("an account renamed in Finny pairs by hand", () => {
  const f = importedFinny();
  const go = f.accounts.find((a) => a.name === "GoPay")!; go.name = "GoPay Rina";
  const w = workbookSide(books, M, plan);
  assert.equal(compareAccounts(w.accounts, f.accounts).find((x) => x.name === "GoPay")!.finnySen, null, "not in Finny by name");
  const paired = compareAccounts(w.accounts, f.accounts, { GoPay: go.id }).find((x) => x.name === "GoPay")!;
  assert.deepEqual([paired.ok, paired.finnyId], [true, go.id]);
});

test("the Transaction Log by category", () => {
  const log = readLog(WEALTH as Sheet[])!;
  const s = logSide(log, M);
  const c = Object.fromEntries(s.categories.map((x) => [`${x.kind} ${x.name}`, x.sen]));
  assert.deepEqual(c, { "expense Coffee": 4_389_000, "expense Transportation": 1_200_000, "income Gifts": 25_000_000 });
});
