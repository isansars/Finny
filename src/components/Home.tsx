"use client";
// Home = the month at a glance (FINNY-12/43): the balance card, spending by category (donut), by day (tap a day to filter
// the list), top places and biggest spends, then the month's transactions grouped by day, Apple-style.
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { api, useFinny, type Txn } from "./store";
import { Money, CategoryOptions } from "./ui";
import { CatTile, Tile } from "./icons";
import { QuickAddForm } from "./QuickAdd";
import { formatRupiah } from "@/lib/money";
import { dayLabel, monthLabel, shiftMonth, todayIn } from "@/lib/dates";

type Dash = { month: string; days: number; totals: { incomeSen: number; spendSen: number; savedSen: number; investedSen: number };
  byCategory: { categoryId: string; sen: number }[]; byDay: number[]; topSpends: { id: string; on: string; sen: number; description: string; categoryId: string | null }[]; topPlaces: { name: string; sen: number }[] };
const CHART = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

function Donut({ parts }: { parts: { sen: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.sen, 0) || 1, C = 2 * Math.PI * 42, gap = parts.length > 1 ? 2.5 : 0;
  const lens = parts.map((p) => (C * p.sen) / total);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Spending by category">
      <circle r="42" cx="60" cy="60" fill="none" stroke="var(--surface-3)" strokeWidth="16" />
      {parts.map((p, i) => <circle key={i} r="42" cx="60" cy="60" fill="none" stroke={p.color} strokeWidth="16" strokeDasharray={`${Math.max(lens[i] - gap, 0.1)} ${C}`} strokeDashoffset={-starts[i]} transform="rotate(-90 60 60)" />)}
    </svg>
  );
}

