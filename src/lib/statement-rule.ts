// FINNY-70: read a bank e-statement's text (from pdf.js, in the browser) into dated lines in sen.
// Pure: no DOM, no database. One reader per known layout; anything else is "unknown".

export type TextItem = { s: string; x: number; y: number; w: number; h: number };
export type PageText = { w: number; h: number; items: TextItem[] };
/** A printed line: its cells left to right (a cell is text separated from the next by a clear gap). */
export type Line = { page: number; y: number; cells: { s: string; x: number }[]; text: string };

export type Bank = "bca" | "mandiri" | "krom" | "bri-card" | "bca-card" | "mandiri-card";
export type StatementLine = {
  on: string; // YYYY-MM-DD
  description: string;
  amountSen: number; // signed: money out of the account is negative (a card charge is negative, a payment positive)
  balanceSen?: number;
  time?: string;
  type?: string; // the bank's own type, e.g. "Pembayaran QRIS"
  ref?: string;
  currency?: string; // card lines in a foreign currency
  foreignAmount?: string;
  rate?: string;
  instalment?: string; // "3 of 12"
  cashback?: boolean;
  card?: string; // FINNY-156: the card it was charged to, on a bill with several ("Everyday ·· 2432")
};
export type Statement = {
  bank: Bank;
  accountDigits: string; // last 4 digits of the account or card
  periodFrom: string;
  periodTo: string;
  openingSen?: number;
  closingSen?: number; // savings: ending balance; card: the new bill (positive = owed)
  dueOn?: string; // card bills: the day the bill is due
  minimumSen?: number; // card bills: the minimum payment
  lines: StatementLine[];
  warnings: string[];
};
export type ReadResult = { ok: true; statement: Statement } | { ok: false; reason: "no-text" | "unknown" | "empty"; message: string };

export const BANK_NAMES: Record<Bank, string> = { bca: "BCA", "bca-card": "BCA credit card", mandiri: "Mandiri", krom: "Krom", "bri-card": "BRI credit card", "mandiri-card": "Mandiri credit card" };

// ---------------------------------------------------------------- lines

/** Groups text items into printed lines (same baseline within half a text height) and cells (gaps wider than ~1.2 spaces). */
export function toLines(pages: PageText[]): Line[] {
  const out: Line[] = [];
  pages.forEach((pg, pi) => {
    const items = pg.items.filter((i) => i.s.trim() !== "").sort((a, b) => a.y - b.y || a.x - b.x);
    const rows: TextItem[][] = [];
    for (const it of items) {
      const tol = Math.max(1.5, (it.h || 8) * 0.45);
      const row = rows.find((r) => Math.abs(r[0].y - it.y) <= tol);
      if (row) row.push(it); else rows.push([it]);
    }
    for (const r of rows) {
      r.sort((a, b) => a.x - b.x);
      const cells: { s: string; x: number }[] = [];
      let end = -Infinity;
      for (const it of r) {
        const size = it.h || 8;
        const gap = it.x - end;
        const last = cells[cells.length - 1];
        if (last && gap < size * 0.6) last.s += (gap > size * 0.12 && !last.s.endsWith(" ") && !it.s.startsWith(" ") ? " " : "") + it.s;
        else cells.push({ s: it.s, x: it.x });
        end = it.x + it.w;
      }
      for (const c of cells) c.s = c.s.replace(/\s+/g, " ").trim();
      const kept = cells.filter((c) => c.s);
      if (kept.length) out.push({ page: pi, y: r[0].y, cells: kept, text: kept.map((c) => c.s).join("  ") });
    }
  });
  return out.sort((a, b) => a.page - b.page || a.y - b.y);
}

// ---------------------------------------------------------------- numbers and dates

/** "1,234,567.89" (BCA, Mandiri, BRI) → sen. */
export function senDotDecimal(s: string): number | null {
  const m = s.trim().match(/^(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1].replace(/,/g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}
/** "1.234.567,89" (Krom, BRI's rupiah totals) → sen. */
export function senCommaDecimal(s: string): number | null {
  const m = s.trim().match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1].replace(/\./g, "")) * 100 + Number((m[2] ?? "0").padEnd(2, "0"));
}
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1, feb: 2, february: 2, februari: 2, mar: 3, march: 3, maret: 3, apr: 4, april: 4, may: 5, mei: 5,
  jun: 6, june: 6, juni: 6, jul: 7, july: 7, juli: 7, aug: 8, august: 8, agu: 8, agustus: 8, agt: 8, sep: 9, september: 9,
  oct: 10, october: 10, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12, des: 12, desember: 12,
};
export const monthNumber = (name: string) => MONTHS[name.toLowerCase().replace(/[^a-z]/g, "")] ?? 0;
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const squash = (s: string) => s.replace(/\s+/g, "").toUpperCase();

