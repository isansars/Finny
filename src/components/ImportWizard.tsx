"use client";
// Import a workbook (FINNY-49/50), as approved in "Sprint 3 · Design notes (import)": choose → accounts → categories →
// check → import. The workbook is read on this device (read-excel-file); only the confirmed plan is sent, 500 rows a time.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ChevronRight, CircleAlert, FileSpreadsheet, LoaderCircle, Undo2, Upload } from "lucide-react";
import { api, useFinny } from "./store";
import { Tile } from "./icons";
import { TYPE_LABEL, TYPE_LOOK } from "./ui";
import { formatRupiah } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { buildPlan, defaultChoices, logOnly, readBooks, readLog, type AccountType, type Books, type Choices, type LogRow, type Plan, type Sheet } from "@/lib/import-rule";

type Batch = { id: string; source: string; createdAt: string; finishedAt: string | null; txns: number; skipped: number; accounts: number; categories: number };
type Step = "choose" | "reading" | "accounts" | "categories" | "check" | "log" | "importing" | "done";
const monthYear = (d: string | null) => (d ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z")) : "");

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="fy-switch"><i /></button>;
}

export function ImportWizard() {
  const { accounts, categories, reload } = useFinny();
  const [step, setStep] = useState<Step>("choose");
  const [file, setFile] = useState("");
  const [err, setErr] = useState("");
  const [books, setBooks] = useState<Books | null>(null);
  const [choices, setChoices] = useState<Choices | null>(null);
  const [log, setLog] = useState<LogRow[] | null>(null);
  const [logPick, setLogPick] = useState<Record<string, boolean>>({});
  const [batches, setBatches] = useState<Batch[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ added: number; skipped: number; batchId: string; month: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const loadBatches = () => api<(Batch & { kind?: string })[]>("imports").then((b) => setBatches(b.filter((x) => x.kind !== "statement"))).catch(() => {});
  useEffect(() => { loadBatches(); }, []);
  const plan: Plan | null = useMemo(() => (books && choices ? buildPlan(books, choices) : null), [books, choices]);

  async function choose(f: File) {
    setErr(""); setFile(f.name); setStep("reading");
    try {
      const { default: readXlsxFile } = await import("read-excel-file/browser");
      // A file that can't be read in 2 minutes says so instead of spinning forever.
      const sheets = (await Promise.race([readXlsxFile(f), new Promise((_, no) => setTimeout(() => no(new Error("reading took too long; try again, or on a computer")), 120000))])) as unknown as Sheet[];
      const b = readBooks(sheets);
      if (b) { setBooks(b); setChoices(defaultChoices(b)); setStep("accounts"); return; }
      const l = readLog(sheets);
      if (l) {
        const days = l.map((r) => r.on).sort();
        const have = await api<{ on: string; sen: number }[]>(`imports/keys?from=${days[0]}&to=${days[days.length - 1]}`);
        const only = logOnly(l, null, have);
        setLog(only); setLogPick({}); setStep("log"); return; // defaults are decided when shown (the accounts may still be loading)
      }
      setErr("This doesn't look like either workbook: no account sheets (Tanggal, Keterangan, …) and no Transaction Log."); setStep("choose");
    } catch (e) { setErr(`Couldn't read the file: ${(e as Error).message}`); setStep("choose"); }
  }

  async function runImport(p: { accounts: Plan["accounts"]; categories: Plan["categories"]; txns: Plan["txns"]; archive: string[] }) {
    setStep("importing"); setErr(""); setProgress({ done: 0, total: p.txns.length });
    try {
      const start = await api<{ batchId: string; accounts: Record<string, string>; categories: Record<string, string> }>("imports", { method: "POST", json: { source: file, accounts: p.accounts, categories: p.categories } });
      let added = 0, skipped = 0;
      const rows = p.txns.map((t) => ({ on: t.on, kind: t.kind, sen: t.sen, accountId: start.accounts[t.account], toAccountId: t.toAccount ? start.accounts[t.toAccount] : null, categoryId: t.category ? start.categories[t.category] : null, description: t.description, entity: t.entity }));
      for (let i = 0; i < rows.length; i += 500) {
        const r = await api<{ added: number; skipped: number }>(`imports/${start.batchId}/rows`, { method: "POST", json: { rows: rows.slice(i, i + 500) } });
        added += r.added; skipped += r.skipped; setProgress({ done: Math.min(i + 500, rows.length), total: rows.length });
      }
      await api(`imports/${start.batchId}/finish`, { method: "POST", json: { archive: p.archive.map((k) => start.accounts[k]).filter(Boolean) } });
      const last = p.txns.reduce((m, t) => (t.on > m ? t.on : m), "");
      setResult({ added, skipped, batchId: start.batchId, month: last.slice(0, 7) }); setStep("done"); await reload(); loadBatches();
    } catch (e) { setErr((e as Error).message); setStep(books ? "check" : "log"); }
  }
  async function undo(b: Batch) {
    if (!confirm(`Undo the import of "${b.source}"? This removes its ${b.txns} transactions.`)) return;
    try { const r = await api<{ removed: number }>(`imports/${b.id}`, { method: "DELETE" }); await reload(); loadBatches(); setErr(""); alert(`Removed ${r.removed} transactions.`); }
    catch (e) { setErr((e as Error).message); }
  }

  const head = (sub: string, title: string) => <div className="fy-large"><div><div className="sub">{sub}</div><h1>{title}</h1></div></div>;
  const errBox = err && <div className="fy-err" role="alert">{err}</div>;

  if (step === "choose" || step === "reading") return (
    <>
      {head("Settings", "Import")}{errBox}
      <div className="fy-card fy-pad" style={{ textAlign: "center" }}>
        <Tile icon="receipt" color="mint" size={56} />
        <div style={{ fontWeight: 800, fontSize: 18, margin: "12px 0 4px" }}>Bring in your workbooks</div>
        <div className="fy-hint" style={{ fontSize: 14, marginBottom: 16 }}>Pick an .xlsx file. Finny reads it on this device; the file itself is never uploaded.</div>
        <label className="fy-btn primary block" style={{ position: "relative" }} aria-busy={step === "reading"}>
          {step === "reading" ? <><LoaderCircle size={18} className="fy-spin" /> Reading {file}…</> : <><Upload size={18} /> Choose a workbook</>}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label="Choose a workbook" disabled={step === "reading"}
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />
        </label>
      </div>
      <div className="fy-section"><span>Works with</span></div>
      <div className="fy-list">
        <div className="fy-row"><span className="fy-tile" data-color="sky" style={{ width: 32, height: 32, borderRadius: 10 }}><FileSpreadsheet size={18} /></span><div className="main"><div className="t">Catatan Keuangan Pribadi</div><div className="s">Your daily books: every account sheet</div></div></div>
        <div className="fy-row"><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><FileSpreadsheet size={18} /></span><div className="main"><div className="t">Personal Wealth Management</div><div className="s">Only Transaction Log rows not already in Finny</div></div></div>
      </div>
      <div className="fy-section"><span>Earlier imports</span></div>
      <div className="fy-list" data-testid="imports">
        {!batches.length && <div className="fy-row plain"><div className="main"><div className="t">None yet</div><div className="s">Each import can be undone in one tap</div></div></div>}
        {batches.map((b) => (
          <div className="fy-row plain" key={b.id}><div className="main"><div className="t">{b.source}</div><div className="s">{shortDate(b.createdAt.slice(0, 10))} · {b.txns} transactions{b.skipped ? ` · ${b.skipped} skipped` : ""}{b.finishedAt ? "" : " · unfinished"}</div></div>
            <button className="fy-btn small" onClick={() => undo(b)} aria-label={`Undo ${b.source}`}><Undo2 size={15} />Undo</button></div>
        ))}
      </div>
    </>
  );

  if (step === "accounts" && books && choices) {
    const off = books.sheets.filter((s) => s.template).length;
    return (
      <>
        {head(`Step 1 of 3 · ${file}`, "Accounts")}
        <div className="fy-note" style={{ marginBottom: 10 }}>{books.sheets.length} account sheets found.{off ? ` ${off} look like the template's examples, so they're off.` : ""} Switch any sheet on or off, or change its type. A sheet whose name you already use joins that account.</div>
        <div className="fy-list" data-testid="sheets">
          {books.sheets.map((s) => {
            const t = choices.types[s.sheet] ?? s.type, look = TYPE_LOOK[t], on = !!choices.include[s.sheet];
            const joins = accounts.some((a) => a.name.toLowerCase() === s.name.toLowerCase());
            return (
              <div className="fy-row" key={s.sheet} style={{ opacity: on ? 1 : 0.55 }} data-testid={`sheet-${s.sheet}`}>
                <Tile icon={look.icon} color={look.color} />
                <div className="main"><div className="t">{s.name}{s.closed ? " (closed)" : ""}</div>
                  <div className="s">{s.template ? <b style={{ color: "var(--rose-i)" }}>Template example · </b> : joins ? <b style={{ color: "var(--mint-i)" }}>Joins your {s.name} · </b> : null}{s.rows.length} rows · {monthYear(s.firstOn)} – {monthYear(s.lastOn)}</div>
                  <select className="fy-input" aria-label={`Type of ${s.name}`} value={t} style={{ minHeight: 32, padding: "2px 8px", fontSize: 13, marginTop: 6, maxWidth: 170 }}
                    onChange={(e) => setChoices({ ...choices, types: { ...choices.types, [s.sheet]: e.target.value as AccountType } })}>
                    {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <Switch on={on} label={`Import ${s.name}`} onChange={(v) => setChoices({ ...choices, include: { ...choices.include, [s.sheet]: v } })} />
              </div>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginTop: 14 }}>
          <button className="fy-btn" onClick={() => { setBooks(null); setStep("choose"); }}>Back</button>
          <button className="fy-btn primary" disabled={!Object.values(choices.include).some(Boolean)} onClick={() => setStep("categories")}>Next: categories</button>
        </div>
      </>
    );
  }

  if (step === "categories" && plan) {
    const uses = new Map<string, number>(); for (const t of plan.txns) if (t.category) uses.set(t.category, (uses.get(t.category) ?? 0) + 1);
    const leafName = (k: string) => k.split("|")[1].split(" › ").pop()!;
    const matched = (c: Plan["categories"][number]) => categories.some((x) => x.kind === c.kind && x.name.toLowerCase() === leafName(c.key).toLowerCase());
    const nMatched = plan.categories.filter(matched).length;
    const top = [...plan.categories].sort((a, b) => (uses.get(b.key) ?? 0) - (uses.get(a.key) ?? 0));
    return (
      <>
        {head("Step 2 of 3", "Categories")}
        <div className="fy-hero" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <div className="fy-stat"><small>Matched</small><b data-testid="cats-matched">{nMatched}</b></div>
          <div className="fy-stat"><small>New</small><b data-testid="cats-new">{plan.categories.length - nMatched}</b></div>
          <div className="fy-stat"><small>In use</small><b>{plan.categories.length}</b></div>
        </div>
        <div className="fy-section"><span>Most used</span><span>{plan.categories.length} in all</span></div>
        <div className="fy-list" data-testid="plan-categories">
          {top.slice(0, 12).map((c) => (
            <div className="fy-row" key={c.key}><Tile icon={c.kind === "income" ? "wallet" : "receipt"} color={c.kind === "income" ? "mint" : "pink"} />
              <div className="main"><div className="t">{leafName(c.key)}</div><div className="s">{c.kind === "income" ? "Income" : "Expense"} · {c.path.slice(0, -1).join(" › ") || "top level"} · {uses.get(c.key) ?? 0} transactions</div></div>
              <span className="fy-pill" style={matched(c) ? { background: "var(--mint-s)", color: "var(--mint-i)" } : undefined}>{matched(c) ? "matched" : "new"}</span></div>
          ))}
        </div>
        <div className="fy-note" style={{ marginTop: 10 }}>Your chart of accounts becomes the category tree, up to 3 levels. Names you already have are matched, not duplicated. Refunds on a spending category come in as income under &quot;Pengembalian Dana&quot;.</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8, marginTop: 14 }}>
          <button className="fy-btn" onClick={() => setStep("accounts")}>Back</button>
          <button className="fy-btn primary" onClick={() => setStep("check")}>Next: check and import</button>
        </div>
      </>
    );
  }

  if (step === "check" && plan && books && choices) {
    const byRef = new Map(plan.txns.map((t) => [t.ref, t]));
    const name = (k: string) => plan.accounts.find((a) => a.key === k)?.name ?? k;
    const archive = plan.accounts.filter((a) => a.archived).map((a) => a.key);
    return (
      <>
        {head("Step 3 of 3", "Check")}{errBox}
        <div className="fy-hero">
          <div className="lbl">Ready to import</div><div className="big" style={{ marginBottom: 10 }} data-testid="to-import">{plan.txns.length.toLocaleString("id-ID")} transactions</div>
          <div className="stats"><div className="fy-stat"><small>Transfers</small><b>{plan.stats.transfers}</b></div><div className="fy-stat"><small>Accounts</small><b>{plan.accounts.length}</b></div></div>
        </div>
        <div className="fy-section"><span>Balances vs the workbook</span><span>{plan.checks.filter((c) => c.adjustedSen === 0 && c.ok).length} of {plan.checks.length} match as they are</span></div>
        <div className="fy-list" data-testid="checks">
          {plan.checks.map((c) => {
            const exact = c.adjustedSen === 0 && c.ok, aligned = c.adjustedSen !== 0, align = choices.align?.[c.account] ?? true;
            return (
              <div key={c.account}>
                <div className="fy-row" data-testid={`check-${c.account}`}>
                  <span className="fy-tile" data-color={exact ? "mint" : aligned ? "lemon" : "rose"} style={{ width: 32, height: 32, borderRadius: 10 }}>{exact ? <Check size={18} /> : <CircleAlert size={18} />}</span>
                  <div className="main"><div className="t">{name(c.account)}</div>
                    <div className="s">{exact ? `Matches: ${formatRupiah(c.workbookSen)}` : aligned ? `Matched by moving the opening balance ${formatRupiah(c.adjustedSen, { sign: "always" })}` : `Workbook ${formatRupiah(c.workbookSen)} · Finny ${formatRupiah(c.finnySen)}`}</div>
                    {!exact && <div className="s">{c.explained ? `${c.oneSided} transfer${c.oneSided === 1 ? "" : "s"} recorded only in another sheet` : "Not fully explained by one-sided transfers"}</div>}
                  </div>
                  {!exact && <Switch on={align} label={`Match ${name(c.account)} to the workbook`} onChange={(v) => setChoices({ ...choices, align: { ...(choices.align ?? {}), [c.account]: v } })} />}
                  {c.refs.length > 0 && <button className="fy-more" style={{ padding: 6 }} aria-label={`Show the rows for ${name(c.account)}`} onClick={() => setOpen(open === c.account ? null : c.account)}>{open === c.account ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>}
                </div>
                {open === c.account && <div style={{ background: "var(--surface-2)", padding: "4px 16px 8px 60px" }}>
                  {c.refs.map((r) => { const t = byRef.get(r)!; return <div key={r} className="fy-hint" style={{ margin: "4px 0" }}>{shortDate(t.on)} · {t.description || "Transfer"} · {name(t.account)} → {name(t.toAccount!)} · {formatRupiah(t.sen)}</div>; })}
                </div>}
              </div>
            );
          })}
        </div>
        <p className="fy-hint" style={{ margin: "8px 4px 0" }}>A gap appears when a transfer was written in one account&apos;s sheet but not the other&apos;s. With the switch on, the opening balance absorbs it so today&apos;s balance equals your sheet; no spending or income is invented.</p>
        {plan.unplaced.length > 0 && (<>
          <div className="fy-section"><span>Can&apos;t place ({plan.unplaced.length})</span><span>left out</span></div>
          <div className="fy-list" data-testid="unplaced">{plan.unplaced.slice(0, 30).map((u) => <div className="fy-row plain" key={u.ref}><div className="main"><div className="t">{u.description || "(no description)"}</div><div className="s">{u.sheet} · {shortDate(u.on)} · {u.reason}</div></div><span className="fy-amt">{formatRupiah(u.sen)}</span></div>)}</div>
        </>)}
        <button className="fy-btn primary block" style={{ marginTop: 16 }} onClick={() => runImport({ accounts: plan.accounts, categories: plan.categories, txns: plan.txns, archive })}>Import {plan.txns.length.toLocaleString("id-ID")} transactions</button>
        <button className="fy-btn block" style={{ marginTop: 8 }} onClick={() => setStep("categories")}>Back</button>
        <div className="fy-hint" style={{ textAlign: "center", marginTop: 8 }}><Undo2 size={12} style={{ verticalAlign: -1 }} /> You can undo this import in one tap</div>
      </>
    );
  }

  if (step === "log" && log) {
    const accFor = (n: string) => accounts.find((a) => a.name.toLowerCase() === n.toLowerCase());
    const okFor = (r: LogRow) => !!accFor(r.account) && (r.type === "Expense" || r.type === "Income");
    const picked = (r: LogRow) => okFor(r) && (logPick[r.ref] ?? true);
    const pick = log.filter(picked);
    const go = () => {
      const cats = new Map<string, { key: string; kind: "income" | "expense"; path: string[] }>();
      const txns = pick.map((r) => {
        const kind = r.type === "Income" ? "income" : "expense", key = `${kind}|${r.category || "Lainnya"}`;
        cats.set(key, { key, kind, path: [r.category || "Lainnya"] });
        return { ref: r.ref, on: r.on, kind: kind === "income" ? "income" as const : "spend" as const, sen: r.sen, account: r.account, category: key, description: r.description, entity: null };
      });
      const accs = [...new Set(pick.map((r) => r.account))].map((n) => ({ key: n, name: accFor(n)!.name, type: accFor(n)!.type as AccountType, openingSen: 0, openingOn: "2000-01-01", limitSen: null, archived: false, fromSheet: null }));
      runImport({ accounts: accs, categories: [...cats.values()], txns, archive: [] });
    };
    return (
      <>
        {head(file, "Not in Finny yet")}{errBox}
        <div className="fy-note" style={{ marginBottom: 10 }}>{log.length ? `${log.length} rows of the Transaction Log aren't in Finny yet. Pick the ones to add; a row needs an account you already have.` : "Everything in this Transaction Log is already in Finny."}</div>
        {log.length > 0 && <div className="fy-list" data-testid="log-rows">
          {log.map((r) => { const ok = okFor(r); return (
            <div className="fy-row" key={r.ref} style={{ opacity: ok ? 1 : 0.55 }}>
              <div className="main"><div className="t">{r.description || r.category}</div><div className="s">{shortDate(r.on)} · {r.type} · {r.category} · {r.account}{ok ? "" : r.type === "Expense" || r.type === "Income" ? " · no such account in Finny" : " · not a spend or income"}</div></div>
              <span className="fy-amt">{formatRupiah(r.sen)}</span>
              <Switch on={picked(r)} label={`Add ${r.description || r.category}`} onChange={(v) => ok && setLogPick({ ...logPick, [r.ref]: v })} />
            </div>); })}
        </div>}
        <button className="fy-btn primary block" style={{ marginTop: 14 }} disabled={!pick.length} onClick={go}>Add {pick.length} transaction{pick.length === 1 ? "" : "s"}</button>
        <button className="fy-btn block" style={{ marginTop: 8 }} onClick={() => { setLog(null); setStep("choose"); }}>Back</button>
      </>
    );
  }

  if (step === "importing") return (
    <>{head(file, "Importing…")}
      <div className="fy-card fy-pad" role="status"><div style={{ fontWeight: 700, marginBottom: 8 }}>{progress.done.toLocaleString("id-ID")} of {progress.total.toLocaleString("id-ID")}</div>
        <div className="fy-usage" style={{ height: 10 }}><i style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 5}%` }} /></div></div></>
  );

  if (step === "done" && result) return (
    <>{head(file, "Done")}
      <div className="fy-card fy-pad" style={{ textAlign: "center" }} role="status">
        <Tile icon="shield-check" color="mint" size={56} />
        <div style={{ fontWeight: 800, fontSize: 18, margin: "12px 0 4px" }} data-testid="import-done">Imported {result.added.toLocaleString("id-ID")} transactions</div>
        <div className="fy-hint" style={{ fontSize: 14 }}>{result.skipped ? `${result.skipped} were already in Finny and were skipped. ` : ""}You can undo this import from Settings › Import.</div>
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}><Link className="fy-btn primary" href={result.month ? `/?month=${result.month}` : "/"}>{result.month ? "See your latest month" : "See your month"}</Link><button className="fy-btn" onClick={() => { setBooks(null); setLog(null); setResult(null); setStep("choose"); }}>Import another workbook</button></div>
      </div></>
  );
  return null;
}
