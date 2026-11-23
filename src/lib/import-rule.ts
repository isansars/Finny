// Importing the owner's workbooks (FINNY-11/47). Pure: it takes the sheets as read by read-excel-file (in the browser, or
// in tests) and returns a plan (accounts, categories, transactions, a balance check per account, and the rows it can't
// place). Nothing is guessed silently: what doesn't fit goes to `unplaced`. Tests: tests/unit/import-rule.test.mts.
export type Cell = string | number | boolean | Date | null | undefined;
export type Sheet = { sheet: string; data: Cell[][] };
export type AccountType = "cash" | "bank" | "ewallet" | "card" | "loan" | "investment";

const BOOKS_HEADER = ["Tanggal", "Keterangan", "Entitas Pengirim", "Entitas Penerima", "Akun Terkait", "Jenis Transaksi", "Jumlah Transaksi", "Saldo"];
const norm = (s: unknown) => String(s ?? "").trim();
const lower = (s: unknown) => norm(s).toLowerCase();
const toSen = (v: Cell): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100);
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v.replace(/,/g, "")))) return Math.round(Number(v.replace(/,/g, "")) * 100);
  return null;
};
/** Excel dates arrive as Date (UTC midnight for date-only cells); a number is an Excel serial. */
export function toDay(v: Cell): string | null {
  // A time of day (e.g. 15:36) still belongs to that calendar day in the owner's sheet.
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  return null;
}
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;

export function guessType(name: string): AccountType {
  const n = ` ${lower(name)} `;
  if (/\b(cc|card|kartu kredit|kk)\b/.test(n)) return "card";
  if (/pinjam|paylater|pinjaman|kredivo|akulaku|cicilan|loan/.test(n)) return "loan";
  if (/gopay|\bovo\b|shopeepay|\bdana\b|linkaja|e-?money|flazz|jenius pay/.test(n)) return "ewallet";
  if (/\bkas\b|tunai|cash|dompet/.test(n)) return "cash";
  if (/reksa|saham|investasi|bibit|ajaib|stock/.test(n)) return "investment";
  return "bank";
}
export const displayName = (sheet: string) => sheet.replace(/^closed\s+/i, "").trim();
const owes = (t: AccountType) => t === "card" || t === "loan";

export type BookRow = { sheet: string; idx: number; on: string; description: string; from: string; to: string; akun: string; dir: "in" | "out"; sen: number; saldoSen: number | null };
export type SheetInfo = { sheet: string; name: string; closed: boolean; type: AccountType; rows: BookRow[]; template: boolean; firstOn: string | null; lastOn: string | null; lastSaldoSen: number | null };
export type Books = { kind: "books"; owner: string; sheets: SheetInfo[]; coa: Map<string, { kind1: string; path: string[] }> };

