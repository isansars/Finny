// FINNY-70: the four readers, on made-up PDFs drawn in each bank's layout (tests/fixtures/statements/make-pdfs.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readStatement, senDotDecimal, senCommaDecimal, monthNumber, tidy, type Statement } from "../../src/lib/statement-rule.ts";
import { pdfPages } from "./statement-pdf.mts";
// @ts-expect-error a plain .mjs fixture
import { totals, PASSWORD, BCA, MANDIRI, KROM, BRI, BCA_CARD } from "../fixtures/statements/make-pdfs.mjs";

const dir = "tests/fixtures/statements/";
async function read(name: string, password?: string): Promise<Statement> {
  const r = readStatement(await pdfPages(dir + name + ".pdf", password));
  assert.ok(r.ok, `${name}: ${!r.ok ? r.message : ""}`);
  return r.statement;
}
const adds = (s: Statement) => (s.openingSen ?? 0) + s.lines.reduce((n, l) => n + l.amountSen, 0);

test("numbers in both styles become exact sen", () => {
  assert.equal(senDotDecimal("1,234,567.89"), 123456789);
  assert.equal(senDotDecimal("15,000.00"), 1500000);
  assert.equal(senCommaDecimal("1.234.567,89"), 123456789);
  assert.equal(senCommaDecimal("275.000"), 27500000);
  assert.equal(senDotDecimal("12.3.4"), null);
  assert.equal(monthNumber("Oktober"), 10); assert.equal(monthNumber("October"), 10); assert.equal(monthNumber("OKTOBER"), 10);
  assert.equal(tidy("KEDAI  KOPI SENJA"), "Kedai Kopi Senja");
});

test("BCA: two pages, DB marks, details below each line, the letter-spaced header ignored", async () => {
  const s = await read("bca");
  assert.equal(s.bank, "bca");
  assert.equal(s.accountDigits, BCA.account.slice(-4));
  assert.deepEqual([s.periodFrom, s.periodTo], ["2026-10-01", "2026-10-31"]);
  assert.equal(s.lines.length, BCA.lines.length);
  assert.deepEqual(s.lines.map((l) => l.amountSen), BCA.lines.map((l: unknown[]) => l[3]));
  assert.equal(s.openingSen, BCA.opening); assert.equal(s.closingSen, totals.bca); assert.equal(adds(s), totals.bca);
  assert.match(s.lines[1].description, /Tokopedia/);
  assert.match(s.lines[3].description, /Kedai Kopi Senja/);
  assert.equal(s.lines[5].on, "2026-10-28");
});

test("Mandiri: D for debit, references, the period line", async () => {
  const s = await read("mandiri");
  assert.equal(s.bank, "mandiri");
  assert.deepEqual([s.periodFrom, s.periodTo], ["2026-10-01", "2026-10-31"]);
  assert.equal(s.accountDigits, "5678");
  assert.deepEqual(s.lines.map((l) => l.amountSen), MANDIRI.lines.map((l: unknown[]) => l[2]));
  assert.equal(s.closingSen, totals.mandiri); assert.equal(adds(s), totals.mandiri);
  assert.equal(s.lines[0].description, "Transfer ke Krom");
  assert.equal(s.lines[0].ref, "REF0001");
});

test("Krom: signed amounts, times, references, cashback marked, pockets left out", async () => {
  const s = await read("krom");
  assert.equal(s.bank, "krom");
  assert.equal(s.accountDigits, KROM.account.slice(-4));
  assert.equal(s.lines.length, KROM.lines.length);
  assert.equal(s.closingSen, totals.krom); assert.equal(adds(s), totals.krom);
  assert.equal(s.lines.filter((l) => l.cashback).length, 2);
  assert.equal(s.lines[1].time, "08:12");
  assert.equal(s.lines[1].type, "Pembayaran QRIS");
  assert.match(s.lines[6].ref ?? "", /^Bca \|/);
});

test("BRI card: locked, the bill, payments CR, foreign currency, instalments", async () => {
  await assert.rejects(pdfPages(dir + "bri-card.pdf"), /password/i);
  const s = await read("bri-card", PASSWORD);
  assert.equal(s.bank, "bri-card");
  assert.equal(s.accountDigits, "3456");
  assert.deepEqual([s.periodFrom, s.periodTo], ["2026-09-21", "2026-10-20"]);
  assert.equal(s.openingSen, BRI.previous); assert.equal(s.closingSen, totals.bri);
  assert.equal(s.openingSen! - s.lines.reduce((n, l) => n + l.amountSen, 0), totals.bri, "previous bill − (payments − charges) = this bill");
  assert.equal(s.lines[0].amountSen, 800_000_00, "a payment is money into the card");
  assert.equal(s.lines[1].amountSen, -275_000_00);
  const fx = s.lines.find((l) => l.currency)!;
  assert.deepEqual([fx.currency, fx.foreignAmount, fx.rate, fx.amountSen], ["USD", "20.00", "16,500.00", -330_000_00]);
  assert.equal(s.lines.find((l) => l.instalment)?.instalment, "3 of 12");
});