// ---------------------------------------------------------------- detect

export function detect(lines: Line[]): Bank | "unknown" {
  const head = squash(lines.slice(0, 80).map((l) => l.text).join(" "));
  const all = squash(lines.map((l) => l.text).join(" "));
  if (all.includes("REKENINGKARTUKREDIT") && all.includes("NOMORCUSTOMER")) return "bca-card";
  // FINNY-211: Mandiri's card bill, and its Livin' account statement (whose lines can say "KROM BANK", so it comes before Krom).
  if (squash(lines[0]?.text ?? "").startsWith("LEMBARTAGIHANKARTUKREDIT") && all.includes("MANDIRI") && !all.includes("RINCIANTRANSAKSI")) return "mandiri-card";
  if (head.includes("MANDIRI") && head.includes("SALDOAWAL/INITIALBALANCE")) return "mandiri";
  if (all.includes("KROMBANK") && head.includes("E-STATEMENT")) return "krom";
  if (all.includes("BRIKARTUKREDIT") || (all.includes("KARTUKREDITBRI") && all.includes("TAGIHANBULAN")) || (all.includes("KARTUKREDIT") && all.includes("BRIMO"))) return "bri-card";
  if (head.includes("NO.REKENING") && head.includes("MUTASI") && head.includes("SALDO") && (all.includes("BCA") || head.includes("KETERANGAN"))) return "bca";
  if (all.includes("MANDIRI") && (all.includes("SALDOAWAL") || all.includes("RINCIANTRANSAKSI"))) return "mandiri";
  return "unknown";
}

export function readStatement(pages: PageText[]): ReadResult {
  const chars = pages.reduce((n, p) => n + p.items.reduce((m, i) => m + i.s.trim().length, 0), 0);
  if (chars < 40) return { ok: false, reason: "no-text", message: "This PDF is a picture, so there's no text to read. Use the original PDF from your bank's email, not a printed or scanned copy." };
  const lines = toLines(pages);
  const bank = detect(lines);
  if (bank === "unknown") return { ok: false, reason: "unknown", message: "Finny doesn't know this statement's layout yet. It reads BCA, BCA credit card, Mandiri, Mandiri credit card, Krom and BRI credit card e-statements." };
  const st = READERS[bank](lines);
  if (!st.lines.length) return { ok: false, reason: "empty", message: `This looks like a ${BANK_NAMES[bank]} statement, but Finny found no transactions in it.` };
  return { ok: true, statement: st };
}

// ---------------------------------------------------------------- readers

const READERS: Record<Bank, (lines: Line[]) => Statement> = {
  bca: readBca, mandiri: (l) => (squash(l.slice(0, 80).map((x) => x.text).join(" ")).includes("SALDOAWAL/INITIALBALANCE") ? readMandiriLivin(l) : readMandiri(l)),
  krom: readKrom, "bri-card": readBri, "bca-card": readBcaCard, "mandiri-card": readMandiriCard,
};

function blank(bank: Bank): Statement { return { bank, accountDigits: "", periodFrom: "", periodTo: "", lines: [], warnings: [] }; }

