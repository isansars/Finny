"use client";
// The workbook match check (FINNY-128), as approved in "Sprint 12 · Design notes (workbook match check, approved)".
// The workbook is read here, on the device, with the import's own reader; it is never uploaded. The server gives
// Finny's side of the month and keeps only the counts.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, FileSpreadsheet, Lock, Plus, Scale, X } from "lucide-react";
import { api, useFinny } from "./store";
import { formatRupiah } from "@/lib/money";
import { monthLabel, shortDate } from "@/lib/dates";
import { readBooks, readLog, type Books, type LogRow, type Sheet } from "@/lib/import-rule";
import { compareAccounts, compareCategories, finnyRows, forAccount, forCategory, logSide, matchCounts, rowsBehind, workbookSide, type AccountLine, type CategoryLine, type FinnySide, type Row } from "@/lib/match-rule";

type Finny = FinnySide & { month: string };
type Pick = { kind: "account"; line: AccountLine } | { kind: "category"; line: CategoryLine; source: "books" | "log" };
const plain = (sen: number) => formatRupiah(sen, { prefix: false });
const signed = (sen: number) => `${sen > 0 ? "+" : sen < 0 ? "−" : ""}${plain(Math.abs(sen))}`;
const endLabel = (m: string) => { const [y, mm] = m.split("-").map(Number); return shortDate(`${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`).replace(/ \d{4}$/, ""); };
const monthName = (m: string) => monthLabel(m).split(" ")[0];
const day = (on: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(on + "T00:00:00Z"));

async function readSheets(f: File): Promise<Sheet[]> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  return (await Promise.race([readXlsxFile(f), new Promise((_, no) => setTimeout(() => no(new Error("reading took too long; try again, or on a computer")), 120000))])) as unknown as Sheet[];
}

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`fy-mt-mark ${ok ? "ok" : "no"}`} role="img" aria-label={label}>{ok ? <Check size={13} strokeWidth={3} /> : <X size={13} strokeWidth={3} />}</span>;
}

