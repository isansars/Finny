"use client";
// Reports (FINNY-80/81), as approved in "Sprint 6 · Design notes (reports)": Cashflow, Balance sheet, Spending pace, and
// one account month by month. Each downloads as a CSV. Opened from Home's net-worth card and from Settings.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Scale, TrendingUp, Wallet, PiggyBank } from "lucide-react";
import { api, useFinny } from "./store";
import { Tile, CatTile } from "./icons";
import { TYPE_LOOK } from "./ui";
import { formatCompact, formatRupiah } from "@/lib/money";
import { monthLabel, shiftMonth, shortDate, todayIn } from "@/lib/dates";
import { MonthNav } from "./MonthPicker";
import type { TreeNode } from "@/lib/report-rule";

type View = "cashflow" | "balance" | "pace";
type Flow = { months: { month: string; inSen: number; outSen: number; keptSen: number }[]; totals: { inSen: number; outSen: number; keptSen: number };
  tree: { month: string; sections: { kind: string; sen: number; avg3Sen: number; nodes: TreeNode[] }[] } };
type AccRow = { id: string; name: string; type: string; sen: number; changeSen: number; inCredit?: boolean };
type Bal = { month: string; series: { month: string; netSen: number }[]; have: AccRow[]; owe: AccRow[]; haveSen: number; oweSen: number; netSen: number; changeSen: number; yearChangeSen: number | null };
type Pace = { month: string; days: number; daysGone: number; thisMonth: number[]; lastMonth: number[]; avg3: number[]; spentSen: number; projectedSen: number; lastMonthSen: number;
  biggest: { id: string; on: string; amountSen: number; description: string; categoryId: string | null }[] };

const short = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"));
const jt = (sen: number) => formatCompact(sen);
const plain = (sen: number) => formatRupiah(sen, { prefix: false });
const SECTION: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  income: { label: "Income", icon: <TrendingUp size={18} />, color: "mint" }, expense: { label: "Spending", icon: <Wallet size={18} />, color: "pink" },
  saving: { label: "Saving", icon: <PiggyBank size={18} />, color: "sky" }, investment: { label: "Investing", icon: <TrendingUp size={18} />, color: "lemon" },
};

function useJson<T>(path: string | null, version: number) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>(path).then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [path, version]);
  return { data, err };
}