/** Finds the account sheets (by their header), the chart of accounts and the owner (the most frequent person). */
export function readBooks(sheets: Sheet[]): Books | null {
  const coa = new Map<string, { kind1: string; path: string[] }>();
  const coaSheet = sheets.find((s) => lower(s.sheet) === "coa");
  if (coaSheet) {
    const h = coaSheet.data.findIndex((r) => r && lower(r[0]) === "nama akun");
    for (const r of coaSheet.data.slice(h + 1)) {
      const name = norm(r?.[0]); if (!name) continue;
      const levels = (r ?? []).slice(2, 8).map(norm).filter(Boolean);
      if (!levels.length) continue;
      coa.set(lower(name), { kind1: levels[0], path: levels.slice(1).length ? levels.slice(1) : [name] });
    }
  }
  const infos: SheetInfo[] = [];
  for (const s of sheets) {
    const h = s.data.findIndex((r) => r && BOOKS_HEADER.every((col, i) => norm(r[i]) === col));
    if (h < 0 || /gabungan/i.test(s.sheet)) continue;
    const rows: BookRow[] = [];
    s.data.slice(h + 1).forEach((r, i) => {
      const on = toDay(r?.[0] ?? null), sen = toSen(r?.[6] ?? null), j = lower(r?.[5]);
      if (!on || sen === null || sen === 0 || (j !== "debet" && j !== "kredit")) return;
      rows.push({ sheet: s.sheet, idx: i, on, description: norm(r[1]), from: norm(r[2]), to: norm(r[3]), akun: norm(r[4]), dir: j === "kredit" ? "in" : "out", sen: Math.abs(sen), saldoSen: toSen(r[7] ?? null) });
    });
    const days = rows.map((r) => r.on).sort();
    infos.push({ sheet: s.sheet, name: displayName(s.sheet), closed: /^closed\s/i.test(s.sheet), type: guessType(displayName(s.sheet)), rows, template: false,
      firstOn: days[0] ?? null, lastOn: days[days.length - 1] ?? null, lastSaldoSen: rows.length ? rows[rows.length - 1].saldoSen : null });
  }
  if (!infos.length) return null;
  const people = new Map<string, number>();
  for (const i of infos) for (const r of i.rows) for (const p of [r.from, r.to]) if (p) people.set(p, (people.get(p) ?? 0) + 1);
  const owner = [...people.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  // A template's example sheet: the owner appears in fewer than half of its rows (the template's own sample person does).
  for (const i of infos) i.template = !!i.rows.length && i.rows.filter((r) => r.from === owner || r.to === owner).length < i.rows.length / 2;
  return { kind: "books", owner, sheets: infos, coa };
}

/** `align`: for an account whose balance after the import differs from the workbook, move its opening balance by the
 *  difference so today's balance equals the sheet (no spending or income is invented). On by default. */
export type Choices = { include: Record<string, boolean>; types: Record<string, AccountType>; names?: Record<string, string>; align?: Record<string, boolean> };
export const defaultChoices = (b: Books): Choices => ({
  include: Object.fromEntries(b.sheets.map((s) => [s.sheet, !s.template && s.rows.length > 0])),
  types: Object.fromEntries(b.sheets.map((s) => [s.sheet, s.type])),
});

export type PlanAccount = { key: string; name: string; type: AccountType; openingSen: number; openingOn: string; limitSen: number | null; archived: boolean; fromSheet: string | null };
export type PlanCategory = { key: string; kind: "income" | "expense"; path: string[] };
export type PlanTxn = { ref: string; mate?: string; on: string; kind: "spend" | "income" | "transfer"; sen: number; account: string; toAccount?: string; category?: string; description: string; entity: string | null };
export type Unplaced = { ref: string; sheet: string; on: string; description: string; sen: number; dir: "in" | "out"; akun: string; reason: string };
/** ok: Finny equals the workbook. Otherwise `explainedSen` is what the transfers recorded only in other sheets add up to
 *  (`oneSided` of them, listed in `refs`): when it equals the gap, the gap is in the workbook itself, not the import. */
export type Check = { account: string; workbookSen: number; finnySen: number; ok: boolean; oneSided: number; explainedSen: number; explained: boolean; refs: string[]; adjustedSen: number };
export type Plan = { accounts: PlanAccount[]; categories: PlanCategory[]; txns: PlanTxn[]; checks: Check[]; unplaced: Unplaced[]; stats: { transfers: number; paired: number; oneSided: number; rows: number } };

const compress = (p: string[]) => (p.length <= 3 ? p : [p[0], p[p.length - 2], p[p.length - 1]]);
const catKey = (kind: string, path: string[]) => `${kind}|${path.join(" › ")}`;

export function buildPlan(b: Books, c: Choices): Plan {
  const nameOf = (sheet: string) => c.names?.[sheet]?.trim() || displayName(sheet);
  const sheetByName = new Map<string, SheetInfo>();
  for (const s of b.sheets) { sheetByName.set(lower(s.sheet), s); sheetByName.set(lower(displayName(s.sheet)), s); }
  const included = b.sheets.filter((s) => c.include[s.sheet]);
  const accounts = new Map<string, PlanAccount>();
  const typeOf = (s: SheetInfo) => c.types[s.sheet] ?? s.type;
  /** The account a row's "Akun Terkait" names (another sheet, included or not), or null. */
  const accountFor = (akun: string) => sheetByName.get(lower(akun)) ?? null;
  const ensure = (s: SheetInfo) => {
    const key = s.sheet;
    if (!accounts.has(key)) accounts.set(key, { key, name: nameOf(s.sheet), type: typeOf(s), openingSen: 0, openingOn: s.firstOn ?? "2000-01-01", limitSen: null, archived: s.closed, fromSheet: c.include[s.sheet] ? s.sheet : null });
    return accounts.get(key)!;
  };
  const txns: PlanTxn[] = [], unplaced: Unplaced[] = [], cats = new Map<string, PlanCategory>();
  const used = new Set<string>(); // rows consumed (openings, paired transfers)
  const ref = (r: BookRow) => `${r.sheet}#${r.idx}`;
  const cat = (kind: "income" | "expense", path: string[]) => { const k = catKey(kind, path); if (!cats.has(k)) cats.set(k, { key: k, kind, path }); return k; };
  const entityOf = (r: BookRow) => { const e = r.dir === "out" ? r.to : r.from; return !e || e === b.owner || /^lainnya$/i.test(e) || accountFor(e) ? null : e; };

  // 1. Openings: a sheet's first row that funds it ("Modal Awal" or the sheet itself, e.g. "Limit Awal").
  for (const s of included) {
    const a = ensure(s), first = s.rows[0];
    if (!first) continue;
    const isOpening = first.dir === "in" && (lower(first.akun) === "modal awal" || accountFor(first.akun) === s);
    if (owes(a.type)) {
      if (isOpening) { a.limitSen = first.sen; used.add(ref(first)); a.openingOn = first.on; }
    } else if (isOpening) { a.openingSen = first.sen; a.openingOn = first.on; used.add(ref(first)); }
    else if (first.saldoSen !== null) { a.openingSen = first.saldoSen - (first.dir === "in" ? first.sen : -first.sen); a.openingOn = first.on; }
  }
  // 2. Transfers: a row naming another account. Pair it with the other sheet's opposite row (same amount, within 3 days).
  let paired = 0, oneSided = 0;
  const pool = new Map<string, BookRow[]>(); // other sheet → its candidate rows
  for (const s of included) pool.set(s.sheet, s.rows.filter((r) => !used.has(ref(r))));
  for (const s of included) for (const r of s.rows) {
    if (used.has(ref(r))) continue;
    const other = accountFor(r.akun);
    if (!other || other === s) continue;
    const mate = (pool.get(other.sheet) ?? []).find((m) => !used.has(ref(m)) && m.sen === r.sen && m.dir !== r.dir && dayDiff(m.on, r.on) <= 3
      && (accountFor(m.akun) === s || !accountFor(m.akun)));
    used.add(ref(r)); if (mate) { used.add(ref(mate)); paired++; } else oneSided++;
    const here = ensure(s).key, there = ensure(other).key;
    const [from, to] = r.dir === "out" ? [here, there] : [there, here];
    const outRow = r.dir === "out" ? r : mate ?? r;
    txns.push({ ref: ref(r), mate: mate ? ref(mate) : undefined, on: outRow.on, kind: "transfer", sen: r.sen, account: from, toAccount: to, description: r.description || mate?.description || "", entity: null });
  }
  // 3. Everything else, through the chart of accounts.
  for (const s of included) {
    const firstModal = new Set<string>();
    for (const r of s.rows) {
      if (used.has(ref(r))) continue;
      const a = ensure(s).key, key = lower(r.akun), node = b.coa.get(key);
      if (!r.akun) { unplaced.push({ ref: ref(r), sheet: s.sheet, on: r.on, description: r.description, sen: r.sen, dir: r.dir, akun: r.akun, reason: "No \"Akun Terkait\"" }); continue; }
      if (!node) { unplaced.push({ ref: ref(r), sheet: s.sheet, on: r.on, description: r.description, sen: r.sen, dir: r.dir, akun: r.akun, reason: `"${r.akun}" isn't an account or a category in the workbook` }); continue; }
      let kind: "income" | "expense", path: string[];
      // The tree only where the chart of accounts agrees with the direction (spending out, income in). Anything that
      // crosses (lending to a friend, a loan spent on living costs, an asset cashed in) is its own top-level category,
      // named by the owner's own word for it, not by an accounting group such as "Liabilitas Lancar".
      const leaf = [node.path[node.path.length - 1]];
      if (r.dir === "out") { kind = "expense"; path = /^pengeluaran$/i.test(node.kind1) ? compress(node.path) : leaf; }
      else if (/^pengeluaran$/i.test(node.kind1)) { kind = "income"; path = ["Pengembalian Dana"]; }
      else if (key === "modal awal") { kind = "income"; path = ["Modal Awal"]; firstModal.add(ref(r)); }
      else { kind = "income"; path = /^pendapatan$/i.test(node.kind1) ? compress(node.path) : leaf; }
      txns.push({ ref: ref(r), on: r.on, kind: kind === "expense" ? "spend" : "income", sen: r.sen, account: a, category: cat(kind, path), description: r.description, entity: entityOf(r) });
    }
  }
  // 4. The balance check: Finny's balance after the import vs the workbook's last Saldo (for cards and loans: Saldo − limit).
  const bal = new Map<string, number>();
  for (const a of accounts.values()) bal.set(a.key, a.openingSen);
  for (const t of txns) {
    if (t.kind === "income") bal.set(t.account, bal.get(t.account)! + t.sen);
    else if (t.kind === "spend") bal.set(t.account, bal.get(t.account)! - t.sen);
    else { bal.set(t.account, bal.get(t.account)! - t.sen); bal.set(t.toAccount!, bal.get(t.toAccount!)! + t.sen); }
  }
  const checks: Check[] = [];
  for (const s of included) {
    const a = accounts.get(s.sheet)!;
    if (s.lastSaldoSen === null) continue;
    const workbookSen = owes(a.type) ? s.lastSaldoSen - (a.limitSen ?? 0) : s.lastSaldoSen;
    const finnySen = bal.get(a.key)!;
    const mine = (r: string | undefined) => !!r && r.startsWith(s.sheet + "#");
    const foreign = txns.filter((t) => t.kind === "transfer" && (t.account === a.key || t.toAccount === a.key) && !mine(t.ref) && !mine(t.mate));
    const explainedSen = foreign.reduce((n, t) => n + (t.toAccount === a.key ? t.sen : -t.sen), 0);
    const gap = workbookSen - finnySen, align = gap !== 0 && (c.align?.[s.sheet] ?? true);
    if (align) a.openingSen += gap;
    checks.push({ account: a.key, workbookSen, finnySen: finnySen + (align ? gap : 0), ok: gap === 0 || align, oneSided: foreign.length, explainedSen,
      explained: -gap === explainedSen, refs: foreign.map((t) => t.ref), adjustedSen: align ? gap : 0 });
  }
  return { accounts: [...accounts.values()], categories: [...cats.values()], txns, checks, unplaced,
    stats: { transfers: paired + oneSided, paired, oneSided, rows: included.reduce((n, s) => n + s.rows.length, 0) } };
}

// ---------- the wealth workbook's Transaction Log: only rows that aren't already in the books
export type LogRow = { ref: string; on: string; account: string; type: string; category: string; description: string; sen: number };
export function readLog(sheets: Sheet[]): LogRow[] | null {
  const s = sheets.find((x) => lower(x.sheet) === "transaction log");
  if (!s) return null;
  const h = s.data.findIndex((r) => r && r.some((v) => norm(v) === "Date") && r.some((v) => norm(v) === "Total"));
  if (h < 0) return null;
  const head = s.data[h].map(norm), col = (n: string) => head.indexOf(n);
  const out: LogRow[] = [];
  s.data.slice(h + 1).forEach((r, i) => {
    const on = toDay(r?.[col("Date")] ?? null), sen = toSen(r?.[col("Total")] ?? null);
    if (!on || !sen) return;
    out.push({ ref: `log#${i}`, on, account: norm(r[col("Account")]), type: norm(r[col("Type")]), category: norm(r[col("Category")]), description: norm(r[col("Description")]), sen: Math.abs(sen) });
  });
  return out;
}
/** Log rows with no books row of the same day and amount (rupiah, rounded). */
export function logOnly(log: LogRow[], b: Books | null, existing: { on: string; sen: number }[] = []): LogRow[] {
  const seen = new Set<string>();
  const k = (on: string, sen: number) => `${on}|${Math.round(sen / 100)}`;
  for (const s of b?.sheets ?? []) for (const r of s.rows) seen.add(k(r.on, r.sen));
  for (const e of existing) seen.add(k(e.on, e.sen));
  return log.filter((r) => !seen.has(k(r.on, r.sen)));
}