/** BCA: "TANGGAL KETERANGAN CBG MUTASI SALDO"; rows "DD/MM  TRSF E-BANKING DB  …  1,234.00 DB  5,678.00", details on the lines below. */
function readBca(lines: Line[]): Statement {
  const st = blank("bca");
  const all = lines.map((l) => l.text).join("\n");
  const sq = squash(all);
  const per = sq.match(/PERIODE:([A-Z]+)(\d{4})/);
  const year = per ? Number(per[2]) : new Date().getFullYear();
  const month = per ? monthNumber(per[1]) : 1;
  st.periodFrom = iso(year, month, 1); st.periodTo = iso(year, month, lastDay(year, month));
  const acc = sq.match(/NO\.REKENING:(\d+)/); st.accountDigits = acc ? acc[1].slice(-4) : "";
  const tail = (label: string) => { const m = all.match(new RegExp(label + "\\s*:\\s*([\\d,]+\\.\\d{2})")); return m ? senDotDecimal(m[1]) ?? undefined : undefined; };
  st.openingSen = tail("SALDO AWAL"); st.closingSen = tail("SALDO AKHIR");
  // The money columns: MUTASI and SALDO, located from the header row.
  let cur: StatementLine | null = null;
  let inTable = false;
  for (const l of lines) {
    const t = squash(l.text);
    if (t.startsWith("TANGGALKETERANGAN")) { inTable = true; continue; }
    if (!inTable) continue;
    if (t.startsWith("BERSAMBUNG") || t.startsWith("SALDOAWAL:") || t.includes("NO.REKENING")) { inTable = !t.includes("NO.REKENING") && !t.startsWith("SALDOAWAL:"); cur = null; if (t.startsWith("SALDOAWAL:")) break; continue; }
    const d = l.cells[0]?.s.match(/^(\d{2})\/(\d{2})$/);
    if (d) {
      const rest = l.cells.slice(1).map((c) => c.s);
      if (/^SALDO AWAL$/i.test(rest[0] ?? "")) { cur = null; continue; }
      // amount: the cell ending in DB or a money cell; balance: the last money cell after it
      let amount: number | null = null, debit = false, balance: number | undefined;
      const words: string[] = [];
      for (const c of rest) {
        if (c === "DB" && amount !== null && balance === undefined) { debit = true; continue; }
        const m = c.match(/^([\d,]+\.\d{2})(\s*DB)?$/);
        if (m && amount === null) { amount = senDotDecimal(m[1]); debit = !!m[2]; continue; }
        if (m && amount !== null) { balance = senDotDecimal(m[1]) ?? undefined; continue; }
        words.push(c);
      }
      if (amount === null) { st.warnings.push(`A BCA line on ${d[1]}/${d[2]} has no amount`); cur = null; continue; }
      const typ = words[0] ?? "";
      const isDebit = debit || /\bDB$/.test(typ);
      cur = { on: iso(year, Number(d[2]), Number(d[1])), description: "", type: typ, amountSen: isDebit ? -amount : amount, balanceSen: balance, ref: words.slice(1).join(" ") || undefined };
      st.lines.push(cur);
      continue;
    }
    if (cur && !/^-$/.test(l.text.trim())) {
      const s = l.cells.filter((c) => !/^[\d,]+\.\d{2}$/.test(c.s)).map((c) => c.s).join(" ").trim();
      if (s && !/^\d{8,}$/.test(s)) cur.description = (cur.description + " " + s).trim();
    }
  }
  for (const x of st.lines) x.description = tidy(x.description || x.type || "");
  return st;
}