test("BCA card (FINNY-156): two cards on one bill, the bill and due date, CR payments, USD, instalments, December on a January bill", async () => {
  const s = await read("bca-card");
  assert.equal(s.bank, "bca-card");
  assert.equal(s.accountDigits, "5678", "the customer number's last 4");
  assert.deepEqual([s.periodFrom, s.periodTo, s.dueOn], ["2026-12-04", "2027-01-03", "2027-01-19"]);
  assert.equal(s.minimumSen, BCA_CARD.minimum);
  assert.equal(s.openingSen, BCA_CARD.previous); assert.equal(s.closingSen, totals.bcaCard);
  assert.equal(s.openingSen! - s.lines.reduce((n, l) => n + l.amountSen, 0), totals.bcaCard, "previous bill − (payments − charges) = this bill");
  assert.equal(s.lines.length, 5); assert.deepEqual(s.warnings, []);
  assert.deepEqual(s.lines.map((l) => l.card), ["Mastercard Contoh ·· 4821", "Mastercard Contoh ·· 4821", "Mastercard Contoh ·· 4821", "Everyday ·· 7730", "Everyday ·· 7730"]);
  const pay = s.lines.find((l) => /Pembayaran/.test(l.description))!;
  assert.deepEqual([pay.on, pay.amountSen], ["2026-12-20", 500_000_00], "a payment is money into the card");
  const fx = s.lines.find((l) => l.currency)!;
  assert.deepEqual([fx.on, fx.description, fx.currency, fx.foreignAmount, fx.rate, fx.amountSen], ["2026-12-05", "Streaming Plus Singapore Sg", "USD", "12,00", "18.000,00", -216_000_00]);
  assert.equal(s.lines.find((l) => l.instalment)?.instalment, "3 of 12");
  assert.equal(s.lines.at(-1)!.on, "2027-01-03", "a January line stays in January");
});

test("a picture-only PDF and an unknown layout are refused with a reason", async () => {
  const pic = readStatement(await pdfPages(dir + "picture.pdf"));
  assert.ok(!pic.ok && pic.reason === "no-text");
  const other = readStatement([{ w: 600, h: 800, items: [{ s: "Some other bank statement with plenty of words on it", x: 10, y: 10, w: 300, h: 9 }] }]);
  assert.ok(!other.ok && other.reason === "unknown");
  assert.match(!other.ok ? other.message : "", /BCA, BCA credit card, Mandiri, Krom and BRI/);
});

// FINNY-198: the BRI × Tokopedia co-branded card names itself only "Kartu Kredit BRI"; its month's interest comes as
// one line with no currency. A made-up bill, laid out like the real one (cells far apart on each printed line).
test("BRI co-branded card: recognised, the interest line read, the due date, and it adds up", () => {
  const rows: [number, string][][] = [
    [[20, "5221-84XX-XXXX-7788"], [200, "15-05-2026"], [320, "02-06-2026"], [450, "1.234.500"], [560, "61.725"]],
    [[20, "Yth. Bapak/Ibu"], [300, "Kartu Kredit co-branding BRI efektif per tgl 1"]],
    [[300, "Pembayaran atas tagihan Kartu Kredit BRI Anda, agar tetap dibayarkan ke masing-masing kartu"]],
    [[300, "Tagihan Bulan Lalu"], [450, "500.000"]],
    [[20, "14-04-2026"], [120, "16-04-2026"], [220, "Retail IDN Jakarta PT Tokopedia"], [400, "IDR"], [440, "0.00"], [480, "0.00"], [560, "250.000"]],
    [[20, "28-04-2026"], [120, "29-04-2026"], [220, "Retail IDN JAKARTA SELAT GOJEK RECURRING IDR"], [440, "0.00"], [480, "0.00"], [560, "54.500"]],
    [[20, "01-05-2026"], [120, "01-05-2026"], [220, "PAYMENT_KKCB_TKP000000000000_0000000"], [400, "IDR"], [440, "0.00"], [480, "0.00"], [560, "500.000CR"]],
    [[20, "06-05-2026"], [120, "07-05-2026"], [220, "Retail SGP Singapore NETFLIX.COM"], [400, "IDR"], [440, "0.00"], [480, "0.00"], [560, "186.000"]],
    [[20, "15-05-2026"], [120, "15-05-2026"], [220, "BEA MATERAI LUNAS"], [400, "IDR"], [440, "0.00"], [480, "0.00"], [560, "10.000"]],
    [[20, "15-05-2026"], [120, "15-05-2026"], [220, "TOTAL INTEREST & SERVICE CHARGE"], [560, "734.000"]],
    [[300, "Tagihan Bulan ini"], [450, "1.234.500"]],
  ];
  const items = rows.flatMap((r, i) => r.map(([x, s]) => ({ s, x, y: 40 + i * 14, w: s.length * 4, h: 8 })));
  const r = readStatement([{ w: 600, h: 800, items }]);
  assert.ok(r.ok, JSON.stringify(r));
  const s = r.statement;
  assert.equal(s.bank, "bri-card"); assert.equal(s.accountDigits, "7788");
  assert.deepEqual([s.periodFrom, s.periodTo, s.dueOn], ["2026-04-16", "2026-05-15", "2026-06-02"]);
  assert.deepEqual(s.warnings, []);
  const fee = s.lines.find((l) => l.description === "Interest and service charge");
  assert.equal(fee?.amountSen, -734_000_00);
  assert.equal(s.lines.find((l) => /Gojek/.test(l.description))?.amountSen, -54_500_00, "IDR printed inside the description");
  assert.equal(s.openingSen! - s.lines.reduce((n, l) => n + l.amountSen, 0), s.closingSen, "last month's bill − payments + charges = this bill");
});