export function Home() {
  const { accounts, categories, version, loaded, openAdd } = useFinny();
  const today = todayIn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [accountF, setAccountF] = useState("");
  const [categoryF, setCategoryF] = useState("");
  const [day, setDay] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [list, setList] = useState<{ items: Txn[]; more: boolean } | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const p = new URLSearchParams({ month }); if (accountF) p.set("account", accountF); if (categoryF) p.set("category", categoryF); if (q.trim()) p.set("q", q.trim());
    const t = setTimeout(() => {
      api<{ items: Txn[]; more: boolean }>(`transactions?${p}`).then((r) => { setList(r); setErr(""); }).catch((e) => setErr(e.message));
      api<Dash>(`dashboard?month=${month}${accountF ? `&account=${accountF}` : ""}`).then(setDash).catch(() => {});
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [month, accountF, categoryF, q, version]);

  const acc = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const cat = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const net = accounts.filter((a) => !a.archived).reduce((s, a) => s + a.balanceSen, 0);
  const items = (list?.items ?? []).filter((t) => !day || t.on === day);
  const days = useMemo(() => { const m = new Map<string, Txn[]>(); for (const t of items) { const d = m.get(t.on) ?? []; d.push(t); m.set(t.on, d); } return [...m.entries()]; }, [items]);
  const slices = (dash?.byCategory ?? []).slice(0, 5).map((s, i) => ({ ...s, color: CHART[i], name: cat.get(s.categoryId)?.name ?? "Uncategorised" }));
  const other = (dash?.byCategory ?? []).slice(5).reduce((s, x) => s + x.sen, 0);
  if (other) slices.push({ categoryId: "other", sen: other, color: "var(--border-strong)", name: "Other" });
  const spent = dash?.totals.spendSen ?? 0, maxDay = Math.max(1, ...(dash?.byDay ?? [0]));
  const pick = (d: number) => { const s = `${month}-${String(d).padStart(2, "0")}`; setDay(day === s ? null : s); };

  return (
    <div className="fy-home">
      <section>
        <div className="fy-large">
          <div><div className="sub">Overview</div><h1 data-testid="month">{monthLabel(month)}</h1></div>
          <div className="fy-month" aria-label="Month">
            <button aria-label="Previous month" onClick={() => { setMonth(shiftMonth(month, -1)); setDay(null); }}><ChevronLeft size={18} /></button>
            <button aria-label="Next month" onClick={() => { setMonth(shiftMonth(month, 1)); setDay(null); }}><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="fy-hero">
          <div className="lbl">Net across accounts</div>
          <div className="big" data-testid="net">{formatRupiah(net)}</div>
          <div className="stats">
            <div className="fy-stat"><small>Income</small><b className="fy-amt income" data-testid="income">{formatRupiah(dash?.totals.incomeSen ?? 0)}</b></div>
            <div className="fy-stat"><small>Spent</small><b data-testid="spent">{formatRupiah(spent)}</b></div>
            {(dash?.totals.savedSen ?? 0) > 0 && <div className="fy-stat"><small>Saved</small><b data-testid="saved">{formatRupiah(dash!.totals.savedSen)}</b></div>}
            {(dash?.totals.investedSen ?? 0) > 0 && <div className="fy-stat"><small>Invested</small><b data-testid="invested">{formatRupiah(dash!.totals.investedSen)}</b></div>}
          </div>
        </div>

        {loaded && !accounts.length && (
          <div className="fy-card fy-empty" style={{ marginTop: 14 }}><Tile icon="landmark" color="sky" size={52} /><b>Welcome to Finny</b>Start with your accounts: cash, banks, e-wallets and cards.<div style={{ marginTop: 14 }}><a className="fy-btn primary" href="/accounts?add=1">Add an account</a></div></div>
        )}

        {spent > 0 && (<div className="fy-grid2" style={{ marginTop: 12 }}>
          <div className="fy-card fy-pad" data-testid="by-category">
            <div className="fy-section" style={{ margin: "0 0 10px" }}><span>Spending by category</span></div>
            <div className="fy-donut"><Donut parts={slices} />
              <div className="fy-legend">{slices.map((s) => <div className="r" key={s.categoryId}><i style={{ background: s.color }} /><span>{s.name}</span><b>{Math.round((s.sen / spent) * 100)}%</b></div>)}</div>
            </div>
          </div>
          <div className="fy-card fy-pad" data-testid="by-day">
            <div className="fy-section" style={{ margin: "0 0 10px" }}><span>Spending by day</span><span>{day ? <button className="fy-more" style={{ padding: 0 }} onClick={() => setDay(null)}>Show all days</button> : "Tap a day"}</span></div>
            <div className="fy-bars">{(dash?.byDay ?? []).map((v, i) => { const d = `${month}-${String(i + 1).padStart(2, "0")}`; return <button key={i} className={day === d ? "on" : ""} aria-label={`${i + 1} ${monthLabel(month)}: ${formatRupiah(v)}`} onClick={() => pick(i + 1)}><i style={{ height: `${Math.max(4, (v / maxDay) * 100)}%` }} /></button>; })}</div>
            <div className="fy-bars-axis"><span>1</span><span>{Math.ceil((dash?.days ?? 30) / 2)}</span><span>{dash?.days ?? 30}</span></div>
          </div>
          {(dash?.topPlaces.length ?? 0) > 0 && <div><div className="fy-section"><span>Top places</span></div><div className="fy-list" data-testid="top-places">
            {dash!.topPlaces.slice(0, 5).map((p, i) => <div className="fy-row plain" key={p.name}><span className="fy-pill" style={{ minWidth: 26, justifyContent: "center" }}>{i + 1}</span><div className="main"><div className="t">{p.name}</div></div><Money sen={p.sen} kind="spend" /></div>)}
          </div></div>}
          {(dash?.topSpends.length ?? 0) > 0 && <div><div className="fy-section"><span>Biggest spends</span></div><div className="fy-list" data-testid="top-spends">
            {dash!.topSpends.slice(0, 5).map((t) => { const c = t.categoryId ? cat.get(t.categoryId) : undefined; return <div className="fy-row" key={t.id}>{c ? <CatTile c={c} /> : <Tile icon="receipt" color="slate" />}<div className="main"><div className="t">{t.description || c?.name}</div><div className="s">{dayLabel(t.on, today)}</div></div><Money sen={t.sen} kind="spend" /></div>; })}
          </div></div>}
        </div>)}

        <div className="fy-section" style={{ marginTop: 26 }}><span>{day ? `Transactions · ${dayLabel(day, today)}` : "Transactions"}</span>{day && <button onClick={() => setDay(null)} aria-label="Clear the day"><X size={14} style={{ verticalAlign: -2 }} /> all days</button>}</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr", marginBottom: 10 }}>
          <label className="fy-search"><Search size={16} /><input className="fy-input" type="search" placeholder="Search" aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
            <select className="fy-input" style={{ minHeight: 40, fontSize: 14 }} aria-label="Filter by account" value={accountF} onChange={(e) => setAccountF(e.target.value)}>
              <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? " (closed)" : ""}</option>)}
            </select>
            <select className="fy-input" style={{ minHeight: 40, fontSize: 14 }} aria-label="Filter by category" value={categoryF} onChange={(e) => setCategoryF(e.target.value)}>
              <option value="">All categories</option><CategoryOptions cats={categories} kinds={["expense", "income", "saving", "investment"]} includeOff />
            </select>
          </div>
        </div>
        {err && <div className="fy-err">{err}</div>}
        {loaded && list && !items.length && accounts.length > 0 && (
          <div className="fy-card fy-empty"><Tile icon="receipt" color="pink" size={52} /><b>Nothing here yet</b>{q || accountF || categoryF || day ? "No transactions match." : `No transactions in ${monthLabel(month)}.`}
            {!q && !accountF && !categoryF && !day && <div style={{ marginTop: 14 }}><button className="fy-btn primary" onClick={() => openAdd()}>Add a transaction</button></div>}</div>
        )}
        <div data-testid="txn-list">
          {days.map(([d, rows]) => {
            const out = rows.reduce((s, t) => s + (t.kind === "spend" ? -t.amountSen : t.kind === "income" ? t.amountSen : 0), 0);
            return (
              <div key={d}>
                <div className="fy-section"><span>{dayLabel(d, today)}</span><span className="num">{out ? formatRupiah(out, { sign: "always" }) : ""}</span></div>
                <div className="fy-list">
                  {rows.map((t) => {
                    const c = t.categoryId ? cat.get(t.categoryId) : undefined;
                    const sub = t.kind === "transfer" ? `${acc.get(t.accountId)?.name ?? "?"} → ${t.toAccountId ? acc.get(t.toAccountId)?.name ?? "?" : "?"}` : `${c?.name ?? "—"} · ${acc.get(t.accountId)?.name ?? "?"}`;
                    return (
                      <button key={t.id} className="fy-row" aria-label={`Edit ${t.description || sub}`} onClick={() => openAdd(t)}>
                        {t.kind === "transfer" ? <span className="fy-tile" data-color="slate" style={{ width: 32, height: 32, borderRadius: 10 }}><ArrowLeftRight size={17} /></span> : c ? <CatTile c={c} /> : <Tile icon="receipt" color="slate" />}
                        <div className="main"><div className="t">{t.description || (t.kind === "transfer" ? "Transfer" : c?.name ?? "")}</div><div className="s">{sub}{t.entity ? ` · ${t.entity}` : ""}</div></div>
                        <Money sen={t.amountSen} kind={t.kind} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {list?.more && <p className="fy-hint" style={{ textAlign: "center" }}>Showing the latest 200: narrow the filters to see more.</p>}
        </div>
      </section>
      <aside className="side fy-side-only"><div className="fy-card fy-pad"><div className="fy-section" style={{ margin: "0 0 10px" }}><span>New transaction</span></div><QuickAddForm inline /></div></aside>
    </div>
  );
}