function MonthSwitch({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  return <MonthNav month={month} setMonth={setMonth} />; // FINNY-206
}
const csvLink = (path: string, label = "Download this report (CSV)") => <a className="fy-btn block" style={{ marginTop: 12 }} href={`/api/${path}${path.includes("?") ? "&" : "?"}format=csv`} download><Download size={17} />{label}</a>;

export function Reports() {
  const params = useSearchParams();
  const [view, setView] = useState<View>((["cashflow", "balance", "pace"].includes(params.get("view") ?? "") ? params.get("view") : "cashflow") as View);
  const [month, setMonth] = useState(todayIn().slice(0, 7));
  const pick = (v: View) => { setView(v); history.replaceState(null, "", `/reports?view=${v}`); };
  const title = { cashflow: "Cashflow", balance: "Balance sheet", pace: "Spending pace" }[view];
  return (
    <>
      <Link className="fy-back" href="/"><ChevronLeft size={20} />Home</Link>
      <div className="fy-large"><div><div className="sub">Reports · {monthLabel(month)}</div><h1>{title}</h1></div><MonthSwitch month={month} setMonth={setMonth} /></div>
      <div className="fy-seg" role="tablist" aria-label="Report" style={{ marginBottom: 12 }}>
        {(["cashflow", "balance", "pace"] as View[]).map((v) => <button key={v} role="tab" aria-selected={view === v} className={view === v ? "on" : ""} onClick={() => pick(v)}>{{ cashflow: "Cashflow", balance: "Balance sheet", pace: "Spending pace" }[v]}</button>)}
      </div>
      {view === "cashflow" && <Cashflow month={month} />}
      {view === "balance" && <Balance month={month} />}
      {view === "pace" && <PaceView month={month} />}
    </>
  );
}

// ---------------------------------------------------------------- cashflow

function Bars({ months }: { months: Flow["months"] }) {
  const max = Math.max(1, ...months.flatMap((m) => [m.inSen, m.outSen]));
  const w = 340, h = 140, gap = (w - 12) / months.length, bw = Math.min(18, gap / 2 - 3);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 22}`} role="img" aria-label="Money in and out per month" style={{ display: "block" }}>
      {months.map((m, i) => {
        const x = 8 + i * gap + (gap - 2 * bw - 3) / 2, hi = (m.inSen / max) * h, ho = (m.outSen / max) * h;
        return <g key={m.month}>
          <rect x={x} y={h - hi} width={bw} height={Math.max(hi, 1)} rx={Math.min(5, bw / 3)} fill="#34d399"><title>{`${monthLabel(m.month)}: in ${formatRupiah(m.inSen)}`}</title></rect>
          <rect x={x + bw + 3} y={h - ho} width={bw} height={Math.max(ho, 1)} rx={Math.min(5, bw / 3)} fill="#f472b6"><title>{`${monthLabel(m.month)}: out ${formatRupiah(m.outSen)}`}</title></rect>
          {(months.length <= 6 || i % 2 === 0) && <text x={x + bw} y={h + 16} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-3)">{short(m.month)}</text>}
        </g>;
      })}
    </svg>
  );
}

function Cashflow({ month }: { month: string }) {
  const { version } = useFinny();
  const [span, setSpan] = useState<"6" | "12" | "year">("6");
  const q = span === "year" ? `year=${month.slice(0, 4)}&month=${month}` : `to=${month}&months=${span}&month=${month}`;
  const { data, err } = useJson<Flow>(`reports/cashflow?${q}`, version);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const hidden = useMemo(() => {
    const out = new Set<string>(); if (!data) return out;
    const parent = new Map(data.tree.sections.flatMap((s) => s.nodes).map((n) => [n.id, n.parentId]));
    for (const s of data.tree.sections) for (const n of s.nodes) { let p = n.parentId; while (p) { if (closed.has(p)) { out.add(n.id); break; } p = parent.get(p) ?? null; } }
    for (const s of data.tree.sections) if (closed.has(`section-${s.kind}`)) s.nodes.forEach((n) => out.add(n.id));
    return out;
  }, [data, closed]);
  const toggle = (id: string) => { const n = new Set(closed); if (n.has(id)) n.delete(id); else n.add(id); setClosed(n); };
  if (err) return <div className="fy-err" role="alert">{err}</div>;
  const kept = data ? data.tree.sections.reduce((n, s) => n + (s.kind === "income" ? s.sen : -s.sen), 0) : 0;
  const kept3 = data ? data.tree.sections.reduce((n, s) => n + (s.kind === "income" ? s.avg3Sen : -s.avg3Sen), 0) : 0;
  return (
    <div className="fy-report">
      <div className="fy-card fy-pad" data-testid="cashflow-chart">
        <div className="fy-section" style={{ margin: "0 0 8px" }}><span>{span === "year" ? month.slice(0, 4) : `Last ${span} months`}</span><span className="fy-key"><i style={{ background: "#34d399" }} />In <i style={{ background: "#f472b6" }} />Out</span></div>
        <div className="fy-seg" role="radiogroup" aria-label="Period" style={{ marginBottom: 8 }}>
          {([["6", "6 months"], ["12", "12 months"], ["year", `Year ${month.slice(0, 4)}`]] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={span === v} className={span === v ? "on" : ""} onClick={() => setSpan(v)}>{l}</button>)}
        </div>
        {data ? <Bars months={data.months} /> : <span className="fy-skel" style={{ display: "block", height: 150 }} />}
        <div className="fy-stats3">
          <div className="fy-stat"><small>In</small><b className="fy-amt income" data-testid="flow-in">{data ? jt(data.totals.inSen) : "…"}</b></div>
          <div className="fy-stat"><small>Out</small><b data-testid="flow-out">{data ? jt(data.totals.outSen) : "…"}</b></div>
          <div className="fy-stat"><small>Kept</small><b data-testid="flow-kept" style={{ color: data && data.totals.keptSen < 0 ? "var(--spend)" : undefined }}>{data ? jt(data.totals.keptSen) : "…"}</b></div>
        </div>
      </div>
      <div>
        <div className="fy-section"><span>{monthLabel(month)}</span><span>vs 3-mo avg</span></div>
        <div className="fy-list" data-testid="cashflow-tree">
          {data && !data.tree.sections.length && <div className="fy-row plain"><div className="main"><div className="t">Nothing in {monthLabel(month)}</div><div className="s">No income or spending recorded this month.</div></div></div>}
          {data?.tree.sections.map((s) => (
            <div key={s.kind}>
              <button className="fy-row fy-trow" onClick={() => toggle(`section-${s.kind}`)} aria-expanded={!closed.has(`section-${s.kind}`)} data-testid={`section-${s.kind}`}>
                {closed.has(`section-${s.kind}`) ? <ChevronRight size={16} className="car" /> : <ChevronDown size={16} className="car" />}
                <span className="fy-tile" data-color={SECTION[s.kind].color} style={{ width: 32, height: 32, borderRadius: 10 }}>{SECTION[s.kind].icon}</span><div className="main"><div className="t" style={{ fontWeight: 800 }}>{SECTION[s.kind].label}</div></div>
                <span className={`fy-amt ${s.kind === "income" ? "income" : ""}`}>{plain(s.sen)}</span><span className="avg">{jt(s.avg3Sen)}</span>
              </button>
              {s.nodes.filter((n) => !hidden.has(n.id)).map((n) => (
                <div className="fy-row fy-trow" key={n.id} style={{ paddingLeft: 16 + (n.depth + 1) * 16 }} data-testid={`node-${n.name}`}>
                  {n.hasChildren ? <button className="car" aria-label={`${closed.has(n.id) ? "Open" : "Fold"} ${n.name}`} aria-expanded={!closed.has(n.id)} onClick={() => toggle(n.id)}>{closed.has(n.id) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button> : <span className="car" />}
                  <div className="main"><a className="t" href={`/?month=${month}`} style={{ fontWeight: n.depth ? 600 : 700, color: "inherit", textDecoration: "none" }}>{n.name}</a></div>
                  <span className="fy-amt" style={{ fontWeight: n.depth ? 600 : 700 }}>{plain(n.sen)}</span><span className="avg">{n.avg3Sen ? jt(n.avg3Sen) : "–"}</span>
                </div>
              ))}
            </div>
          ))}
          {data && data.tree.sections.length > 0 && <div className="fy-row fy-trow" data-testid="kept-month"><span className="car" /><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><Scale size={18} /></span>
            <div className="main"><div className="t" style={{ fontWeight: 800 }}>Kept this month</div></div><span className={`fy-amt ${kept >= 0 ? "income" : ""}`} style={{ color: kept < 0 ? "var(--spend)" : undefined }}>{plain(kept)}</span><span className="avg">{jt(kept3)}</span></div>}
        </div>
        {csvLink(`reports/cashflow?${q}`)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- balance sheet

function Line({ series }: { series: { month: string; netSen: number }[] }) {
  if (series.length < 2) return null;
  const w = 340, h = 100, vals = series.map((s) => s.netSen), min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const xs = series.map((_, i) => 8 + (i * (w - 16)) / (series.length - 1)), ys = vals.map((v) => 8 + (h - 16) * (1 - (v - min) / span));
  const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="Net worth over 12 months" style={{ display: "block" }}>
      <defs><linearGradient id="nw" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#f472b6" stopOpacity=".35" /><stop offset="1" stopColor="#f472b6" stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${xs[xs.length - 1]},${h} L${xs[0]},${h} Z`} fill="url(#nw)" />
      <path d={d} fill="none" stroke="#ec4899" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r="5" fill="#ec4899" stroke="#fff" strokeWidth="2" />
      {series.map((s, i) => (i % 3 === 2 || i === 0 ? <text key={s.month} x={xs[i]} y={h + 14} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-3)">{short(s.month)}</text> : null))}
    </svg>
  );
}

