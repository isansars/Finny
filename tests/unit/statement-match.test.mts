// FINNY-71: New / Already in / Transfer / Check, the cashback fold and the balance check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchStatement, foldCashback, balanceCheck, effectOn, type Existing, type Acc, type Cat } from "../../src/lib/statement-match.ts";
import type { Statement, StatementLine } from "../../src/lib/statement-rule.ts";

const accounts: Acc[] = [
  { id: "bca", name: "BCA", type: "bank" }, { id: "krom", name: "Krom", type: "bank" },
  { id: "mandiri", name: "Mandiri", type: "bank" }, { id: "card", name: "BRI Card", type: "card" },
];
const categories: Cat[] = [
  { id: "kopi", kind: "expense", name: "Beli Kopi" }, { id: "makan", kind: "expense", name: "Makan di Luar" },
  { id: "lain", kind: "expense", name: "Lainnya" }, { id: "cb", kind: "income", name: "Cashback" }, { id: "gaji", kind: "income", name: "Gaji" },
];
const history = [
  { description: "Kedai Kopi Senja", categoryId: "kopi", on: "2026-09-02" },
  { description: "Cashback", categoryId: "cb", on: "2026-09-03" },
  { description: "Gaji Oktober", categoryId: "gaji", on: "2026-09-25" },
];
const st = (lines: StatementLine[], closing?: number): Statement => ({ bank: "bca", accountDigits: "4567", periodFrom: "2026-10-01", periodTo: "2026-10-31", closingSen: closing, lines, warnings: [] });
const L = (on: string, description: string, amountSen: number, more: Partial<StatementLine> = {}): StatementLine => ({ on, description, amountSen, ...more });
const E = (id: string, on: string, kind: Existing["kind"], amountSen: number, accountId: string, toAccountId: string | null = null, description = ""): Existing => ({ id, on, kind, amountSen, accountId, toAccountId, description });
const run = (lines: StatementLine[], existing: Existing[], accountId = "bca", ownerName: string | null = "Finny Tester") =>
  matchStatement({ statement: st(lines), lines, accountId, accounts, categories, existing, history, ownerName });

test("an entry's effect on an account: money in is positive", () => {
  assert.equal(effectOn(E("a", "2026-10-01", "spend", 100, "bca"), "bca"), -100);
  assert.equal(effectOn(E("a", "2026-10-01", "transfer", 100, "bca", "krom"), "krom"), 100);
  assert.equal(effectOn(E("a", "2026-10-01", "transfer", 100, "bca", "krom"), "mandiri"), 0);
});

test("Already in: same account and amount within ±2 days, one for one, nearest first", () => {
  const r = run([L("2026-10-03", "Tokopedia", -250_000_00), L("2026-10-05", "Tokopedia", -250_000_00), L("2026-10-09", "Tokopedia", -250_000_00)],
    [E("x1", "2026-10-04", "spend", 250_000_00, "bca"), E("x2", "2026-10-05", "spend", 250_000_00, "bca")]);
  assert.deepEqual(r.map((x) => [x.status, x.matchId]), [["in", "x1"], ["in", "x2"], ["new", null]]);
  assert.match(r[0].hint, /1 day apart/);
});

test("Already in also counts a transfer typed on the other account", () => {
  const r = run([L("2026-10-10", "BI-FAST CR from Krom", 100_000_00)], [E("t", "2026-10-10", "transfer", 100_000_00, "krom", "bca")]);
  assert.equal(r[0].status, "in"); assert.equal(r[0].kind, "transfer"); assert.equal(r[0].otherAccountId, "krom");
});

test("Check: the same amount 3 to 7 days away", () => {
  const r = run([L("2026-10-12", "SPBU 34.123", -150_000_00)], [E("s", "2026-10-07", "spend", 150_000_00, "bca")]);
  assert.equal(r[0].status, "check"); assert.equal(r[0].matchId, "s"); assert.match(r[0].hint, /7 Oct/);
});

