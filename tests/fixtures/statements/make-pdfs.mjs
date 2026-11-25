// Draws made-up e-statements in the layouts Finny reads (FINNY-74), so tests never need the owner's real files.
// Every name and amount here is invented; each statement adds up (opening + lines = closing).
//   node tests/fixtures/statements/make-pdfs.mjs [dir]  →  bca.pdf, mandiri.pdf, krom.pdf, bri-card.pdf (locked), bca-card.pdf, picture.pdf, bca-long.pdf (10 pages, for timing),
//   and (FINNY-211) mandiri-card.pdf, mandiri-livin.pdf, krom-pockets.pdf
// The BRI file is then locked with the test password "finny-test" (pypdf; see lockPdf below).
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

export const OWNER = "FINNY TESTER";
export const PASSWORD = "finny-test";
const dot = (sen) => (sen / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }); // 1,234.00
const idr = (sen) => (sen / 100).toLocaleString("de-DE", { minimumFractionDigits: 2 }); // 1.234,00
const idr0 = (sen) => Math.round(sen / 100).toLocaleString("de-DE"); // 1.234

// ---------------------------------------------------------------- the made-up month (October 2026)
export const BCA = {
  account: "0881234567", opening: 1_500_000_00,
  lines: [ // [day, type, ref lines, amount (signed), ]
    ["01", "SWITCHING CR", ["DR 014", "FINNY TESTER", "/Mobile Bank"], 750_000_00],
    ["03", "TRSF E-BANKING DB", ["0310/FTFVA/WS95031", "70001/TOKOPEDIA", "-", "-"], -250_000_00],
    ["05", "TRSF E-BANKING DB", ["0510/FTSCY/WS95011", "KARTU KREDIT BRI"], -800_000_00],
    ["12", "TRANSAKSI DEBIT", ["TGL: 12/10", "QR 014", "00000.00KEDAI KOPI SENJA"], -32_000_00],
    ["20", "BI-FAST CR", ["BIF TRANSFER DR", "014", "PT CONTOH MAKMUR"], 5_000_000_00],
    ["28", "BIAYA ADM", [], -15_000_00],
  ],
};
export const MANDIRI = {
  account: "131-00-1234567-8", opening: 2_000_000_00,
  lines: [ // [dd, description lines, amount]
    ["02", ["Transfer ke KROM", "-REF0001"], -300_000_00],
    ["09", ["Pembayaran Listrik PLN", "-REF0002"], -412_500_00],
    ["15", ["Gaji Oktober", "-REF0003"], 8_000_000_00],
    ["31", ["Biaya Adm"], -12_500_00],
  ],
};
export const KROM = {
  account: "100012345678", opening: 400_000_00,
  lines: [ // [day, time, detail, type id, type en, ref, amount]
    [2, "09.10", "Finny Tester", "Transfer Masuk", "Incoming Transfer", "Mandiri | 0000000001", 300_000_00],
    [4, "08.12", "Kedai Kopi Senja", "Pembayaran QRIS", "QRIS Payment", "QRIS000000000000000001", -28_000_00],
    [4, "08.12", "Cashback Bonus", "Transfer Masuk", "Incoming Transfer", "CB00000001", 280_00],
    [4, "12.40", "Warung Bakmi", "Pembayaran QRIS", "QRIS Payment", "QRIS000000000000000002", -45_000_00],
    [4, "12.40", "Cashback Bonus", "Transfer Masuk", "Incoming Transfer", "CB00000002", 450_00],
    [6, "18.02", "SPBU 34.123", "Pembayaran QRIS", "QRIS Payment", "QRIS000000000000000003", -150_000_00],
    [10, "07.55", "Finny Tester", "Transfer Keluar", "Outgoing Transfer", "Bca | 0000000002", -100_000_00],
  ],
};
export const BRI = {
  card: "5221-84XX-XXXX-3456", statementDate: "20-10-2026", dueDate: "05-11-2026", limit: 20_000_000_00, previous: 800_000_00,
  lines: [ // [date, posting, description, currency, foreign, rate, rupiah sen (positive), credit?]
    ["06-10-2026", "06-10-2026", "PAYMENT_KKCB_TKP0001_000001", "IDR", "0.00", "0.00", 800_000_00, true],
    ["08-10-2026", "09-10-2026", "Retail IDN JAKARTA TOKO ONLINE", "IDR", "0.00", "0.00", 275_000_00],
    ["11-10-2026", "12-10-2026", "Retail USA CLOUD.COM CLOUD SUBSCRIPTI", "USD", "20.00", "16,500.00", 330_000_00],
    ["14-10-2026", "15-10-2026", "Retail IDN DEPOK SUSHI BAR", "IDR", "0.00", "0.00", 75_000_00],
    ["15-10-2026", "15-10-2026", "PT. CONTOH ELEKTRONIK : 3/12", "IDR", "0.00", "0.00", 500_000_00],
    ["20-10-2026", "20-10-2026", "BEA MATERAI LUNAS", "IDR", "0.00", "0.00", 10_000_00],
  ],
};
/** FINNY-158: a BCA credit card bill (two cards on one bill), dated 3 January 2027 so December lines belong to 2026. */
export const BCA_CARD = {
  customer: "12345678", statementDate: "03 JANUARI 2027", dueDate: "19 JANUARI 2027", minimum: 50_000_00, previous: 500_000_00, limit: 10_000_000_00,
  cards: [ // [product, card number (empty: no card line, as when a section only has a payment), previous, lines: [date, posting, description, rupiah sen, credit?, foreign?]]
    ["MASTERCARD CONTOH", "5120-00XX-XXXX-4821", 500_000_00, [
      ["05-DES", "06-DES", "STREAMING PLUS SINGAPORE SG", 216_000_00, false, "(USD 12,00 X 18.000,00)"],
      ["20-DES", "20-DES", "PEMBAYARAN - MBCA", 500_000_00, true],
      ["28-DES", "29-DES", "TOKO BUKU ONLINE JAKARTA", 148_400_00, false],
    ]],
    ["BCA EVERYDAY CARD", "1889-00XX-XXXX-7730", 0, [
      ["15-DES", "16-DES", "CICILAN TOKO ELEKTRONIK 03/12", 300_000_00, false],
      ["03-JAN", "03-JAN", "BIAYA IURAN TAHUNAN", 125_000_00, false],
    ]],
  ],
};
/** FINNY-211: a Mandiri credit card bill (one card), a Mandiri Livin' account statement, and a Krom month with a Booster pocket
 *  and a time deposit. All invented. */