export function MatchCheck({ month }: { month: string }) {
  const { reload } = useFinny();
  const [books, setBooks] = useState<{ name: string; b: Books } | null>(null);
  const [log, setLog] = useState<{ name: string; rows: LogRow[] } | null>(null);
  const [finny, setFinny] = useState<Finny | null>(null);
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [all, setAll] = useState({ accounts: false, categories: false });

  async function choose(f: File, want: "books" | "log") {
    setErr(""); setBusy(`Reading ${f.name}…`);
    try {
      const sheets = await readSheets(f);
      if (want === "books") { const b = readBooks(sheets); if (!b) throw new Error("this isn't the Pengeluaran workbook (no account sheets with Tanggal, Keterangan, …)"); setBooks({ name: f.name, b }); }
      else { const l = readLog(sheets); if (!l) throw new Error("this workbook has no Transaction Log"); setLog({ name: f.name, rows: l }); }
    } catch (e) { setErr(`Couldn't read the file: ${(e as Error).message}`); }
    setBusy("");
  }

  const w = useMemo(() => (books ? workbookSide(books.b, month) : null), [books, month]);
  const lg = useMemo(() => (log ? logSide(log.rows, month) : null), [log, month]);
  const fRows = useMemo(() => (finny ? finnyRows(finny) : []), [finny]);
  const fCats = useMemo(() => {
    const m = new Map<string, { name: string; kind: "income" | "expense"; sen: number }>();
    for (const r of fRows) if (r.category && r.categoryKind) { const k = `${r.categoryKind}|${r.category}`; const c = m.get(k) ?? { name: r.category, kind: r.categoryKind, sen: 0 }; c.sen += r.sen; m.set(k, c); }
    return [...m.values()];
  }, [fRows]);
  const accounts = useMemo(() => (w && finny ? compareAccounts(w.accounts, finny.accounts, pairs) : []), [w, finny, pairs]);
  const cats = useMemo(() => (w && finny ? compareCategories(w.categories, fCats) : []), [w, finny, fCats]);
  const logCats = useMemo(() => (lg && finny ? compareCategories(lg.categories, fCats) : []), [lg, finny, fCats]);
  const counts = useMemo(() => {
    const c = matchCounts(accounts, [...cats, ...logCats]);
    return { ...c, differences: c.accountsTotal - c.accountsOk + c.categoriesTotal - c.categoriesOk };
  }, [accounts, cats, logCats]);

  async function save(c = counts) {
    // Counts only: never a name, an amount or a row from the workbook.
    await api(`reviews/${month}/match`, { method: "POST", json: { accountsOk: c.accountsOk, accountsTotal: c.accountsTotal, categoriesOk: c.categoriesOk, categoriesTotal: c.categoriesTotal, withLog: !!log } });
  }
  async function check() {
    setErr(""); setBusy("Comparing…");
    try { const f = await api<Finny>(`match?month=${month}`); setFinny(f); } catch (e) { setErr((e as Error).message); }
    setBusy("");
  }
  // Saves the counts whenever they change after a check (adding rows or pairing changes them).
  const saved = finny && w && (counts.accountsTotal || counts.categoriesTotal) ? `${counts.accountsOk}/${counts.accountsTotal}/${counts.categoriesOk}/${counts.categoriesTotal}/${!!log}` : "";
  useEffect(() => { if (saved) save().catch(() => {}); }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Adds a workbook row to Finny as if typed: its account (by name or pairing) and category (by name and kind). */
  async function add(rows: Row[]) {
    if (!finny) return;
    setErr(""); setMsg("");
    const accId = (name?: string) => { if (!name) return null; const line = accounts.find((a) => a.name === name); return line?.finnyId ?? finny.accounts.find((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? null; };
    const catId = (r: Row) => finny.categories.find((c) => c.name.trim().toLowerCase() === r.category?.trim().toLowerCase() && (r.categoryKind === "income" ? c.kind === "income" : c.kind !== "income"))?.id ?? null;
    let n = 0;
    try {
      for (const r of rows) {
        const accountId = accId(r.account), toAccountId = r.kind === "transfer" ? accId(r.toAccount) : null, categoryId = r.kind === "transfer" ? null : catId(r);
        if (!accountId || (r.kind === "transfer" && !toAccountId)) throw new Error(`"${r.kind === "transfer" && accountId ? r.toAccount : r.account}" isn't an account in Finny; pair it first.`);
        if (r.kind !== "transfer" && !categoryId) throw new Error(`"${r.category}" isn't a category in Finny; add it in Settings › Categories first.`);
        await api("transactions", { method: "POST", json: { kind: r.kind, amountSen: r.sen, on: r.on, accountId, toAccountId, categoryId, description: r.description } });
        n++;
      }
    } catch (e) { setErr((e as Error).message); }
    if (n) { setMsg(`Added ${n} row${n === 1 ? "" : "s"} to Finny.`); setFinny(await api<Finny>(`match?month=${month}`)); reload(); }
  }

  const behind = useMemo(() => {
    if (!pick || !finny) return null;
    const src = pick.kind === "category" && pick.source === "log" ? lg! : w!;
    const fn = pick.kind === "account" ? forAccount(pick.line.name) : forCategory(pick.line.name, pick.line.kind);
    // The Finny side of a renamed (paired) account goes by its Finny name.
    const fr = pick.kind === "account" && pick.line.finnyId ? fRows.map((r) => ({ ...r, account: r.account === finny.accounts.find((a) => a.id === pick.line.finnyId)?.name ? pick.line.name : r.account, toAccount: r.toAccount === finny.accounts.find((a) => a.id === pick.line.finnyId)?.name ? pick.line.name : r.toAccount })) : fRows;
    return rowsBehind(src.rows, fr, fn);
  }, [pick, finny, w, lg, fRows]);
  // Keep the picked line current after adding rows.
  const line = pick ? (pick.kind === "account" ? accounts.find((a) => a.name === pick.line.name) : (pick.source === "log" ? logCats : cats).find((c) => c.name === pick.line.name && c.kind === pick.line.kind)) : null;

  // ---- a difference
  if (pick && line && behind) {
    const lower = line.diffSen < 0, title = pick.line.name;
    return (
      <>
        <button className="fy-back" onClick={() => { setPick(null); setMsg(""); }}><ChevronLeft size={20} />Results</button>
        <div className="fy-large"><div><div className="sub">{monthLabel(month)}</div><h1>{title}</h1></div></div>
        {err && <div className="fy-err" role="alert">{err}</div>}
        <div className="fy-hero" style={{ padding: "14px 16px" }} data-testid="mt-diff">
          <div className="stats">
            <div className="fy-stat"><small>{pick.kind === "account" ? `Workbook, ${endLabel(month)}` : "Workbook"}</small><b>{line.workbookSen == null ? "–" : `Rp ${plain(line.workbookSen)}`}</b></div>
            <div className="fy-stat"><small>{pick.kind === "account" ? `Finny, ${endLabel(month)}` : "Finny"}</small><b>{line.finnySen == null ? "–" : `Rp ${plain(line.finnySen)}`}</b></div>
          </div>
          <div className="extra"><span>{line.ok ? <b style={{ color: "var(--income)" }}>They match now ✓</b> : <>Finny is <b style={{ color: "var(--spend)" }}>Rp {plain(Math.abs(line.diffSen))} {lower ? "lower" : "higher"}</b></>}</span></div>
        </div>
        <div className="fy-section"><span>Only in the workbook</span><span>{behind.onlyWorkbook.length}</span></div>
        <div className="fy-list" data-testid="mt-only-wb">
          {!behind.onlyWorkbook.length && <div className="fy-row"><div className="main"><div className="s" style={{ whiteSpace: "normal" }}>Nothing: every workbook row is in Finny too.</div></div></div>}
          {behind.onlyWorkbook.map((r) => (
            <div className="fy-row" key={r.ref}><div className="main"><div className="t">{r.description || r.category || "—"}</div><div className="s">{day(r.on)}{r.category ? ` · ${r.category}` : r.kind === "transfer" ? ` · ${r.account} → ${r.toAccount}` : ""}</div></div>
              <div style={{ textAlign: "right" }}><div className={`fy-amt ${r.signedSen < 0 || r.kind === "spend" ? "spend" : "income"}`}>{pick.kind === "account" ? signed(r.signedSen) : plain(r.sen)}</div>
                <button className="fy-linkish" style={{ color: "var(--primary-text)", fontWeight: 800, fontSize: 13 }} onClick={() => add([r])} aria-label={`Add ${r.description || r.category} to Finny`}>Add to Finny</button></div></div>
          ))}
        </div>
        <div className="fy-section"><span>Only in Finny</span><span>{behind.onlyFinny.length}</span></div>
        <div className="fy-list" data-testid="mt-only-finny">
          {!behind.onlyFinny.length && <div className="fy-row"><div className="main"><div className="s" style={{ whiteSpace: "normal" }}>Nothing: every Finny row here is in the workbook too.</div></div></div>}
          {behind.onlyFinny.map((r) => (
            <div className="fy-row" key={r.ref}><div className="main"><div className="t">{r.description || r.category || "—"}</div><div className="s">{day(r.on)}{r.category ? ` · ${r.category}` : ""}</div></div>
              <span className={`fy-amt ${r.signedSen < 0 || r.kind === "spend" ? "spend" : "income"}`}>{pick.kind === "account" ? signed(r.signedSen) : plain(r.sen)}</span></div>
          ))}
        </div>
        {msg && <div className="fy-ok" role="status" style={{ marginTop: 10 }}><Check size={16} /> {msg}</div>}
        {behind.onlyWorkbook.length > 1 && <button className="fy-btn primary block" style={{ marginTop: 12 }} onClick={() => add(behind.onlyWorkbook)}><Plus size={16} />Add all {behind.onlyWorkbook.length} to Finny</button>}
        {behind.onlyFinny.length > 0 && <div className="fy-hint" style={{ marginTop: 10 }}>A row only in Finny may be missing from the workbook, or typed twice in Finny. Open it from Home to fix or delete it.</div>}
      </>
    );
  }

  // ---- the result
  if (finny && w) {
    const shown = <T extends { ok: boolean }>(xs: T[], open: boolean) => (open ? xs : xs.filter((x) => !x.ok).concat(xs.filter((x) => x.ok).slice(0, 3)));
    const more = <T extends { ok: boolean }>(xs: T[], open: boolean) => (open ? 0 : Math.max(0, xs.filter((x) => x.ok).length - 3));
    const catList = (list: CategoryLine[], source: "books" | "log", testid: string) => (
      <div className="fy-list" data-testid={testid}>
        {shown(list, all.categories).map((c) => (
          <button className="fy-row fy-linkish" key={`${c.kind}${c.name}`} style={{ width: "100%", gap: 10 }} disabled={c.ok} onClick={() => setPick({ kind: "category", line: c, source })}>
            <Mark ok={c.ok} label={c.ok ? "matches" : "differs"} /><div className="main"><div className="t">{c.name}{c.kind === "income" ? " (income)" : ""}</div><div className="s" style={{ whiteSpace: "normal" }}>{c.ok ? plain(c.workbookSen) : `Workbook ${plain(c.workbookSen)} · Finny ${plain(c.finnySen)}`}</div></div>
            {!c.ok && <><span className="fy-amt spend">{signed(c.diffSen)}</span><ChevronRight className="chev" size={18} /></>}
          </button>))}
        {more(list, all.categories) > 0 && <button className="fy-row fy-linkish" style={{ width: "100%" }} onClick={() => setAll({ ...all, categories: true })}><div className="main"><div className="s" style={{ color: "var(--primary-text)", fontWeight: 800 }}>{more(list, all.categories)} more match</div></div></button>}
      </div>
    );
    const diffs = counts.differences;
    return (
      <>
        <button className="fy-back" onClick={() => setFinny(null)}><ChevronLeft size={20} />Back</button>
        <div className="fy-large"><div><div className="sub">Check against your workbook</div><h1>{monthLabel(month)}</h1></div></div>
        {err && <div className="fy-err" role="alert">{err}</div>}
        <div className="fy-hero" style={{ padding: "14px 16px" }} data-testid="mt-head">
          <div className="lbl">{books!.name}{log ? ` and ${log.name}` : ""} vs Finny</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{diffs ? `${diffs} difference${diffs === 1 ? "" : "s"}` : "Everything matches ✓"}</div>
          <div className="stats" style={{ marginTop: 8 }}>
            <div className="fy-stat"><small>Accounts</small><b>{counts.accountsOk} of {counts.accountsTotal} match</b></div>
            <div className="fy-stat"><small>Categories</small><b>{counts.categoriesOk} of {counts.categoriesTotal} match</b></div>
          </div>
        </div>
        <div className="fy-section"><span>Accounts · balance on {endLabel(month)}</span><span>{accounts.filter((a) => !a.ok).length ? `${accounts.filter((a) => !a.ok).length} differ` : "all match"}</span></div>
        <div className="fy-list" data-testid="mt-accounts">
          {shown(accounts, all.accounts).map((a) => (
            <div key={a.name} className="fy-mt-acc">
              <button className="fy-row fy-linkish" style={{ width: "100%", gap: 10 }} disabled={a.ok || a.finnySen === null} onClick={() => setPick({ kind: "account", line: a })}>
                <Mark ok={a.ok} label={a.ok ? "matches" : "differs"} /><div className="main"><div className="t">{a.name}</div><div className="s" style={{ whiteSpace: "normal" }}>{a.finnySen === null ? "Not in Finny by this name" : a.ok ? plain(a.workbookSen!) : `Workbook ${plain(a.workbookSen!)} · Finny ${plain(a.finnySen)}`}</div></div>
                {!a.ok && a.finnySen !== null && <><span className="fy-amt spend">{signed(a.diffSen)}</span><ChevronRight className="chev" size={18} /></>}
              </button>
              {a.finnySen === null && <label className="fy-field" style={{ margin: "0 14px 10px" }}><span className="fy-label">Pair with a Finny account</span>
                <select className="fy-input" aria-label={`Pair ${a.name} with`} value={pairs[a.name] ?? ""} onChange={(e) => setPairs({ ...pairs, [a.name]: e.target.value })}>
                  <option value="">Not in Finny</option>{finny.accounts.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
            </div>))}
          {more(accounts, all.accounts) > 0 && <button className="fy-row fy-linkish" style={{ width: "100%" }} onClick={() => setAll({ ...all, accounts: true })}><div className="main"><div className="s" style={{ color: "var(--primary-text)", fontWeight: 800 }}>{more(accounts, all.accounts)} more match</div></div></button>}
        </div>
        <div className="fy-section"><span>Categories · {monthName(month)} totals</span><span>{cats.filter((c) => !c.ok).length ? `${cats.filter((c) => !c.ok).length} differ` : "all match"}</span></div>
        {catList(cats, "books", "mt-categories")}
        {lg && <><div className="fy-section"><span>Transaction Log · {monthName(month)}</span><span>{logCats.filter((c) => !c.ok).length ? `${logCats.filter((c) => !c.ok).length} differ` : "all match"}</span></div>{catList(logCats, "log", "mt-log")}</>}
        <div className="fy-hint" style={{ marginTop: 10 }}>Saved on {monthName(month)}&apos;s review: how many match, never the workbook&apos;s rows. <Link href={`/review/${month}`} style={{ color: "var(--primary-text)", fontWeight: 800, textDecoration: "underline", textUnderlineOffset: 3 }}>Back to the review ›</Link></div>
      </>
    );
  }

  // ---- pick the workbook
  return (
    <>
      <Link className="fy-back" href={`/review/${month}`}><ChevronLeft size={20} />Review</Link>
      <div className="fy-large"><div><div className="sub">Month-end review · {monthLabel(month)}</div><h1>Check against your workbook</h1></div></div>
      <div className="fy-card fy-pad" style={{ marginBottom: 12 }}><div style={{ fontWeight: 800, marginBottom: 4 }}>Does Finny say what your workbook says?</div>
        <div className="fy-hint" style={{ margin: 0 }}>Choose your workbook. Finny compares each account&apos;s balance at the end of {monthName(month)} and each category&apos;s total, and shows the rows behind any difference.</div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-subhead"><span>Workbooks</span></div>
      <div className="fy-list" style={{ marginBottom: 10 }} data-testid="mt-files">
        <label className="fy-row" style={{ cursor: "pointer" }}><span className="fy-tile" data-color="mint" style={{ width: 32, height: 32, borderRadius: 10 }}><FileSpreadsheet size={18} /></span>
          <div className="main"><div className="t">{books?.name ?? "Pengeluaran workbook"}</div><div className="s">{books ? `Books · ${books.b.sheets.filter((s) => !s.template).length} accounts · read on this device` : "The books (required)"}</div></div>
          {books ? <Mark ok label="read" /> : <span style={{ color: "var(--primary-text)", fontWeight: 800 }}>Choose</span>}
          <input type="file" className="fy-sr" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Choose the Pengeluaran workbook" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0], "books")} /></label>
        <label className="fy-row" style={{ cursor: "pointer" }}><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><FileSpreadsheet size={18} /></span>
          <div className="main"><div className="t">{log?.name ?? "Personal Wealth Management workbook"}</div><div className="s">{log ? `Transaction Log · ${log.rows.filter((r) => r.on.slice(0, 7) === month).length} rows in ${monthName(month)}` : "Transaction Log · optional"}</div></div>
          {log ? <Mark ok label="read" /> : <span style={{ color: "var(--primary-text)", fontWeight: 800 }}>Choose</span>}
          <input type="file" className="fy-sr" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Choose the Wealth workbook" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0], "log")} /></label>
      </div>
      <div className="fy-note" style={{ marginBottom: 12, display: "flex", gap: 6, alignItems: "flex-start" }}><Lock size={14} style={{ flex: "none", marginTop: 2 }} /><span>The files stay on this device. Only the result (how many match) is saved.</span></div>
      {busy && <div className="fy-hint" role="status">{busy}</div>}
      <button className="fy-btn primary block" disabled={!books || !!busy} onClick={check}><Scale size={16} />Check {monthName(month)}</button>
    </>
  );
}