test("Transfer: another own account named, or the owner's own name", () => {
  const r = run([L("2026-10-10", "Finny Tester", -100_000_00, { ref: "Bca | 0000000002", type: "Transfer Keluar" }), L("2026-10-02", "Transfer ke KROM", -300_000_00)], [], "krom");
  assert.equal(r[0].status, "xfer"); assert.equal(r[0].otherAccountId, "bca"); assert.equal(r[0].hint, "To BCA");
  const r2 = run([L("2026-10-02", "Transfer ke KROM", -300_000_00)], [], "mandiri");
  assert.equal(r2[0].status, "xfer"); assert.equal(r2[0].otherAccountId, "krom");
  const r3 = run([L("2026-10-01", "Finny Tester /Mobile Bank", 750_000_00, { type: "SWITCHING CR" })], []);
  assert.equal(r3[0].status, "xfer"); assert.equal(r3[0].otherAccountId, null); assert.match(r3[0].hint, /pick the other/);
});

test("Transfer: paying the card, from either side", () => {
  const bank = run([L("2026-10-05", "Kartu Kredit BRI", -800_000_00)], []);
  assert.equal(bank[0].status, "xfer"); assert.equal(bank[0].otherAccountId, "card");
  const card = run([L("2026-10-06", "Payment_kkcb_tkp0001", 800_000_00)], [], "card");
  assert.equal(card[0].status, "xfer"); assert.equal(card[0].otherAccountId, "bca", "a bank is suggested");
  const both = run([L("2026-10-06", "Payment_kkcb_tkp0001", 800_000_00)], [E("t", "2026-10-05", "transfer", 800_000_00, "bca", "card")], "card");
  assert.equal(both[0].status, "in", "the bank's side already saved as a transfer");
});

test("Check: the other side of a transfer already typed as spending", () => {
  const r = run([L("2026-10-02", "Transfer ke KROM", -300_000_00)], [E("i", "2026-10-02", "income", 300_000_00, "krom")], "mandiri");
  assert.equal(r[0].status, "check"); assert.match(r[0].hint, /Krom already has this as income/);
});

test("New: a category from history of the right kind, else Lainnya, else none", () => {
  const r = run([L("2026-10-12", "Kedai Kopi Senja", -32_000_00), L("2026-10-15", "Gaji Oktober", 8_000_000_00), L("2026-10-20", "Something unknown", -1_000_00), L("2026-10-21", "Unknown money in", 1_000_00)], []);
  assert.deepEqual(r.map((x) => [x.status, x.kind, x.categoryId]), [["new", "spend", "kopi"], ["new", "income", "gaji"], ["new", "spend", "lain"], ["new", "income", null]]);
});

test("Krom cashback folds into one income line a day", () => {
  const f = foldCashback([L("2026-10-04", "Kedai", -28_000_00), L("2026-10-04", "Cashback Bonus", 280_00, { cashback: true }), L("2026-10-04", "Bakmi", -45_000_00),
    L("2026-10-04", "Cashback Bonus", 450_00, { cashback: true }), L("2026-10-05", "Cashback Bonus", 100_00, { cashback: true })]);
  assert.deepEqual(f.map((l) => [l.description, l.amountSen]), [["Kedai", -28_000_00], ["Cashback × 2", 730_00], ["Bakmi", -45_000_00], ["Cashback", 100_00]]);
  const r = run(f, [], "krom");
  assert.equal(r[1].categoryId, "cb");
});

test("balance check: savings and a card's bill, after saving New and Transfer lines only", () => {
  const lines = [L("2026-10-03", "A", -250_000_00), L("2026-10-05", "B", -100_000_00)];
  const rows = run(lines, [E("x", "2026-10-03", "spend", 250_000_00, "bca")]);
  // Finny had 1,000,000 at the end (the -250,000 already in it); saving B gives 900,000.
  assert.deepEqual(balanceCheck(st(lines, 900_000_00), "bank", 1_000_000_00, rows), { statementSen: 900_000_00, finnySen: 900_000_00, gapSen: 0 });
  assert.equal(balanceCheck(st(lines, 950_000_00), "bank", 1_000_000_00, rows)!.gapSen, 50_000_00);
  const card = run([L("2026-10-08", "Toko", -275_000_00)], [], "card");
  assert.deepEqual(balanceCheck(st(card.map((c) => c.line), 1_075_000_00), "card", -800_000_00, card), { statementSen: 1_075_000_00, finnySen: 1_075_000_00, gapSen: 0 });
  assert.equal(balanceCheck(st([]), "bank", 0, []), null);
});