/** Mandiri consolidated: rows "DD/MM  DD/MM  description  9,999.99 D  9,999.99"; continuation lines beneath. */
function readMandiri(lines: Line[]): Statement {
  const st = blank("mandiri");
  const all = lines.map((l) => l.text).join("\n");
  // "Periode / Period: 1/10/26 s/d 31/10/26"
  const per = all.match(/Period[^:\n]*:\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*(?:s\/d|-)\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if (per) {
    const yy = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
    st.periodFrom = iso(yy(per[3]), Number(per[2]), Number(per[1])); st.periodTo = iso(yy(per[6]), Number(per[5]), Number(per[4]));
  }
  const acc = all.match(/\b\d{3}-\d{2}-\d{6,7}-\d\b/) ?? all.match(/\b\d{13}\b/); st.accountDigits = acc ? acc[0].replace(/\D/g, "").slice(-4) : "";
  const year = Number(st.periodTo.slice(0, 4)) || new Date().getFullYear();
  const startMonth = Number(st.periodFrom.slice(5, 7)) || 1;
  let cur: StatementLine | null = null;
  for (const l of lines) {
    const t = l.text;
    if (/^Saldo Awal\b/i.test(l.cells[0]?.s ?? "") || /Saldo Awal/i.test(t) && !/\d{2}\/\d{2}/.test(l.cells[0]?.s ?? "")) {
      const m = t.match(/([\d,]+\.\d{2})\s*$/); if (m && st.openingSen === undefined) st.openingSen = senDotDecimal(m[1]) ?? undefined; cur = null; continue;
    }
    const d = l.cells[0]?.s.match(/^(\d{2})\/(\d{2})$/);
    if (d && /^\d{2}\/\d{2}$/.test(l.cells[1]?.s ?? "")) {
      const money = l.cells.slice(2).filter((c) => /^[\d,]+\.\d{2}(\s*D)?$/.test(c.s));
      if (money.length < 1) { cur = null; continue; }
      const amt = money[0].s.match(/^([\d,]+\.\d{2})(\s*D)?$/)!;
      const bal = money[1] ? senDotDecimal(money[1].s.replace(/\s*D$/, "")) ?? undefined : undefined;
      const desc = l.cells.slice(2).filter((c) => !money.includes(c)).map((c) => c.s).join(" ");
      const m = Number(d[2]);
      cur = { on: iso(m < startMonth ? year : Number(st.periodFrom.slice(0, 4)) || year, m, Number(d[1])), description: desc, amountSen: (amt[2] ? -1 : 1) * (senDotDecimal(amt[1]) ?? 0), balanceSen: bal };
      st.lines.push(cur);
      continue;
    }
    if (cur) {
      if (/^(Saldo Akhir|Total|Halaman|Page)\b/i.test(t) || l.cells.length > 3) { cur = null; continue; }
      const s = t.trim();
      if (s.startsWith("-")) cur.ref = (cur.ref ? cur.ref + " " : "") + s.replace(/^-\s*/, "");
      else cur.description = (cur.description + " " + s).trim();
    }
  }
  const close = all.match(/Saldo Akhir[^\n]*?([\d,]+\.\d{2})/i); if (close) st.closingSen = senDotDecimal(close[1]) ?? undefined;
  const lastBal = [...st.lines].reverse().find((x) => x.balanceSen !== undefined);
  if (st.closingSen === undefined && lastBal) st.closingSen = lastBal.balanceSen;
  for (const x of st.lines) x.description = tidy(x.description.replace(/^-\s*/, "").replace(/-\s*$/, ""));
  return st;
}

/** Krom: "DD Month YYYY  detail  type  ±RpX.XXX,XX", then "HH.MM WIB  ref  type (English)". In Finny, Krom is the main account
 *  (Tabungan Utama) and its pockets (e.g. Booster) together (FINNY-211): moves between them ("Pemindahan Saldo") are left out
 *  (a time deposit's are kept: deposits are not part of Krom in Finny),
 *  a pocket's interest and tax are kept, and the balances add the pockets in. Each section starts with its name and then
 *  "No. Rek." or "Saldo Sebelumnya". Time deposits (Deposito) are not read. */
function readKrom(lines: Line[]): Statement {
  const st = blank("krom");
  const all = lines.map((l) => l.text).join("\n");
  const per = all.match(/E-Statement\s+([A-Za-z]+)\s+(\d{4})/);
  if (per) { const y = Number(per[2]), m = monthNumber(per[1]); st.periodFrom = iso(y, m, 1); st.periodTo = iso(y, m, lastDay(y, m)); }
  const acc = all.match(/Acc\.\s*No\.\s*(\d{6,})/i) ?? all.match(/\b(\d{12})\b/); st.accountDigits = acc ? acc[1].slice(-4) : "";
  const sum = (re: RegExp) => { const xs = [...all.matchAll(re)].map((m) => senCommaDecimal(m[1].replace(/\s/g, ""))); return xs.length && xs.every((x) => x !== null) ? xs.reduce((a, b) => a! + b!, 0)! : undefined; };
  st.openingSen = sum(/Saldo Sebelumnya\s*\/\s*Previous Balance\s+Rp\s?([\d.,]+)/g);
  st.closingSen = sum(/Saldo Akhir\s*\/\s*Ending Balance\s+Rp\s?([\d.,]+)/g);
  let section = "";
  let cur: StatementLine | null = null;
  lines.forEach((l, i) => {
    const t = l.text.trim(), next = lines[i + 1]?.text ?? "";
    if (l.cells.length === 1 && /^(No\. Rek\.|Saldo Sebelumnya)/i.test(next) && !/^(\d|No\. Rek\.|Saldo)/i.test(t)) { section = t.toLowerCase(); cur = null; return; }
    if (/^(Tabungan Utama|Kantong|Deposito)/i.test(t) && l.cells.length === 1 && !section) { section = t.toLowerCase(); cur = null; return; }
    if (!section || section.startsWith("deposito")) return;
    const main = section.startsWith("tabungan utama");
    const d = l.cells[0]?.s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    const amt = t.match(/([+-])\s*Rp\s?([\d.]+,\d{2})$/);
    if (d && amt && monthNumber(d[2])) {
      const mid = l.cells.slice(1, -1).map((c) => c.s);
      const type = mid.length > 1 ? mid[mid.length - 1] : "";
      const detail = (mid.length > 1 ? mid.slice(0, -1) : mid).join(" ");
      const sen = senCommaDecimal(amt[2]) ?? 0;
      cur = null;
      if (/^Pemindahan Saldo$/i.test(type) && !/deposit/i.test(detail)) return; // between the main account and a pocket: within Krom (a time deposit is not)
      const pocket = main ? "" : `${section.replace(/\b\w/g, (c) => c.toUpperCase())}: `; // "Booster: Bunga"
      cur = { on: iso(Number(d[3]), monthNumber(d[2]), Number(d[1])), description: tidy(pocket + detail), type, amountSen: amt[1] === "-" ? -sen : sen, cashback: main && /^cashback/i.test(detail) };
      st.lines.push(cur);
      return;
    }
    const tm = l.cells[0]?.s.match(/^(\d{2})[.:](\d{2})\s*WIB$/);
    if (cur && tm) { cur.time = `${tm[1]}:${tm[2]}`; cur.ref = l.cells[1]?.s; cur = null; }
  });
  return st;
}

/** BRI credit card: "DD-MM-YYYY  DD-MM-YYYY  description  CUR  foreign  rate  amount[CR]"; the bill on the summary row. */
function readBri(lines: Line[]): Statement {
  const st = blank("bri-card");
  const all = lines.map((l) => l.text).join("\n");
  const card = all.match(/\b\d{4}-\d{2}XX-XXXX-(\d{4})\b/); st.accountDigits = card ? card[1] : "";
  const seen = new Set<string>();
  for (const l of lines) {
    const c = l.cells.map((x) => x.s);
    const d1 = c[0]?.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (!d1 || !/^\d{2}-\d{2}-\d{4}$/.test(c[1] ?? "")) continue;
    // join the rest and parse from the right: amount, rate, foreign amount, currency
    const rest = c.slice(2).join("  ");
    const m = rest.match(/^(.*?)\s+([A-Z]{3})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.]+)(CR)?$/);
    // The month's interest and charges come as one line with no currency (seen on the Tokopedia co-branded card, May 2026).
    const fee = m ? null : rest.match(/^(TOTAL INTEREST.*?)\s+([\d.]+)(CR)?$/i);
    if (fee) {
      const sen = senCommaDecimal(fee[2]) ?? 0;
      if (sen) st.lines.push({ on: iso(Number(d1[3]), Number(d1[2]), Number(d1[1])), description: "Interest and service charge", amountSen: fee[3] ? sen : -sen });
      continue;
    }
    if (!m) { st.warnings.push(`A BRI line on ${d1[1]}-${d1[2]} couldn't be read`); continue; }
    const key = l.page + ":" + l.y;
    if (seen.has(key)) continue; seen.add(key);
    const idr = senCommaDecimal(m[5]) ?? 0;
    const desc = m[1].trim();
    const inst = desc.match(/:\s*(\d{1,2})\/(\d{1,2})\s*$/);
    st.lines.push({
      on: iso(Number(d1[3]), Number(d1[2]), Number(d1[1])),
      description: tidy(desc.replace(/^Retail\s+/i, "").replace(/^[A-Z]{3}\s+/, "")),
      amountSen: m[6] ? idr : -idr,
      currency: m[2] !== "IDR" ? m[2] : undefined,
      foreignAmount: m[2] !== "IDR" ? m[3] : undefined,
      rate: m[2] !== "IDR" ? m[4] : undefined,
      instalment: inst ? `${Number(inst[1])} of ${Number(inst[2])}` : undefined,
    });
  }
  // Period: the summary row holds the card number and two dates (the statement date and the due date); the earlier one closes the cycle.
  const sum = all.match(/\d{4}-\d{2}XX-XXXX-\d{4}\s+(\d{2})-(\d{2})-(\d{4})\s+(\d{2})-(\d{2})-(\d{4})/);
  if (sum) {
    const a = iso(Number(sum[3]), Number(sum[2]), Number(sum[1])), b = iso(Number(sum[6]), Number(sum[5]), Number(sum[4]));
    st.periodTo = a < b ? a : b;
    st.dueOn = a < b ? b : a; // FINNY-198: the later date is when it's due
    const [y, m, d] = st.periodTo.split("-").map(Number);
    st.periodFrom = new Date(Date.UTC(y, m - 2, d + 1)).toISOString().slice(0, 10);
  } else if (st.lines.length) {
    const ds = st.lines.map((x) => x.on).sort(); st.periodFrom = ds[0]; st.periodTo = ds[ds.length - 1];
  }
  const bill = all.match(/Tagihan Bulan ini\s+([\d.]+)/i); if (bill) st.closingSen = senCommaDecimal(bill[1]) ?? undefined;
  const prev = all.match(/Tagihan Bulan Lalu\s+([\d.]+)/); if (prev) st.openingSen = senCommaDecimal(prev[1]) ?? undefined;
  return st;
}

