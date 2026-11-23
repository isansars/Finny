import { test } from "node:test";
import assert from "node:assert/strict";
import { readBooks, buildPlan, defaultChoices, guessType, readLog, logOnly, displayName } from "../../src/lib/import-rule.ts";
// @ts-expect-error a plain .mjs fixture
import { BOOKS, WEALTH, OWNER } from "../fixtures/books-fixture.mjs";

const b = readBooks(BOOKS)!;
const plan = buildPlan(b, { ...defaultChoices(b), align: { "Bank Satu": false } });
const acc = (k: string) => plan.accounts.find((a) => a.key === k)!;
const cat = (k: string) => plan.categories.find((c) => c.key === k);

test("finds the account sheets, the owner, and the template's example sheet", () => {
  assert.deepEqual(b.sheets.map((s) => s.sheet), ["Kas Tunai", "Bank Satu", "GoPay", "CLOSED Kartu Kredit", "PinjamDulu"]);
  assert.equal(b.owner, OWNER);
  assert.deepEqual(b.sheets.filter((s) => s.template).map((s) => s.sheet), ["Kas Tunai"]);
  assert.equal(defaultChoices(b).include["Kas Tunai"], false);
});
test("account types from names; CLOSED becomes an archived account", () => {
  assert.equal(guessType("BRI - Tokopedia Card"), "card"); assert.equal(guessType("KK Bank-0005"), "card"); assert.equal(guessType("ShopeePinjam"), "loan");
  assert.equal(guessType("GoPay"), "ewallet"); assert.equal(guessType("Kas Tunai"), "cash"); assert.equal(guessType("Krom"), "bank");
  assert.equal(displayName("CLOSED BRI - OVO U Card"), "BRI - OVO U Card");
  assert.equal(acc("CLOSED Kartu Kredit").archived, true); assert.equal(acc("CLOSED Kartu Kredit").name, "Kartu Kredit");
});
test("openings: Modal Awal for a bank, the limit for a card and a loan", () => {
  assert.equal(acc("Bank Satu").openingSen, 100000000); assert.equal(acc("Bank Satu").openingOn, "2024-06-01");
  assert.equal(acc("CLOSED Kartu Kredit").limitSen, 1000000000); assert.equal(acc("CLOSED Kartu Kredit").openingSen, 0);
  assert.equal(acc("PinjamDulu").limitSen, 300000000);
  assert.equal(acc("GoPay").openingSen, 0); // derived from the first row's Saldo
});
test("transfers: paired across sheets once, one-sided still a transfer, a loan payment pairs with its Utang row", () => {
  const t = plan.txns.filter((x) => x.kind === "transfer");
  assert.equal(plan.stats.paired, 3); assert.equal(plan.stats.oneSided, 1);
  assert.deepEqual(t.map((x) => [x.account, x.toAccount, x.sen]).sort(), [
    ["Bank Satu", "CLOSED Kartu Kredit", 20000000], ["Bank Satu", "GoPay", 10000000], ["Bank Satu", "Kas Tunai", 30000000], ["Bank Satu", "PinjamDulu", 50000000]].sort());
  assert.ok(plan.accounts.some((a) => a.key === "Kas Tunai" && a.fromSheet === null), "a referenced account is created even when its sheet is off");
});
test("categories from the chart of accounts, kept to 3 levels; refunds and lending have a home", () => {
  assert.ok(cat("expense|Kebutuhan Pribadi › Beli Kopi"));
  assert.ok(cat("expense|Kebutuhan Rumah Tangga › Kebutuhan Pokok › Makan di Luar"));
  assert.ok(cat("expense|Kebutuhan Rumah Tangga › Sarana Pelengkap Properti › Biaya Listrik"), "6 levels compressed to 3");
  assert.ok(cat("income|Pendapatan Tetap › Gaji › Gaji Bulanan"));
  assert.ok(cat("income|Pengembalian Dana"), "a refund on a spending category is income");
  assert.ok(cat("expense|Aset Lancar › Piutang › Piutang Lain-Lain") && cat("income|Aset Lancar › Piutang › Piutang Lain-Lain"), "lending out and paid back");
  assert.ok(cat("expense|Liabilitas Lancar › Utang › Utang Konsumtif"), "a loan drawdown spent on living costs");
});
test("entities: the other party, not the owner, not 'Lainnya', not an account", () => {
  const ents = new Set(plan.txns.map((t) => t.entity).filter(Boolean));
  assert.deepEqual([...ents].sort(), ["Budi", "Kantor", "PLN", "Toko", "Warung"]);
});
test("a row that can't be placed is listed, never guessed", () => {
  assert.equal(plan.unplaced.length, 1); assert.equal(plan.unplaced[0].akun, "Tabungan Bank-0001"); assert.equal(plan.unplaced[0].sen, 2500000);
});
test("the balance check: every account matches its workbook Saldo, except by exactly what wasn't placed", () => {
  const c = (k: string) => plan.checks.find((x) => x.account === k)!;
  assert.equal(c("GoPay").ok, true); assert.equal(c("GoPay").finnySen, 6100000);
  assert.equal(c("CLOSED Kartu Kredit").ok, true); assert.equal(c("CLOSED Kartu Kredit").workbookSen, -15000000);
  assert.equal(c("PinjamDulu").ok, true); assert.equal(c("PinjamDulu").finnySen, -50000000);
  assert.equal(c("Bank Satu").ok, false); assert.equal(c("Bank Satu").finnySen - c("Bank Satu").workbookSen, 2500000);
  assert.equal(c("Bank Satu").explained, false, "the unplaced row isn't a one-sided transfer");
});
test("the template's rows never come in", () => {
  assert.ok(!plan.txns.some((t) => t.ref.startsWith("Kas Tunai#")));
  assert.equal(plan.txns.length, 4 + 5 + 3 + 2 + 1); // transfers + Bank Satu (kopi, gaji, lend, repaid, refund) + GoPay (lunch, 2 × parking) + card (2) + loan drawdown
});
test("the wealth log: only rows that aren't already in the books", () => {
  const log = readLog(WEALTH)!; assert.equal(log.length, 3);
  assert.deepEqual(logOnly(log, b).map((r) => r.description), ["Parkir", "Hadiah"]);
  assert.deepEqual(logOnly(log, b, [{ on: "2024-06-15", sen: 1200000 }]).map((r) => r.description), ["Hadiah"]);
  assert.equal(readBooks(WEALTH), null);
});
test("a gap made only of transfers recorded in the other sheet is explained, with the rows", () => {
  const books = structuredClone(BOOKS).map((s: { sheet: string; data: unknown[][] }) => s.sheet === "GoPay" ? { ...s, data: s.data.filter((r) => !(Array.isArray(r) && r[1] === "Top up dari Bank Satu")) } : s);
  // GoPay's sheet no longer records the top-up (and its Saldo is re-run), so only Bank Satu's sheet has it.
  const g = books.find((s: { sheet: string }) => s.sheet === "GoPay"); let run = 0; for (const r of g.data.slice(2)) { run += r[5] === "Kredit" ? r[6] : -r[6]; r[7] = run; }
  const bb = readBooks(books)!; const p = buildPlan(bb, { ...defaultChoices(bb), align: { GoPay: false } }); const c = p.checks.find((x) => x.account === "GoPay")!;
  assert.equal(c.ok, false); assert.equal(c.explained, true); assert.equal(c.explainedSen, 10000000); assert.equal(c.oneSided, 1);
  assert.equal(p.txns.find((t) => t.ref === c.refs[0])!.description, "Top up GoPay");
});
test("matching the workbook's balance moves the opening balance, not the history", () => {
  const p = buildPlan(b, defaultChoices(b)); const c = p.checks.find((x) => x.account === "Bank Satu")!;
  assert.equal(c.ok, true); assert.equal(c.adjustedSen, -2500000); assert.equal(c.finnySen, c.workbookSen);
  assert.equal(p.accounts.find((a) => a.key === "Bank Satu")!.openingSen, 100000000 - 2500000);
  assert.equal(p.txns.length, plan.txns.length, "no transaction is added");
});