// FINNY-210: matching against other accounts, card payments with a fee, people who owe the owner, look-alikes.
const withRina: Acc[] = [...accounts, { id: "rina", name: "Rina (owes me)", type: "owed" }];
const runWith = (accs: Acc[], lines: StatementLine[], existing: Existing[], accountId = "bca") =>
  matchStatement({ statement: st(lines), lines, accountId, accounts: accs, categories, existing, history, ownerName: "Finny Tester" });

test("a transfer the other bank booked up to 3 days off is Already in, naming the account and the days", () => {
  const r = run([L("2026-10-08", "TRF KE KROM", -1_000_000_00)], [E("t", "2026-10-11", "transfer", 1_000_000_00, "bca", "krom")]);
  assert.equal(r[0].status, "in"); assert.equal(r[0].matchId, "t"); assert.equal(r[0].otherAccountId, "krom");
  assert.match(r[0].hint, /to Krom, 11 Oct \(3 days later\)/);
  const four = run([L("2026-10-07", "TRF KE KROM", -1_000_000_00)], [E("t", "2026-10-11", "transfer", 1_000_000_00, "bca", "krom")]);
  assert.notEqual(four[0].status, "in", "4 days off is not matched");
  const spend = run([L("2026-10-08", "Tokopedia", -50_000_00)], [E("s", "2026-10-11", "spend", 50_000_00, "bca")]);
  assert.notEqual(spend[0].status, "in", "spending keeps ±2 days");
});

test("a card bill's payment matches the bank's transfer into the card up to Rp 10.000 apart, naming the gap", () => {
  const r = run([L("2026-10-03", "PEMBAYARAN - TERIMA KASIH", 2_150_000_00)], [E("p", "2026-10-02", "transfer", 2_152_500_00, "mandiri", "card")], "card");
  assert.equal(r[0].status, "in"); assert.equal(r[0].otherAccountId, "mandiri");
  assert.match(r[0].hint, /from Mandiri, 2 Oct \(1 day earlier\) · Rp 2\.500 apart/);
  const far = run([L("2026-10-03", "PEMBAYARAN - TERIMA KASIH", 2_150_000_00)], [E("p", "2026-10-02", "transfer", 2_161_000_00, "mandiri", "card")], "card");
  assert.notEqual(far[0].status, "in", "Rp 11.000 apart is too far");
  const bank = run([L("2026-10-02", "PEMBAYARAN KARTU KREDIT", -2_152_500_00)], [E("p", "2026-10-03", "transfer", 2_150_000_00, "bca", "card")]);
  assert.equal(bank[0].status, "in", "the bank's side matches the card's figure too");
  const notCard = run([L("2026-10-02", "TRF KE KROM", -1_002_500_00)], [E("t", "2026-10-02", "transfer", 1_000_000_00, "bca", "krom")]);
  assert.notEqual(notCard[0].status, "in", "between two banks the amount must be exact");
});

test("a person with an Owed to me account is a transfer to or from them, ahead of a bank named in the line", () => {
  const r = runWith(withRina, [L("2026-10-10", "BI-FAST DB KROM RINA", -500_000_00), L("2026-10-12", "TRF DARI RINA", 200_000_00)], []);
  assert.deepEqual(r.map((x) => [x.status, x.kind, x.otherAccountId]), [["xfer", "transfer", "rina"], ["xfer", "transfer", "rina"]]);
  assert.match(r[0].hint, /To Rina \(owes me\) · owes you Rp 500\.000 more/);
  assert.match(r[1].hint, /From Rina \(owes me\) · owes you Rp 200\.000 less/);
  const plain = runWith(withRina, [L("2026-10-10", "BI-FAST DB KROM", -500_000_00)], []);
  assert.equal(plain[0].otherAccountId, "krom", "without the person's name it is still the owner's own move");
});

test("two alike on one day both stay; with one already in Finny, one is Already in and one New, each saying so", () => {
  const two = run([L("2026-10-10", "INDOMARET 0412", -25_000_00), L("2026-10-10", "INDOMARET 0412", -25_000_00)], []);
  assert.deepEqual(two.map((x) => x.status), ["new", "new"]);
  for (const x of two) assert.match(x.hint, /one of 2 alike on this day/);
  const one = run([L("2026-10-10", "INDOMARET 0412", -25_000_00), L("2026-10-10", "INDOMARET 0412", -25_000_00)], [E("i", "2026-10-10", "spend", 25_000_00, "bca")]);
  assert.deepEqual(one.map((x) => x.status).sort(), ["in", "new"]);
});