/** FINNY-156, BCA credit card: one bill per customer number with a section per card. Header "TANGGAL REKENING : 03 OKTOBER 2026",
 *  "TAGIHAN BARU : RP 243.082"; each section: the product name, "% SUKU BUNGA …", "SALDO SEBELUMNYA", the card number line,
 *  rows "DD-MMM  DD-MMM  description  180.061 [CR]" (whole rupiah) and, under a foreign charge, "(USD 10,00 X 18.006,10)". */
function readBcaCard(lines: Line[]): Statement {
  const st = blank("bca-card");
  const all = lines.map((l) => l.text).join("\n");
  const day = (label: string) => { const m = all.match(new RegExp(label + "\\s*:\\s*(\\d{1,2})\\s+([A-Za-z]+)\\s+(\\d{4})")); return m && monthNumber(m[2]) ? iso(Number(m[3]), monthNumber(m[2]), Number(m[1])) : ""; };
  const rp = (label: string) => { const m = all.match(new RegExp(label + "\\s*:\\s*RP\\s*([\\d.]+)")); return m ? senCommaDecimal(m[1]) ?? undefined : undefined; };
  st.periodTo = day("TANGGAL REKENING");
  if (st.periodTo) { const [y, m, d] = st.periodTo.split("-").map(Number); st.periodFrom = new Date(Date.UTC(y, m - 2, d + 1)).toISOString().slice(0, 10); }
  st.dueOn = day("TANGGAL JATUH TEMPO") || undefined;
  st.closingSen = rp("TAGIHAN BARU"); st.minimumSen = rp("PEMBAYARAN MINIMUM");
  const cust = all.match(/NOMOR CUSTOMER\s*:\s*(\d+)/); st.accountDigits = cust ? cust[1].slice(-4) : "";
  // The summary: "TAGIHAN SEBELUMNYA  PEMBAYARAN/CR  PEMBELANJAAN  …", its numbers a line or two below; the first is the previous bill.
  const sumAt = lines.findIndex((l) => /TAGIHAN SEBELUMNYA/.test(l.text) && /PEMBAYARAN/.test(l.text));
  if (sumAt >= 0) { const nums = lines.slice(sumAt + 1, sumAt + 4).find((l) => l.cells.length >= 3 && l.cells.every((c) => /^[\d.]+$/.test(c.s))); if (nums) st.openingSen = senCommaDecimal(nums.cells[0].s) ?? undefined; }
  const year = Number(st.periodTo.slice(0, 4)) || new Date().getFullYear(), month = Number(st.periodTo.slice(5, 7)) || 12;
  const MON = /^(\d{2})-([A-Za-z]{3})$/;
  let product = "", digits = "", cur: StatementLine | null = null;
  const label = () => { const name = tidy(product.replace(/\bBCA\b|\bCARD\b/gi, " ")); return [name, digits && `·· ${digits}`].filter(Boolean).join(" ") || undefined; };
  lines.forEach((l, i) => {
    const t = l.text;
    if (/^% SUKU BUNGA PEMBELANJAAN/i.test(t)) { const prev = lines[i - 1]; product = prev && prev.cells.length === 1 ? prev.text : ""; digits = ""; cur = null; return; }
    const card = l.cells[0]?.s.match(/^\d{4}-\d{2}XX-XXXX-(\d{4})$/);
    if (card) { digits = card[1]; cur = null; return; }
    const fx = t.match(/^\(([A-Z]{3})\s+([\d.,]+)\s+X\s+([\d.,]+)\)$/);
    if (fx && cur) { cur.currency = fx[1]; cur.foreignAmount = fx[2]; cur.rate = fx[3]; cur = null; return; }
    const d1 = l.cells[0]?.s.match(MON);
    if (!d1 || !MON.test(l.cells[1]?.s ?? "") || !monthNumber(d1[2])) { cur = null; return; }
    const rest = l.cells.slice(2).map((c) => c.s);
    const cr = rest[rest.length - 1] === "CR"; if (cr) rest.pop();
    const amt = rest.length > 1 ? rest.pop()!.match(/^[\d.]+$/) : null;
    if (!amt) { st.warnings.push(`A BCA card line on ${d1[1]}-${d1[2]} couldn't be read`); cur = null; return; }
    const m = monthNumber(d1[2]);
    const desc = rest.join(" ");
    const inst = /CICIL/i.test(desc) ? desc.match(/(\d{1,2})\s*\/\s*(\d{1,2})\s*$/) : null;
    const sen = senCommaDecimal(amt[0]) ?? 0;
    cur = { on: iso(m > month ? year - 1 : year, m, Number(d1[1])), description: tidy(desc), amountSen: cr ? sen : -sen, card: label(), instalment: inst ? `${Number(inst[1])} of ${Number(inst[2])}` : undefined };
    st.lines.push(cur);
  });
  return st;
}