export const MANDIRI_CARD = {
  card: "4259 45** **** 7731", statementDate: "17-Oct-26", dueDate: "06-Nov-26", previous: 2_150_000_00, minimum: 50_000_00, limit: 20_000_000_00,
  lines: [ // [date, posting, description, sen, credit?, foreign?]
    ["02-Oct-26", "02-Oct-26", "PAYMENT THANK YOU - Livin", 2_150_000_00, true],
    ["04-Oct-26", "05-Oct-26", "SPBU PERTAMINA BANDUNG", 300_000_00, false],
    ["05-Oct-26", "05-Oct-26", "BUNGA CICILAN", 0, false],
    ["09-Oct-26", "11-Oct-26", "STREAMING PLUS SINGAPORE SG", 216_000_00, false, "(USD 12.00 x 18,000.00)"],
    ["12-Oct-26", "12-Oct-26", "TOKO ELEKTRONIK JAKARTA 003/012", 450_000_00, false],
    ["15-Oct-26", "15-Oct-26", "E-BILLING STATEMENT CHRGE", 5_000_00, false],
  ],
};
export const MANDIRI_LIVIN = {
  account: "1300011112222", from: "01 Nov 2026", to: "24 Nov 2026", opening: 33_013_00,
  lines: [ // [date, time, remarks above, remarks on the row, remarks below, signed sen]
    ["03 Nov 2026", "22:51:41", "Transfer BI Fast", "Dari KROM BANK INDONESIA", "FINNY TESTER 770000000001", 3_600_000_00],
    ["03 Nov 2026", "22:52:06", "", "Pembayaran kartu kredit", "4259450000007731", -3_563_226_00],
    ["04 Nov 2026", "06:03:51", "", "Biaya administrasi kartu debit", "", -9_000_00],
    ["18 Nov 2026", "23:59:00", "", "Biaya administrasi rekening", "", -6_000_00],
  ],
};
export const KROM_POCKETS = {
  account: "100012345678", mainOpening: 1_000_000_00, pocketOpening: 1_000_00,
  main: [ // [day, detail, type, signed sen] — the pocket moves and a time deposit are on the main account
    ["03", "Kedai Kopi Senja", "Pembayaran QRIS", -28_000_00],
    ["05", "Booster", "Pemindahan Saldo", -500_000_00],
    ["08", "Pembuatan Deposito", "Pemindahan Saldo", -200_000_00],
    ["20", "Booster", "Pemindahan Saldo", 300_000_00],
  ],
  pocket: [ // the Booster section
    ["05", "Tabungan Utama", "Pemindahan Saldo", 500_000_00],
    ["15", "Bunga", "Bunga", 2_500_00],
    ["15", "Pajak", "Pajak", -500_00],
    ["20", "Pencairan Dana Ke Tabungan Utama", "Pemindahan Saldo", -300_000_00],
  ],
};
export const totals = {
  bca: BCA.opening + BCA.lines.reduce((n, l) => n + l[3], 0),
  mandiri: MANDIRI.opening + MANDIRI.lines.reduce((n, l) => n + l[2], 0),
  krom: KROM.opening + KROM.lines.reduce((n, l) => n + l[6], 0),
  bri: BRI.previous + BRI.lines.reduce((n, l) => n + (l[7] ? -l[6] : l[6]), 0),
  bcaCard: BCA_CARD.previous + BCA_CARD.cards.flatMap((c) => c[3]).reduce((n, l) => n + (l[4] ? -l[3] : l[3]), 0),
  mandiriCard: MANDIRI_CARD.previous + MANDIRI_CARD.lines.reduce((n, l) => n + (l[4] ? -l[3] : l[3]), 0),
  mandiriLivin: MANDIRI_LIVIN.opening + MANDIRI_LIVIN.lines.reduce((n, l) => n + l[5], 0),
  kromMain: KROM_POCKETS.mainOpening + KROM_POCKETS.main.reduce((n, l) => n + l[3], 0),
  kromPocket: KROM_POCKETS.pocketOpening + KROM_POCKETS.pocket.reduce((n, l) => n + l[3], 0),
};