function Balance({ month }: { month: string }) {
  const { version } = useFinny();
  const { data, err } = useJson<Bal>(`reports/balance?month=${month}`, version);
  if (err) return <div className="fy-err" role="alert">{err}</div>;
  const row = (a: AccRow) => {
    const look = TYPE_LOOK[a.type] ?? (a.type.startsWith("thing:") ? { icon: a.type === "thing:property" ? "home" : a.type === "thing:business" ? "briefcase" : "gem", color: "lemon" } : { icon: "wallet", color: "slate" });
    return (
      <a className="fy-row" key={a.id} href={a.type.startsWith("thing:") ? `/assets/things/${a.id}` : `/reports/account/${a.id}?to=${month}`} data-testid={`acc-${a.name}`}>
        <Tile icon={look.icon} color={look.color} />
        <div className="main"><div className="t">{a.name}</div><div className="s">{a.inCredit ? "in credit · " : ""}{a.changeSen ? `${a.changeSen > 0 ? "▲" : "▼"} ${formatRupiah(Math.abs(a.changeSen), { prefix: false })}` : "no change"}</div></div>
        <span className="fy-amt">{plain(a.sen)}</span><ChevronRight className="chev" size={18} />
      </a>
    );
  };
  return (
    <div className="fy-report">
      <div className="fy-hero" data-testid="net-worth">
        <div className="lbl">Net worth · end of {monthLabel(month).split(" ")[0]}</div>
        <div className="big" style={{ marginBottom: 4 }}>{data ? formatRupiah(data.netSen) : <span className="fy-skel" style={{ width: "7em" }} />}</div>
        {data && <div className="fy-hint" style={{ margin: "0 0 6px", fontWeight: 800, color: data.changeSen >= 0 ? "var(--income)" : "var(--spend)" }}>
          {data.changeSen >= 0 ? "▲" : "▼"} {formatRupiah(Math.abs(data.changeSen))} since {short(shiftMonth(month, -1))}{data.yearChangeSen !== null ? ` · ${data.yearChangeSen >= 0 ? "+" : "−"}${formatRupiah(Math.abs(data.yearChangeSen))} in a year` : ""}</div>}
        {data && <Line series={data.series} />}
      </div>
      <div>
        <div className="fy-section"><span>What you have</span><span className="num" data-testid="have">{data ? formatRupiah(data.haveSen) : ""}</span></div>
        <div className="fy-list">{data?.have.map(row)}{data && !data.have.length && <div className="fy-row plain"><div className="main"><div className="t">No accounts yet</div></div></div>}</div>
        {data && data.owe.length > 0 && <>
          <div className="fy-section"><span>What you owe</span><span className="num" data-testid="owe">{formatRupiah(data.oweSen)}</span></div>
          <div className="fy-list">{data.owe.map(row)}</div>
        </>}
        {csvLink(`reports/balance?month=${month}`)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- spending pace

function PaceChart({ p }: { p: Pace }) {
  const w = 340, h = 150, n = p.days;
  const max = Math.max(1, p.projectedSen, p.lastMonthSen, ...p.avg3, ...p.thisMonth);
  const x = (d: number) => 8 + (d * (w - 16)) / Math.max(1, n - 1), y = (v: number) => 6 + (h - 12) * (1 - v / max);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = p.thisMonth.length - 1;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="Running spending this month against last month and the 3-month average" style={{ display: "block" }}>
      <path d={path(p.avg3)} fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" />
      <path d={path(p.lastMonth.slice(0, n))} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {last >= 0 && <path d={path(p.thisMonth)} fill="none" stroke="#ec4899" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
      {last >= 0 && p.daysGone < n && <path d={`M${x(last)},${y(p.thisMonth[last])} L${x(n - 1)},${y(p.projectedSen)}`} stroke="#ec4899" strokeWidth="3" strokeDasharray="6 6" strokeLinecap="round" fill="none" />}
      {last >= 0 && <circle cx={x(last)} cy={y(p.thisMonth[last])} r="5" fill="#ec4899" stroke="#fff" strokeWidth="2" />}
      {[0, 9, 19, n - 1].map((d) => <text key={d} x={x(d)} y={h + 14} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-3)">{d + 1}</text>)}
    </svg>
  );
}

function PaceView({ month }: { month: string }) {
  const { version, categories } = useFinny();
  const { data: p, err } = useJson<Pace>(`reports/pace?month=${month}`, version);
  if (err) return <div className="fy-err" role="alert">{err}</div>;
  const isNow = p ? p.daysGone > 0 && p.daysGone < p.days : false;
  const diff = p ? p.projectedSen - p.lastMonthSen : 0;
  return (
    <div className="fy-report">
      <div className="fy-card fy-pad" data-testid="pace">
        <div className="fy-section" style={{ margin: "0 0 4px" }}><span>{monthLabel(month).split(" ")[0]} {isNow ? "so far" : ""}</span><span>{p ? `${p.daysGone} of ${p.days} days` : ""}</span></div>
        <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-.02em" }} data-testid="pace-spent">{p ? formatRupiah(p.spentSen) : <span className="fy-skel" />}</div>
        {p && <div className="fy-hint" style={{ margin: "2px 0 8px" }} data-testid="pace-projection">{isNow
          ? <>At this pace the month ends near <b style={{ color: "var(--text)" }}>{formatRupiah(p.projectedSen)}</b>, {formatRupiah(Math.abs(diff))} {diff <= 0 ? "under" : "over"} {short(shiftMonth(month, -1))}.</>
          : p.daysGone === 0 ? "This month hasn't started yet." : <>The month ended at {formatRupiah(p.spentSen)}, {formatRupiah(Math.abs(diff))} {diff <= 0 ? "under" : "over"} {short(shiftMonth(month, -1))}.</>}</div>}
        {p && <PaceChart p={p} />}
        <div className="fy-key" style={{ marginTop: 6 }}><i style={{ background: "#ec4899" }} />This month <i style={{ background: "#94a3b8" }} />{short(shiftMonth(month, -1))} <i style={{ background: "#a78bfa" }} />3-month average</div>
      </div>
      <div>
        <div className="fy-section"><span>Biggest spends</span></div>
        <div className="fy-list" data-testid="biggest">
          {p && !p.biggest.length && <div className="fy-row plain"><div className="main"><div className="t">No spending yet</div></div></div>}
          {p?.biggest.map((t) => { const c = categories.find((x) => x.id === t.categoryId); return (
            <div className="fy-row" key={t.id}>{c ? <CatTile c={c} /> : <Tile icon="receipt" color="slate" />}
              <div className="main"><div className="t">{t.description || c?.name}</div><div className="s">{shortDate(t.on)}{c ? ` · ${c.name}` : ""}</div></div>
              <span className="fy-amt">−{plain(t.amountSen)}</span></div>); })}
        </div>
        {csvLink(`reports/pace?month=${month}`)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one account

export function AccountReport({ id }: { id: string }) {
  const { version } = useFinny();
  const params = useSearchParams();
  const [to, setTo] = useState(params.get("to") && /^\d{4}-\d{2}$/.test(params.get("to")!) ? params.get("to")! : todayIn().slice(0, 7));
  const { data, err } = useJson<{ account: { id: string; name: string; type: string }; months: { month: string; inSen: number; outSen: number; netSen: number; endSen: number | null }[] }>(`reports/account/${id}?to=${to}&months=6`, version);
  const last = data?.months[data.months.length - 1];
  const owed = data && (data.account.type === "card" || data.account.type === "loan");
  const max = Math.max(1, ...(data?.months ?? []).flatMap((m) => [m.inSen, m.outSen]));
  return (
    <>
      <a className="fy-back" href={`/reports?view=balance`}><ChevronLeft size={20} />Balance sheet</a>
      <div className="fy-large"><div><div className="sub">Reports · one account</div><h1>{data?.account.name ?? "…"}</h1></div><MonthSwitch month={to} setMonth={setTo} /></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-hero" data-testid="account-hero">
        <div className="lbl">{owed ? "Owed" : "Balance"}, end of {monthLabel(to).split(" ")[0]}</div>
        <div className="big" style={{ marginBottom: 8 }}>{last ? formatRupiah(owed ? -(last.endSen ?? 0) : last.endSen ?? 0) : <span className="fy-skel" />}</div>
        {data && <svg width="100%" viewBox="0 0 340 108" role="img" aria-label="Money in and out per month" style={{ display: "block" }}>
          {data.months.map((m, i) => { const gap = 328 / data.months.length, x = 10 + i * gap + (gap - 38) / 2, hi = (m.inSen / max) * 88, ho = (m.outSen / max) * 88; return <g key={m.month}>
            <rect x={x} y={88 - hi} width="17" height={Math.max(hi, 1)} rx="4" fill="#34d399" /><rect x={x + 20} y={88 - ho} width="17" height={Math.max(ho, 1)} rx="4" fill="#f472b6" />
            <text x={x + 18} y="104" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-3)">{short(m.month)}</text></g>; })}
        </svg>}
      </div>
      <div className="fy-section"><span>Month by month</span><span>in · out · net</span></div>
      <div className="fy-list" data-testid="account-months">
        {data && [...data.months].reverse().map((m) => (
          <div className="fy-row plain" key={m.month} data-testid={`am-${m.month}`}><div className="main"><div className="t">{short(m.month)} {m.month.slice(0, 4)}</div></div>
            <div className="fy-3col"><span style={{ color: "var(--income)" }}>+{jt(m.inSen)}</span><span>−{jt(m.outSen)}</span><span style={{ color: m.netSen >= 0 ? "var(--income)" : "var(--spend)" }}>{m.netSen >= 0 ? "+" : "−"}{jt(Math.abs(m.netSen))}</span></div></div>
        ))}
      </div>
      {csvLink(`reports/account/${id}?to=${to}&months=6`)}
    </>
  );
}