/** FINNY-211, Mandiri's Livin' e-Statement: "Periode/Period : 01 Nov 2026 - 24 Nov 2026", "Saldo Awal/Initial Balance : 33.013,00".
 *  Each transaction is a numbered row ("3  Biaya administrasi  -9.000,00  60.787,00") with its date, time and the rest of its
 *  remarks on the printed lines just above and below; a printed line belongs to the numbered row nearest to it. */
function readMandiriLivin(lines: Line[]): Statement {
  const st = blank("mandiri");
  const all = lines.map((l) => l.text).join("\n");
  const day = (s: string) => { const m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/); return m && monthNumber(m[2]) ? iso(Number(m[3]), monthNumber(m[2]), Number(m[1])) : ""; };
  const per = all.match(/Periode\/Period\s+:\s+(\d{1,2} [A-Za-z]+ \d{4})\s*-\s*(\d{1,2} [A-Za-z]+ \d{4})/);
  if (per) { st.periodFrom = day(per[1]); st.periodTo = day(per[2]); }
  const acc = all.match(/Account Number\s*:\s+(\d{6,})/); st.accountDigits = acc ? acc[1].slice(-4) : "";
  const bal = (label: string) => { const m = all.match(new RegExp(label + "\\s+:\\s+([\\d.]+,\\d{2})")); return m ? senCommaDecimal(m[1]) ?? undefined : undefined; };
  st.openingSen = bal("Saldo Awal/Initial Balance"); st.closingSen = bal("Saldo Akhir/Closing Balance");
  const AMT = /^[+-]\s?[\d.]+,\d{2}$/;
  // The table on each page: after its header ("Remarks"), before the end note or the disclaimer.
  const body: Line[] = []; let on = false;
  for (const l of lines) {
    if (/Remarks/.test(l.text) && /Date/.test(l.text)) { on = true; continue; }
    if (/batas akhir transaksi|^Disclaimer/i.test(l.text)) { on = false; continue; }
    if (on && !/^(Hal|Page|\d+ (dari|of) \d+)/i.test(l.text)) body.push(l);
  }
  const rows = body.filter((l) => /^\d+$/.test(l.cells[0]?.s ?? "") && l.cells.some((c) => AMT.test(c.s)));
  type Row = { l: Line; on: string; time: string; text: string[]; amt: number; balance?: number };
  const out: Row[] = rows.map((l) => { const money = l.cells.filter((c) => AMT.test(c.s) || /^[\d.]+,\d{2}$/.test(c.s)); const a = money[0].s.replace(/\s/g, "");
    return { l, on: "", time: "", text: [], amt: (a.startsWith("-") ? -1 : 1) * (senCommaDecimal(a.slice(1)) ?? 0), balance: money[1] ? senCommaDecimal(money[1].s) ?? undefined : undefined }; });
  for (const l of body) {
    if (!out.length) break;
    const near = out.filter((r) => r.l.page === l.page).sort((a, b) => Math.abs(a.l.y - l.y) - Math.abs(b.l.y - l.y))[0];
    if (!near) continue;
    for (const c of l === near.l ? l.cells.slice(1) : l.cells) {
      if (AMT.test(c.s) || /^[\d.]+,\d{2}$/.test(c.s)) continue;
      if (day(c.s)) near.on = day(c.s);
      else if (/WIB$/.test(c.s)) near.time = c.s.replace(/\s*WIB$/, "").slice(0, 5);
      else near.text.push(c.s);
    }
  }
  for (const r of out) {
    const words = r.text.join(" ").split(" ");
    const ref = words.filter((w) => /^\d{10,}$/.test(w)).join(" ");
    st.lines.push({ on: r.on || st.periodTo, description: tidy(words.filter((w) => !/^\d{10,}$/.test(w)).join(" ")), amountSen: r.amt, balanceSen: r.balance, time: r.time || undefined, ref: ref || undefined });
  }
  if (!st.lines.length && rows.length === 0 && body.length) st.warnings.push("The table couldn't be read");
  return st;
}