// ---------------------------------------------------------------- drawing
const css = `@page{size:A4;margin:0} body{margin:0;font-family:Arial,Helvetica,sans-serif;font-size:9px;color:#111}
.pg{position:relative;width:210mm;height:297mm;page-break-after:always;overflow:hidden} .pg:last-child{page-break-after:auto}
.t{position:absolute;white-space:pre} .b{font-weight:bold} .sp{letter-spacing:2.2px}`;
/** A page from [x mm, y mm, text, cls] cells. */
const page = (cells) => `<div class="pg">${cells.map(([x, y, s, c = ""]) => `<div class="t ${c}" style="left:${x}mm;top:${y}mm">${String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>`).join("")}</div>`;
const right = (xEnd, y, s, c = "") => [xEnd - String(s).length * 1.75, y, s, c];

function bcaHtml() {
  const head = (n, of) => [[70, 10, "REKENING TAHAPAN", "b"], [10, 22, OWNER], [115, 22, "NO. REKENING"], [146, 22, ":"], [152, 22, BCA.account], [115, 27, "HALAMAN"], [146, 27, ":"], [152, 27, `${n} / ${of}`],
    [115, 32, "PERIODE"], [146, 32, ":"], [152, 32, "OKTOBER 2026"], [115, 37, "MATA UANG"], [146, 37, ":"], [152, 37, "IDR"],
    [10, 46, "CATATAN:", "sp"], [10, 51, "Apabila nasabah tidak melakukan sanggahan atas Laporan Mutasi Rekening ini.", "sp"],
    [12, 60, "TANGGAL", "b"], [40, 60, "KETERANGAN", "b"], [108, 60, "CBG", "b"], [130, 60, "MUTASI", "b"], [178, 60, "SALDO", "b"]];
  const p1 = head(1, 2), p2 = head(2, 2);
  let y = 66, bal = BCA.opening, target = p1;
  target.push([12, y, "01/10"], [40, y, "SALDO AWAL"], right(195, y, dot(bal))); y += 5;
  BCA.lines.forEach(([d, type, refs, amt], i) => {
    if (i === 4) { target.push([90, y + 4, "Bersambung ke halaman berikut"]); target = p2; y = 66; }
    bal += amt;
    target.push([12, y, `${d}/10`], [40, y, type], [70, y, refs[0] ?? ""], right(160, y, dot(Math.abs(amt))));
    if (amt < 0) target.push([162, y, "DB"]);
    target.push(right(195, y, dot(bal)));
    y += 5;
    for (const r of refs.slice(1)) { target.push([70, y, r]); y += 5; }
  });
  const cr = BCA.lines.filter((l) => l[3] > 0), db = BCA.lines.filter((l) => l[3] < 0);
  y += 6;
  p2.push([110, y, "SALDO AWAL"], [140, y, ":"], right(175, y, dot(BCA.opening))); y += 5;
  p2.push([110, y, "MUTASI CR"], [140, y, ":"], right(175, y, dot(cr.reduce((n, l) => n + l[3], 0))), [180, y, String(cr.length)]); y += 5;
  p2.push([110, y, "MUTASI DB"], [140, y, ":"], right(175, y, dot(-db.reduce((n, l) => n + l[3], 0))), [180, y, String(db.length)]); y += 5;
  p2.push([110, y, "SALDO AKHIR"], [140, y, ":"], right(175, y, dot(totals.bca)));
  return page(p1) + page(p2);
}
/** A ten-page BCA statement (only for timing how fast a long statement is read; its totals don't matter). */
function bcaLongHtml() {
  let html = bcaHtml();
  for (let p = 3; p <= 10; p++) {
    const c = [[115, 22, "NO. REKENING"], [146, 22, ":"], [152, 22, BCA.account], [115, 32, "PERIODE"], [146, 32, ":"], [152, 32, "OKTOBER 2026"],
      [12, 60, "TANGGAL", "b"], [40, 60, "KETERANGAN", "b"], [108, 60, "CBG", "b"], [130, 60, "MUTASI", "b"], [178, 60, "SALDO", "b"]];
    for (let i = 0; i < 30; i++) { const y = 66 + i * 7; c.push([12, y, "15/10"], [40, y, "TRANSAKSI DEBIT"], [70, y, `TOKO CONTOH ${p}-${i}`], right(160, y, "10,000.00"), [162, y, "DB"]); }
    html += page(c);
  }
  return html;
}
function mandiriHtml() {
  const c = [[10, 10, "mandiri", "b"], [10, 16, "Periode / Period: 1/10/26 s/d 31/10/26"], [10, 24, OWNER],
    [10, 40, "No. Rekening"], [45, 40, "Nama Produk"], [80, 40, "Cabang"], [130, 40, "Periode"], [160, 40, "Valuta"], [190, 40, "Saldo"],
    [10, 45, MANDIRI.account], [45, 45, "MANDIRI TABUNGAN"], [80, 45, "13100 - KCP Contoh"], [130, 45, "1/10/26 s/d"], [160, 45, "Indonesian"], right(205, 45, dot(totals.mandiri)),
    [10, 56, "Tanggal", "b"], [28, 56, "Tanggal", "b"], [46, 56, "Rincian Transaksi / Nomor Referensi", "b"], [150, 56, "Debit / Kredit", "b"], [190, 56, "Saldo", "b"],
    [10, 62, "01/10"], [46, 62, "Saldo Awal"], right(205, 62, dot(MANDIRI.opening))];
  let y = 67, bal = MANDIRI.opening;
  for (const [d, desc, amt] of MANDIRI.lines) {
    bal += amt;
    c.push([10, y, `${d}/10`], [28, y, `${d}/10`], [46, y, desc[0]], right(172, y, dot(Math.abs(amt)) + (amt < 0 ? " D" : "")), right(205, y, dot(bal)));
    y += 5; for (const r of desc.slice(1)) { c.push([46, y, r]); y += 5; }
  }
  y += 4; c.push([90, y, "Saldo Awal / Previous Balance"], [150, y, ":"], right(205, y, dot(MANDIRI.opening))); y += 5;
  c.push([90, y, "Saldo Akhir / Current Balance"], [150, y, ":"], right(205, y, dot(totals.mandiri)));
  c.push([10, 280, "PT Bank Mandiri (Persero) Tbk terdaftar dan diawasi oleh OJK."]);
  return page(c);
}
function kromHtml() {
  const out = KROM.lines.filter((l) => l[6] < 0).reduce((n, l) => n - l[6], 0), inn = KROM.lines.filter((l) => l[6] > 0).reduce((n, l) => n + l[6], 0);
  const foot = [[10, 284, "PT Krom Bank Indonesia Tbk berizin dan diawasi oleh OJK dan BI serta merupakan peserta penjaminan LPS."]];
  const p1 = [[10, 8, "E-Statement Oktober 2026"], [150, 8, "Halaman 1 dari 2 / Page 1 of 2"], [10, 20, "Nama Rekening /Account Name"], [10, 25, "Finny Tester"],
    [10, 40, "Ringkasan Saldo /Balance Summary", "b"], [10, 46, "Tabungan Utama"], right(80, 46, "Rp" + idr(KROM.opening)), right(120, 46, "+Rp" + idr(inn)), right(160, 46, "-Rp" + idr(out)), right(200, 46, "Rp" + idr(totals.krom)),
    [10, 56, "Ringkasan Kantong /Pocket Summary", "b"], [10, 62, "Kantong Extra"], right(80, 62, "Rp0,00"), right(120, 62, "+Rp5.000,00"), right(160, 62, "-Rp0,00"), right(200, 62, "Rp5.000,00"), ...foot];
  const p2 = [[10, 8, "E-Statement Oktober 2026"], [150, 8, "Halaman 2 dari 2 / Page 2 of 2"], [10, 18, "Rincian Transaksi /Transaction History", "b"], [10, 25, "Tabungan Utama"],
    [10, 30, `No. Rek. /Acc. No. ${KROM.account}`],
    [10, 36, `Saldo Sebelumnya / Previous Balance   Rp${idr(KROM.opening)}`], [110, 36, `Total Pemasukan / Total Incoming   +Rp${idr(inn)}`],
    [10, 41, `Saldo Akhir / Ending Balance   Rp${idr(totals.krom)}`], [110, 41, `Total Pengeluaran / Total Outgoing   -Rp${idr(out)}`],
    [10, 50, "Tanggal & Waktu"], [50, 50, "Detail Transaksi"], [120, 50, "Tipe Transaksi"], [180, 50, "Jumlah"], ...foot];
  let y = 58;
  for (const [d, t, detail, typ, typEn, ref, amt] of KROM.lines) {
    p2.push([10, y, `${d} October 2026`], [50, y, detail], [120, y, typ], right(200, y, (amt < 0 ? "-Rp" : "+Rp") + idr(Math.abs(amt))));
    p2.push([10, y + 4.5, `${t} WIB`], [50, y + 4.5, ref], [120, y + 4.5, typEn]); y += 11;
  }
  return page(p1) + page(p2);
}
function briHtml() {
  const charges = BRI.lines.filter((l) => !l[7]).reduce((n, l) => n + l[6], 0), pay = BRI.lines.filter((l) => l[7]).reduce((n, l) => n + l[6], 0);
  const c = [[150, 8, "BRI Kartu Kredit", "b"], [10, 20, "Yth. Bapak/Ibu"], [10, 25, OWNER], [100, 20, "Daftarkan BRI Kartu Kredit Anda di BRImo untuk"],
    [10, 40, BRI.card], [55, 40, BRI.statementDate], [85, 40, BRI.dueDate], right(150, 40, idr0(BRI.limit)), right(190, 40, idr0(BRI.limit - totals.bri)),
    [10, 55, "Tagihan Bulan Lalu"], right(80, 55, idr0(BRI.previous)), [10, 62, BRI.card], [60, 62, "FINNY TESTER"]];
  let y = 70;
  for (const [d, p, desc, cur, fx, rate, sen, cr] of BRI.lines) {
    c.push([10, y, d], [32, y, p], [55, y, desc], [130, y, cur], right(160, y, fx), right(180, y, rate), right(203, y, idr0(sen) + (cr ? "CR" : ""))); y += 5;
  }
  y += 4; c.push([10, y, "Tagihan Bulan ini"], right(80, y, idr0(totals.bri)), [100, y, `Pembayaran ${idr0(pay)}  Transaksi ${idr0(charges)}`]);
  c.push([10, 284, "Nilai Tukar Transaksi Valas sudah memperhitungkan Komponen Biaya Penggunaan Kartu Kredit di Luar Negeri"]);
  return page(c);
}
function bcaCardHtml() {
  const B = BCA_CARD, lines = B.cards.flatMap((c) => c[3]);
  const pay = lines.filter((l) => l[4]).reduce((n, l) => n + l[3], 0), buy = lines.filter((l) => !l[4]).reduce((n, l) => n + l[3], 0);
  const c = [[75, 39, "REKENING KARTU KREDIT", "b"], [21, 47, OWNER], [108, 47, "NOMOR CUSTOMER"], [151, 47, ":"], [154, 47, B.customer],
    [108, 51, "TANGGAL REKENING"], [151, 51, ":"], [154, 51, B.statementDate], [108, 54, "TANGGAL JATUH TEMPO"], [151, 54, ":"], [154, 54, B.dueDate],
    [108, 57, "TAGIHAN BARU"], [151, 57, ":"], [154, 57, "RP " + idr0(totals.bcaCard)], [108, 61, "PEMBAYARAN MINIMUM"], [151, 61, ":"], [154, 61, "RP " + idr0(B.minimum)],
    [108, 65, "KUALITAS KREDIT"], [151, 65, ":"], [154, 65, "LANCAR"],
    [36, 75, "TANGGAL", "b"], [100, 77, "KETERANGAN", "b"], [162, 77, "JUMLAH (RP)", "b"], [23, 80, "TRANSAKSI", "b"], [47, 80, "PEMBUKUAN", "b"]];
  let y = 90;
  for (const [product, card, prev, rows] of B.cards) {
    c.push([19, y, product]); y += 4.2;
    c.push([19, y, "% SUKU BUNGA PEMBELANJAAN (bln/thn) 1,75/21,00"]); y += 4.2;
    c.push([19, y, "% SUKU BUNGA TARIK TUNAI (bln/thn) 1,75/21,00"]); y += 8.4;
    c.push([19, y, "SALDO SEBELUMNYA"], right(183, y, idr0(prev))); y += 4.2;
    if (card) { c.push([26, y, card], [70, y, OWNER]); y += 4.2; }
    let sub = prev;
    for (const [d, p, desc, sen, cr, fx] of rows) {
      c.push([26, y, d], [50, y, p], [69, y, desc], right(183, y, idr0(sen))); if (cr) c.push([185, y, "CR"]);
      sub += cr ? -sen : sen; y += 4.2;
      if (fx) { c.push([70, y, fx]); y += 4.2; }
    }
    c.push([19, y, "SUBTOTAL"], right(183, y, idr0(sub))); y += 8.4;
  }
  c.push([19, y, "TOTAL"], right(183, y, idr0(totals.bcaCard)));
  c.push([20, 245, "TAGIHAN SEBELUMNYA"], [57, 245, "PEMBAYARAN/CR"], [93, 245, "PEMBELANJAAN"], [130, 243, "BIAYA ADM &"], [163, 245, "TAGIHAN BARU"], [134, 247, "BUNGA"],
    right(50, 252, idr0(B.previous)), right(85, 252, idr0(pay)), right(118, 252, idr0(buy)), right(150, 252, "0"), right(185, 252, idr0(totals.bcaCard)));
  c.push([22, 260, "KREDIT LIMIT"], [47, 260, "BATAS TARIK"], [120, 260, "BEA METERAI"], [145, 260, "SISA TAGIHAN"], [171, 260, "SISA KREDIT"],
    right(40, 268, idr0(B.limit)), right(185, 268, idr0(B.limit - totals.bcaCard)), [105, 282, "1 / 1"]);
  return page(c);
}
function mandiriCardHtml() {
  const M = MANDIRI_CARD;
  const c = [[10, 12, "Lembar Tagihan Kartu Kredit / Credit Card Statement", "b"], [10, 22, OWNER], [150, 22, "Hubungi Kami / Contact Us"],
    [14, 50, "Tanggal Cetak Tagihan"], [58, 50, "Tanggal Jatuh Tempo"], [14, 54, "Statement Date"], [58, 54, "Payment Due Date"], [14, 60, M.statementDate], [58, 60, M.dueDate],
    [14, 74, "Tipe Kartu"], [46, 74, "Nomor Kartu"], [83, 74, "Nama Produk"], [146, 74, "Total Tagihan"], [180, 74, "Pembayaran Minimum"],
    [14, 78, "Card Type"], [46, 78, "Card Number"], [83, 78, "Product Name"], [146, 78, "Total Balance (IDR)"], [180, 78, "Minimum Payment (IDR)"],
    [14, 85, "Basic"], [46, 85, M.card], [83, 85, "MANDIRI KARTU KREDIT"], right(172, 85, dot(totals.mandiriCard)), right(205, 85, dot(M.minimum)),
    [14, 100, "Tanggal Transaksi Tanggal Pembukuan"], [83, 100, "Keterangan"], [190, 100, "Jumlah"],
    [14, 104, "Transaction Date"], [46, 104, "Posting Date"], [83, 104, "Description"], [190, 104, "Amount (IDR)"],
    [14, 110, OWNER], [46, 110, M.card], [83, 116, "Tagihan Bulan Lalu"], right(205, 116, dot(M.previous))];
  let y = 124;
  for (const [d, p, desc, sen, cr, fx] of M.lines) {
    c.push([14, y, d], [46, y, p], [83, y, desc], right(205, y, dot(sen))); if (cr) c.push([214 - 12, y, "CR"]);
    if (fx) { y += 5; c.push([83, y, fx]); }
    y += 6;
  }
  c.push([83, y, "SUB-TOTAL"], right(205, y, dot(totals.mandiriCard)), [180, 282, "Page 1 of 1"]);
  return page(c);
}
function mandiriLivinHtml() {
  const M = MANDIRI_LIVIN;
  const out = M.lines.filter((l) => l[5] < 0).reduce((n, l) => n - l[5], 0), inn = M.lines.filter((l) => l[5] > 0).reduce((n, l) => n + l[5], 0);
  const c = [[6, 15, "e-Statement", "b"], [100, 20, "Menara Mandiri 1 Jalan Jenderal Sudirman Kav. 54-55, Jakarta 12190, Indonesia"],
    [6, 36, "Nama/Name"], [38, 36, ":"], [42, 36, OWNER], [82, 36, "Periode/Period"], [114, 36, ":"], [119, 36, `${M.from} - ${M.to}`], [188, 36, "1 dari 1"],
    [6, 58, "Tabungan NOW IDR", "b"], [105, 61, "Saldo Awal/Initial Balance"], [157, 61, ":"], right(200, 61, idr(M.opening)),
    [6, 69, "Nomor Rekening/Account Number :"], [56, 69, M.account], [105, 69, "Dana Masuk/Incoming Transactions"], [157, 69, ":"], right(200, 69, "+ " + idr(inn)),
    [105, 77, "Dana Keluar/Outgoing Transactions"], [157, 77, ":"], right(200, 77, "- " + idr(out)),
    [105, 85, "Saldo Akhir/Closing Balance"], [157, 85, ":"], right(200, 85, idr(totals.mandiriLivin)),
    [7, 106, "No"], [18, 106, "Tanggal"], [44, 106, "Keterangan"], [134, 106, "Nominal (IDR)"], [186, 106, "Saldo (IDR)"],
    [7, 110, "No"], [18, 110, "Date"], [44, 110, "Remarks"], [136, 110, "Amount (IDR)"], [184, 110, "Balance (IDR)"]];
  let y = 122, bal = M.opening;
  M.lines.forEach(([d, t, above, row, below, sen], i) => {
    bal += sen;
    if (above) c.push([44, y - 3.5, above]);
    c.push([18, y - 1.6, d], [7, y, String(i + 1)], [44, y, row], right(160, y, (sen < 0 ? "-" : "+") + idr(Math.abs(sen))), right(200, y, idr(bal)), [18, y + 1.8, `${t} WIB`]);
    if (below) c.push([44, y + 3.6, below]);
    y += 16;
  });
  c.push([82, y, "ini adalah batas akhir transaksi anda"], [11, 205, "Disclaimer", "b"], [11, 212, "1. e-Statement ini merupakan dokumen elektronik dari Bank Mandiri."]);
  return page(c);
}
function kromPocketsHtml() {
  const K = KROM_POCKETS;
  const head = (n) => [[10, 8, "E-Statement Oktober 2026"], [150, 8, `Halaman ${n} dari 2 / Page ${n} of 2`]];
  const foot = [[10, 284, "PT Krom Bank Indonesia Tbk berizin dan diawasi oleh OJK dan BI serta merupakan peserta penjaminan LPS."]];
  const io = (xs) => [xs.filter((l) => l[3] > 0).reduce((n, l) => n + l[3], 0), xs.filter((l) => l[3] < 0).reduce((n, l) => n - l[3], 0)];
  const section = (c, y, name, opening, closing, rows) => {
    const [inn, out] = io(rows);
    c.push([10, y, name, "b"], [10, y + 5, `No. Rek. /Acc. No. ${K.account}`],
      [10, y + 11, `Saldo Sebelumnya / Previous Balance   Rp${idr(opening)}`], [110, y + 11, `Total Pemasukan / Total Incoming   +Rp${idr(inn)}`],
      [10, y + 16, `Saldo Akhir / Ending Balance   Rp${idr(closing)}`], [110, y + 16, `Total Pengeluaran / Total Outgoing   -Rp${idr(out)}`],
      [10, y + 25, "Tanggal & Waktu"], [50, y + 25, "Detail Transaksi"], [120, y + 25, "Tipe Transaksi"], [180, y + 25, "Jumlah"]);
    let yy = y + 33;
    for (const [d, detail, typ, amt] of rows) { c.push([10, yy, `${d} October 2026`], [50, yy, detail], [120, yy, typ], right(200, yy, (amt < 0 ? "-Rp" : "+Rp") + idr(Math.abs(amt))), [10, yy + 4.5, "10.00 WIB"], [50, yy + 4.5, "REF000"], [120, yy + 4.5, "Movement"]); yy += 11; }
  };
  const p1 = [...head(1), [10, 20, "Ringkasan Kantong /Pocket Summary", "b"], [10, 27, "Booster"], right(80, 27, "Rp" + idr(K.pocketOpening)), right(200, 27, "Rp" + idr(totals.kromPocket)), ...foot];
  const p2 = [...head(2), [10, 14, "Rincian Transaksi /Transaction History", "b"], ...foot];
  section(p2, 22, "Tabungan Utama", K.mainOpening, totals.kromMain, K.main);
  section(p2, 150, "Booster", K.pocketOpening, totals.kromPocket, K.pocket);
  return page(p1) + page(p2);
}
const pictureHtml = () => `<div class="pg"><canvas id="c" width="700" height="900" style="position:absolute;left:10mm;top:10mm;width:180mm"></canvas></div>
<script>const x=document.getElementById('c').getContext('2d');x.fillStyle='#1d4ed8';x.fillRect(0,0,700,60);for(let i=0;i<30;i++){x.fillStyle=i%2?'#ddd':'#eee';x.fillRect(0,80+i*26,700,22)}</script>`;

/** Locks a PDF with a user password (pypdf, the way banks lock card statements). */
function lockPdf(file) {
  execFileSync("python3", ["-I", "-c", `import sys\nfrom pypdf import PdfReader, PdfWriter\nr=PdfReader(sys.argv[1]);w=PdfWriter()\nfor p in r.pages: w.add_page(p)\nw.encrypt(user_password=sys.argv[2], owner_password=sys.argv[2]+'-owner', algorithm='AES-256')\nw.write(sys.argv[1])`, file, PASSWORD]);
}

export async function makeStatementPdfs(dir) {
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const pg = await browser.newPage();
  const out = {};
  for (const [name, html] of [["bca", bcaHtml()], ["mandiri", mandiriHtml()], ["krom", kromHtml()], ["bri-card", briHtml()], ["bca-card", bcaCardHtml()], ["picture", pictureHtml()], ["bca-long", bcaLongHtml()],
    ["mandiri-card", mandiriCardHtml()], ["mandiri-livin", mandiriLivinHtml()], ["krom-pockets", kromPocketsHtml()]]) {
    await pg.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
    await pg.waitForTimeout(50);
    const file = path.join(dir, `${name}.pdf`);
    writeFileSync(file, await pg.pdf({ format: "A4", printBackground: true }));
    out[name] = file;
  }
  await browser.close();
  lockPdf(out["bri-card"]);
  return out;
}
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) console.log(await makeStatementPdfs(process.argv[2] ?? "tests/fixtures/statements"));