/** FINNY-211, Mandiri credit card bill ("Lembar Tagihan Kartu Kredit"): the statement and due dates ("17-Jan-26  06-Feb-26"), the
 *  summary row per card ("Basic  4259 45** **** 4748  MANDIRI KARTU KREDIT  231,717.00  50,000.00"), "Tagihan Bulan Lalu" (the
 *  previous bill), a holder line with each card's number, then rows "DD-Mon-YY  DD-Mon-YY  description  amount [CR]" and, under a
 *  foreign charge, "(USD 22.20 x 18,039.28)". A charge is negative, a payment (CR) positive; lines of Rp 0 are left out. */
function readMandiriCard(lines: Line[]): Statement {
  const st = blank("mandiri-card");
  const DMY = /^(\d{2})-([A-Za-z]{3})-(\d{2})$/;
  const date = (s: string) => { const m = s.match(DMY); return m && monthNumber(m[2]) ? iso(2000 + Number(m[3]), monthNumber(m[2]), Number(m[1])) : ""; };
  const dates = lines.findIndex((l) => /Statement Date/.test(l.text) && /Due Date/.test(l.text));
  const dl = dates >= 0 ? lines.slice(dates + 1, dates + 3).find((l) => l.cells.length >= 2 && date(l.cells[0].s)) : undefined;
  if (dl) { st.periodTo = date(dl.cells[0].s); st.dueOn = date(dl.cells[1].s) || undefined; const [y, m, d] = st.periodTo.split("-").map(Number); st.periodFrom = new Date(Date.UTC(y, m - 2, d + 1)).toISOString().slice(0, 10); }
  const sums = lines.filter((l) => /^\d{4} \d{2}\*\* \*{4} \d{4}$/.test(l.cells[1]?.s ?? "") && l.cells.length >= 5);
  if (sums.length) {
    st.accountDigits = sums[0].cells[1].s.slice(-4);
    const nums = sums.map((l) => l.cells.slice(-2).map((c) => senDotDecimal(c.s)));
    if (nums.every((n) => n[0] !== null)) st.closingSen = nums.reduce((a, n) => a + n[0]!, 0);
    if (nums.every((n) => n[1] !== null)) st.minimumSen = nums.reduce((a, n) => a + n[1]!, 0);
  }
  let digits = "", cur: StatementLine | null = null, opening = 0, sawOpening = false;
  for (const l of lines) {
    const c = l.cells.map((x) => x.s);
    const holder = c.length === 2 && /^\d{4} \d{2}\*\* \*{4} (\d{4})$/.exec(c[1]);
    if (holder) { digits = holder[1]; cur = null; continue; }
    const prev = l.text.match(/Tagihan Bulan Lalu\s+([\d,]+\.\d{2})/); if (prev) { opening += senDotDecimal(prev[1]) ?? 0; sawOpening = true; cur = null; continue; }
    const fx = l.text.match(/^\(([A-Z]{3})\s+([\d.,]+)\s+x\s+([\d.,]+)\)$/i);
    if (fx && cur) { cur.currency = fx[1]; cur.foreignAmount = fx[2]; cur.rate = fx[3]; cur = null; continue; }
    const on = date(c[0] ?? "");
    if (!on || !date(c[1] ?? "")) { cur = null; continue; }
    const rest = c.slice(2); const cr = rest[rest.length - 1] === "CR"; if (cr) rest.pop();
    if (!rest.length) { cur = null; continue; } // the statement and due dates
    const amt = rest.length > 1 ? senDotDecimal(rest.pop()!) : null;
    if (amt === null) { st.warnings.push(`A Mandiri card line on ${c[0]} couldn't be read`); cur = null; continue; }
    if (amt === 0) { cur = null; continue; }
    const desc = rest.join(" ");
    const inst = desc.match(/\b(\d{3})\/(\d{3})\s*$/);
    cur = { on, description: tidy(inst ? desc.slice(0, inst.index).trim() : desc), amountSen: cr ? amt : -amt, card: digits ? `·· ${digits}` : undefined,
      instalment: inst ? `${Number(inst[1])} of ${Number(inst[2])}` : undefined };
    st.lines.push(cur);
  }
  if (sawOpening) st.openingSen = opening;
  return st;
}

/** Shop names in statements are shouted and padded; make them readable. */
export function tidy(s: string): string {
  return s.replace(/(\d)([A-Z]{2,})/g, "$1 $2").replace(/\s+/g, " ").trim().replace(/\b([A-Z][A-Z&'.]+)\b/g, (w) => (w.length <= 3 && /^(PT|CV|QR|ATM|BCA|BRI|BNI|DB|CR|XL|IDR|USD)\.?$/.test(w) ? w : w[0] + w.slice(1).toLowerCase()));
}
