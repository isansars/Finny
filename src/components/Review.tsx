"use client";
// The month-end review (FINNY-112), as approved in "Sprint 10 · Design notes (month-end review, approved)": four steps,
// the budget step, closing the month, past reviews, and the nudge on Home.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, CircleAlert, FileText, Flag, Gem, PiggyBank, Scale, Shield, Target, CreditCard, TrendingUp } from "lucide-react";
import { api, useFinny } from "./store";
import { Bar } from "./Budget";
import { formatCompact, formatRupiah } from "@/lib/money";
import { monthLabel, shortDate } from "@/lib/dates";

type St = { statements: boolean; budget: boolean; wealth: boolean; closed: boolean; done: number; of: number };
type BLine = { categoryId: string; name: string; plannedSen: number; spentSen: number; pct: number; state: "ok" | "close" | "over"; overSen?: number; underSen?: number };
type Summary = { inSen: number; outSen: number; keptSen: number; keptPct: number | null; avgKeptPct: number | null; netSen: number; netChangeSen: number; usedPct: number | null; over: number; under: number; emergencyPct: number | null; emergencyPrevPct: number | null; debtsPaidSen: number; match?: Match | null; goals?: { name: string; pct: number; change: number }[] };
type Match = { accountsOk: number; accountsTotal: number; categoriesOk: number; categoriesTotal: number; withLog: boolean; checkedAt: string; matches: boolean };
type Rev = {
  month: string; next: string; today: string; closed: boolean; closedAt: string | null; note: string; steps: St; match: Match | null;
  statements: { accounts: { accountId: string; name: string; read: boolean; periodFrom: string | null; periodTo: string | null; lines: number }[]; read: number; total: number; done: boolean };
  budget: { over: BLine[]; under: BLine[]; plannedSen: number; spentSen: number; usedPct: number | null; inSen: number; outSen: number; keptSen: number; keptPct: number | null; nextPlanned: number; planNext: { categoryId: string; name: string; amountSen: number; raised: boolean }[] };
  wealth: { netSen: number; changeSen: number; holdings: number; valuesOn: string | null; valuesDays: number | null; emergency: { configured: boolean; pct: number; setAsideSen: number; targetSen: number; prevPct: number | null }; goals: { id: string; name: string; pct: number; change: number }[] };
  summary: Summary;
};
type Overview = { today: string; due: { month: string; steps: St; missingStatements: string[] } | null; warnings: { categoryId: string; name: string; pct: number; over: boolean; daysLeft: number; spentSen: number; plannedSen: number }[]; past: { month: string; closedAt: string; keptPct: number | null; netChangeSen: number | null; note: string }[] };

const plain = (sen: number) => formatRupiah(sen, { prefix: false });
const jt = (sen: number) => `${formatCompact(sen)}`;
const signed = (sen: number) => `${sen >= 0 ? "+" : "−"}Rp ${plain(Math.abs(sen))}`;
const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"));
/** "1–31 Oct", or "21 Sep – 20 Oct" across months. */
const span = (a: string | null, b: string | null) => {
  if (!a || !b) return "";
  const d = (x: string) => shortDate(x).replace(/ \d{4}$/, "");
  return a.slice(0, 7) === b.slice(0, 7) ? `${Number(a.slice(8))}–${d(b)}` : `${d(a)} – ${d(b)}`;
};

function Tile({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="fy-tile" data-color={color} style={{ width: 32, height: 32, borderRadius: 10 }}>{children}</span>;
}
function Tick({ on, label }: { on: boolean; label: string }) {
  return <span className={`fy-rv-tick ${on ? "on" : ""}`} role="img" aria-label={on ? `${label}: done` : `${label}: not done`}>{on && <Check size={14} strokeWidth={3} />}</span>;
}

function useReview(month: string) {
  const { version } = useFinny();
  const [data, setData] = useState<Rev | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { let live = true; api<Rev>(`reviews/${month}`).then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => { if (live) setErr(e.message); }); return () => { live = false; }; }, [month, version]);
  return { data, setData, err, setErr };
}

function Head({ r }: { r: Rev }) {
  return (
    <div className="fy-hero" style={{ padding: "14px 16px" }} data-testid="rv-head">
      <div className="lbl">{monthLabel(r.month)}</div>
      <div style={{ fontSize: 20, fontWeight: 800 }}>{r.closed ? "Closed" : `${r.steps.done} of ${r.steps.of} done`}</div>
      <div className="fy-bbar" role="progressbar" aria-label="Steps done" aria-valuenow={r.steps.done} aria-valuemin={0} aria-valuemax={4} style={{ margin: "6px 0 4px" }}><i style={{ width: `${(r.steps.done / 4) * 100}%`, background: "linear-gradient(90deg,var(--primary-2),var(--primary))" }} /></div>
      <div className="fy-hint" style={{ margin: 0, fontWeight: 700 }}>{r.closed && r.closedAt ? `Closed ${shortDate(r.closedAt.slice(0, 10))}.` : "About 10 minutes. Finny keeps your place."}</div>
    </div>
  );
}

function Step({ icon, color, title, sub, on, href, testid, children }: { icon: React.ReactNode; color: string; title: string; sub: string; on: boolean; href?: string; testid: string; children?: React.ReactNode }) {
  const top = <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Tile color={color}>{icon}</Tile><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800 }}>{title}</div><div className="fy-hint" style={{ margin: 0, fontWeight: 700 }}>{sub}</div></div><Tick on={on} label={title} />{href && <ChevronRight className="chev" size={18} />}</div>;
  return <div className="fy-card fy-rv-step" data-testid={testid}>{href ? <Link href={href} className="fy-linkish" style={{ display: "block", textDecoration: "none" }}>{top}</Link> : top}{children}</div>;
}

export function Review({ month }: { month: string }) {
  const { data: r, setData, err, setErr } = useReview(month);
  async function mark(json: Record<string, boolean>) { try { setData(await api<Rev>(`reviews/${month}`, { method: "PATCH", json })); } catch (e) { setErr((e as Error).message); } }
  return (
    <>
      <Link className="fy-back" href="/review"><ChevronLeft size={20} />Reviews</Link>
      <div className="fy-large"><div><div className="sub">Month-end review</div><h1>{monthLabel(month)}</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {!r && !err && <div className="fy-card fy-pad"><span className="fy-skel" style={{ width: "60%" }} /></div>}
      {r && <>
        <Head r={r} />
        <div style={{ height: 10 }} />
        <Step testid="rv-statements" icon={<FileText size={18} />} color="sky" title="Statements" on={r.steps.statements}
          sub={r.statements.total ? `${r.statements.read} of ${r.statements.total} account${r.statements.total === 1 ? "" : "s"} read` : "Nothing to check: no account is read by statement"}>
          {r.statements.accounts.map((a) => (
            <div className="fy-rv-line" key={a.accountId}>
              <span><b>{a.name}</b><small>{a.read ? `${span(a.periodFrom, a.periodTo)} · ${a.lines} line${a.lines === 1 ? "" : "s"}` : "Not read yet"}</small></span>
              {a.read ? <Check size={16} aria-label="read" /> : <Link href="/import/statements" style={{ color: "var(--primary-text)", fontWeight: 800 }}>Read it ›</Link>}
            </div>
          ))}
        </Step>
        <Step testid="rv-budget" icon={<Target size={18} />} color="pink" title="Budget" on={r.steps.budget} href={`/review/${month}/budget`}
          sub={r.budget.plannedSen ? `Spent ${jt(r.budget.spentSen)} of ${jt(r.budget.plannedSen)} · ${r.budget.over.length} over` : "No budget this month"} />
        <Step testid="rv-wealth" icon={<Gem size={18} />} color="lavender" title="Net worth and savings" on={r.steps.wealth}
          sub={r.wealth.holdings ? (r.wealth.valuesDays == null ? "Investments not valued yet" : `Values last updated ${r.wealth.valuesDays === 0 ? "today" : `${r.wealth.valuesDays} day${r.wealth.valuesDays === 1 ? "" : "s"} ago`}`) : "Net worth at the month end"}>
          <div className="fy-rv-line"><span><b>Net worth</b><small>at the end of {monthName(month)}</small></span><span className="num"><b>Rp {plain(r.wealth.netSen)}</b><small style={{ color: r.wealth.changeSen >= 0 ? "var(--income)" : "var(--spend)" }}>{signed(r.wealth.changeSen)}</small></span></div>
          {r.wealth.emergency.configured && <div className="fy-rv-line"><span><b>Emergency fund</b><small>{r.wealth.emergency.pct}% of target{r.wealth.emergency.prevPct != null ? ` · was ${r.wealth.emergency.prevPct}%` : ""}</small></span><Link href="/assets/emergency" style={{ color: "var(--primary-text)", fontWeight: 800 }}>Open ›</Link></div>}
          {r.wealth.goals.length > 0 && <div className="fy-rv-goals" data-testid="rv-goals"><b>Goals this month</b>{r.wealth.goals.map((g) => (
            <Link key={g.id} href={`/assets/goals/${g.id}`}><span>{g.name}</span><b style={{ color: g.change >= 0 ? "var(--income)" : "var(--spend)" }}>{g.pct}% · {g.change >= 0 ? "+" : "−"}{Math.abs(g.change)} pts</b></Link>))}</div>}
          {!r.closed && <div style={{ display: "grid", gridTemplateColumns: r.wealth.holdings ? "1fr 1fr" : "1fr", gap: 8, marginTop: 10 }}>
            {r.wealth.holdings > 0 && <Link className="fy-btn" href="/assets/investments"><TrendingUp size={16} />Update values</Link>}
            <button className="fy-btn" onClick={() => mark({ wealthDone: !r.steps.wealth })}>{r.steps.wealth ? "Not done" : <><Check size={16} />Done</>}</button>
          </div>}
        </Step>
        <MatchCard r={r} />
        <Step testid="rv-close" icon={<Flag size={18} />} color="mint" title="Close the month" on={r.steps.closed} href={`/review/${month}/close`}
          sub={r.closed ? "Closed: see the summary" : "A summary you can come back to"} />
      </>}
    </>
  );
}

/** The workbook match check's result on the review (counts only), or the way in. */
function MatchCard({ r }: { r: Rev }) {
  const m = r.match, ended = r.month < r.today.slice(0, 7);
  if (!m) return ended ? (
    <Link className="fy-card fy-rv-step" style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--text)", textDecoration: "none" }} href={`/review/${r.month}/match`} data-testid="rv-match">
      <Tile color="sky"><Scale size={18} /></Tile><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800 }}>Check against your workbook</div><div className="fy-hint" style={{ margin: 0, fontWeight: 700 }}>Does Finny say what the workbook says?</div></div><ChevronRight size={18} /></Link>
  ) : null;
  return (
    <div className="fy-card fy-rv-step" data-testid="rv-match">
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Tile color={m.matches ? "mint" : "lemon"}><Scale size={18} /></Tile>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800 }}>{m.matches ? "Matches your workbook" : "Differs from your workbook"}</div>
          <div className="fy-hint" style={{ margin: 0, fontWeight: 700 }}>{m.accountsOk} of {m.accountsTotal} accounts · {m.categoriesOk} of {m.categoriesTotal} categories · checked {shortDate(m.checkedAt.slice(0, 10)).replace(/ \d{4}$/, "")}</div></div>
        <Tick on={m.matches} label="Workbook check" /></div>
      {m.matches && <div className="fy-rv-done">✓ A month in Finny only: the numbers match.</div>}
      <Link className="fy-btn block" style={{ marginTop: 10 }} href={`/review/${r.month}/match`}><Scale size={16} />Check again</Link>
    </div>
  );
}

export function ReviewBudget({ month }: { month: string }) {
  const { data: r, setData, err, setErr } = useReview(month);
  const router = useRouter();
  const [msg, setMsg] = useState("");
  async function plan() {
    try {
      const res = await api<{ month: string; added: { raised: boolean }[] }>(`reviews/${month}/plan-next`, { method: "POST" });
      const raised = res.added.filter((a) => a.raised).length;
      setMsg(res.added.length ? `${monthName(res.month)} planned: ${res.added.length} line${res.added.length === 1 ? "" : "s"}${raised ? `, ${raised} raised to what you spent` : ""}.` : `${monthName(res.month)} was already planned.`);
      setData(await api<Rev>(`reviews/${month}`));
    } catch (e) { setErr((e as Error).message); }
  }
  async function done() { try { setData(await api<Rev>(`reviews/${month}`, { method: "PATCH", json: { budgetDone: true } })); router.push(`/review/${month}`); } catch (e) { setErr((e as Error).message); } }
  const row = (l: BLine, over: boolean) => (
    <div className="fy-row" key={l.categoryId}>
      <div className="main"><div className="t">{l.name}</div><Bar l={l} /><div className="s">{over ? <><b style={{ color: "var(--spend)" }}>{l.pct}%</b> · {plain(l.spentSen)} of {plain(l.plannedSen)}</> : <>{plain(l.spentSen)} of {plain(l.plannedSen)}</>}</div></div>
      <span className={`fy-amt ${over ? "spend" : "income"}`}>{over ? `+${plain(l.overSen ?? 0)}` : `−${plain(l.underSen ?? 0)}`}</span>
    </div>
  );
  return (
    <>
      <Link className="fy-back" href={`/review/${month}`}><ChevronLeft size={20} />Review</Link>
      <div className="fy-large"><div><div className="sub">Month-end review · {monthLabel(month)}</div><h1>Budget</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {r && <>
        <div className="fy-hero" style={{ padding: "14px 16px" }} data-testid="rv-bud-head">
          <div className="stats"><div className="fy-stat"><small>Spent</small><b>Rp {plain(r.budget.spentSen)}</b></div><div className="fy-stat"><small>Planned</small><b>Rp {plain(r.budget.plannedSen)}</b></div></div>
          <div className="extra"><span>Kept <b>Rp {plain(r.budget.keptSen)}</b>{r.budget.keptPct != null ? ` · ${r.budget.keptPct}% of income` : ""}</span></div>
        </div>
        {r.budget.over.length > 0 && <><div className="fy-section"><span>Over budget</span><span>{r.budget.over.length}</span></div><div className="fy-list" data-testid="rv-over">{r.budget.over.map((l) => row(l, true))}</div></>}
        {r.budget.under.length > 0 && <><div className="fy-section"><span>Under budget</span><span>{r.budget.under.length}</span></div><div className="fy-list" data-testid="rv-under">{r.budget.under.map((l) => row(l, false))}</div></>}
        {!r.budget.plannedSen && <div className="fy-card fy-pad fy-hint" style={{ margin: "12px 0 0" }}>No budget for {monthName(month)}.<Link className="fy-btn block" style={{ marginTop: 10 }} href={`/budget?month=${r.next}`}>Plan {monthName(r.next)}</Link></div>}
        {r.budget.plannedSen > 0 && <>
          <div className="fy-section"><span>{monthName(r.next)}</span></div>
          <div className="fy-card fy-pad" data-testid="rv-plan">
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Plan {monthName(r.next)} from {monthName(month)}</div>
            <div className="fy-hint" style={{ margin: "0 0 10px" }}>
              {r.budget.planNext.length ? <>Copies {monthName(month)}&apos;s budget. A line that ran over goes up to what you spent, rounded up{r.budget.planNext.find((p) => p.raised) ? ` (${r.budget.planNext.find((p) => p.raised)!.name}: Rp ${plain(r.budget.planNext.find((p) => p.raised)!.amountSen)})` : ""}. You can change it after.</> : <>{monthName(r.next)} already has these lines planned.</>}
            </div>
            {msg && <div className="fy-ok" role="status"><Check size={16} /> {msg}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button className="fy-btn primary" disabled={!r.budget.planNext.length} onClick={plan}>Plan {monthName(r.next)}</button>
              <Link className="fy-btn" href={`/budget?month=${r.next}`}>Open {monthName(r.next)}</Link>
            </div>
          </div>
        </>}
        {!r.closed && <button className="fy-btn block" style={{ marginTop: 12 }} onClick={done}><Check size={16} />Done with budget</button>}
      </>}
    </>
  );
}

export function ReviewClose({ month }: { month: string }) {
  const { data: r, setData, err, setErr } = useReview(month);
  const [note, setNote] = useState<string | null>(null);
  const s = r?.summary;
  async function close() { try { setData(await api<Rev>(`reviews/${month}/close`, { method: "POST", json: { note: note ?? r?.note ?? "" } })); } catch (e) { setErr((e as Error).message); } }
  async function reopen() { try { setData(await api<Rev>(`reviews/${month}/reopen`, { method: "POST" })); } catch (e) { setErr((e as Error).message); } }
  const ended = r ? month < r.today.slice(0, 7) : false;
  return (
    <>
      <Link className="fy-back" href={`/review/${month}`}><ChevronLeft size={20} />Review</Link>
      <div className="fy-large"><div><div className="sub">Month-end review</div><h1>{monthLabel(month)}</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {r && s && <>
        {r.closed && <div className="fy-ok" role="status"><Flag size={16} /> Closed {r.closedAt ? shortDate(r.closedAt.slice(0, 10)) : ""}. These figures were saved then.</div>}
        <div className="fy-hero" style={{ padding: "14px 16px" }} data-testid="rv-sum-head">
          <div className="lbl">Net worth</div><div style={{ fontSize: 24, fontWeight: 800 }}>Rp {plain(s.netSen)}</div>
          <div className="extra"><span style={{ color: s.netChangeSen >= 0 ? "var(--income)" : "var(--spend)" }}>{s.netChangeSen >= 0 ? "▲" : "▼"} <b style={{ color: "inherit" }}>{signed(s.netChangeSen).replace("+", "")}</b> since {monthName(prevOf(r.month))}</span></div>
          <div className="stats" style={{ marginTop: 10 }}><div className="fy-stat"><small>In</small><b>Rp {plain(s.inSen)}</b></div><div className="fy-stat"><small>Out</small><b>Rp {plain(s.outSen)}</b></div></div>
        </div>
        <div className="fy-section"><span>How the month went</span></div>
        <div className="fy-list" data-testid="rv-summary">
          <div className="fy-row"><Tile color="mint"><PiggyBank size={18} /></Tile><div className="main"><div className="t">Kept</div><div className="s" style={{ whiteSpace: "normal" }}>{s.keptPct != null ? `${s.keptPct}% of income` : "No income this month"}{s.avgKeptPct != null ? ` · 6-month average ${s.avgKeptPct}%` : ""}</div></div><span className="fy-amt">{s.keptSen < 0 ? "−" : ""}{plain(Math.abs(s.keptSen))}</span></div>
          <div className="fy-row"><Tile color="pink"><Target size={18} /></Tile><div className="main"><div className="t">Budget</div><div className="s">{s.usedPct == null ? "No budget this month" : `${s.over} over, ${s.under} under`}</div></div><span className="fy-amt">{s.usedPct == null ? "–" : `${s.usedPct}%`}</span></div>
          {s.emergencyPct != null && <div className="fy-row"><Tile color="lemon"><Shield size={18} /></Tile><div className="main"><div className="t">Emergency fund</div><div className="s">{s.emergencyPct}% of target{s.emergencyPrevPct != null ? ` · ${s.emergencyPct >= s.emergencyPrevPct ? "up" : "down"} from ${s.emergencyPrevPct}%` : ""}</div></div><span className="fy-amt">{s.emergencyPct}%</span></div>}
          {(s.goals ?? []).map((g) => <div className="fy-row" key={g.name}><Tile color="lavender"><Gem size={18} /></Tile><div className="main"><div className="t">{g.name}</div><div className="s">{g.change >= 0 ? "+" : "−"}{Math.abs(g.change)} pts this month</div></div><span className="fy-amt">{g.pct}%</span></div>)}
          {(r.match ?? s.match) && <div className="fy-row"><Tile color="sky"><Scale size={18} /></Tile><div className="main"><div className="t">Workbook check</div><div className="s">{(r.match ?? s.match)!.matches ? "All accounts and categories match" : `${(r.match ?? s.match)!.accountsOk} of ${(r.match ?? s.match)!.accountsTotal} accounts, ${(r.match ?? s.match)!.categoriesOk} of ${(r.match ?? s.match)!.categoriesTotal} categories match`}</div></div><span className="fy-amt">{(r.match ?? s.match)!.matches ? "✓" : "✗"}</span></div>}
          <div className="fy-row"><Tile color="peach"><CreditCard size={18} /></Tile><div className="main"><div className="t">Debts</div><div className="s">{s.debtsPaidSen ? "Paid down this month" : "Nothing paid to cards or loans"}</div></div><span className="fy-amt">{plain(s.debtsPaidSen)}</span></div>
        </div>
        {r.closed ? <>
          {r.note && <div className="fy-card fy-pad" style={{ marginTop: 12 }} data-testid="rv-note"><div className="fy-label">Your note</div>{r.note}</div>}
          <button className="fy-btn block" style={{ marginTop: 12 }} onClick={reopen}>Reopen {monthName(month)}</button>
        </> : <>
          <label className="fy-field" style={{ marginTop: 12 }}><span className="fy-label">A note for this month (optional)</span>
            <textarea className="fy-input" style={{ minHeight: 64, paddingTop: 10 }} maxLength={1000} value={note ?? r.note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="fy-btn primary block" disabled={!ended} onClick={close}><Flag size={16} />Close {monthName(month)}</button>
          <div className="fy-hint" style={{ textAlign: "center", marginTop: 8 }}>{ended ? `Closing saves these figures. You can still add or fix ${monthName(month)}'s transactions later.` : `You can close ${monthName(month)} once it has ended.`}</div>
        </>}
      </>}
    </>
  );
}
const prevOf = (m: string) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 2, 1)); return d.toISOString().slice(0, 7); };

function useOverview() {
  const { version } = useFinny();
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => { let live = true; api<Overview>("reviews").then((d) => { if (live) setData(d); }).catch(() => {}); return () => { live = false; }; }, [version]);
  return data;
}

/** Home: "<month> is ready for review" while a month is due. */
export function ReviewNudge() {
  const o = useOverview();
  if (!o?.due) return null;
  const d = o.due, left = d.missingStatements.length;
  return (
    <Link href={`/review/${d.month}`} className="fy-card fy-rv-nudge" data-testid="rv-nudge">
      <Tile color="primary"><Flag size={18} /></Tile>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800 }}>{monthName(d.month)} is ready for review</div>
        <div className="fy-hint" style={{ margin: 0, fontWeight: 700 }}>{d.steps.done} of 4 done{left ? ` · ${d.missingStatements[0]}${left > 1 ? ` and ${left - 1} more` : ""} statement still to read` : ""}</div></div>
      <ChevronRight size={18} />
    </Link>
  );
}

/** Home's budget card: a warning for lines at 90% or over (this month only). */
export function BudgetWarning({ lines, daysLeft, name }: { lines: { categoryId: string; pct: number; plannedSen: number; spentSen: number }[]; daysLeft: number; name: (id: string) => string }) {
  const w = lines.filter((l) => l.plannedSen > 0 && l.spentSen >= l.plannedSen * 0.9).sort((a, b) => b.pct - a.pct);
  if (!w.length) return null;
  const top = w[0], over = top.spentSen > top.plannedSen;
  return (
    <div className="fy-rv-warn" role="status" data-testid="budget-warning"><CircleAlert size={16} style={{ flex: "none" }} />
      <span>{name(top.categoryId)} {over ? `is over budget (${top.pct}%)` : `is at ${top.pct}%`}{daysLeft ? ` with ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go` : ""}{w.length > 1 ? ` · ${w.length - 1} more` : ""}</span></div>
  );
}

/** Home: the latest closed review, and a link to them all. */
export function PastReviews() {
  const o = useOverview();
  if (!o?.past.length) return null;
  const p = o.past[0];
  return (
    <>
      <div className="fy-section"><span>Past reviews</span><Link className="fy-more" style={{ padding: 0 }} href="/review">All ›</Link></div>
      <div className="fy-list" data-testid="rv-past-home"><PastRow p={p} /></div>
    </>
  );
}
function PastRow({ p }: { p: Overview["past"][number] }) {
  return (
    <Link className="fy-row" href={`/review/${p.month}/close`}><Tile color="mint"><Flag size={18} /></Tile>
      <div className="main"><div className="t">{monthLabel(p.month)}</div><div className="s">{p.keptPct != null ? `Kept ${p.keptPct}%` : "Closed"}{p.netChangeSen != null ? ` · net worth ${signed(p.netChangeSen)}` : ""}</div></div><ChevronRight className="chev" size={18} /></Link>
  );
}

/** /review: the month due, and every closed month. */
export function Reviews() {
  const o = useOverview();
  return (
    <>
      <Link className="fy-back" href="/"><ChevronLeft size={20} />Home</Link>
      <div className="fy-large"><div><div className="sub">Home</div><h1>Month-end reviews</h1></div></div>
      {o?.due ? <ReviewNudge /> : o && <div className="fy-card fy-pad fy-hint" style={{ margin: "0 0 12px" }} data-testid="rv-none-due">Nothing to review right now. Last month&apos;s review opens on the 1st.</div>}
      <div className="fy-section"><span>Past reviews</span><span>{o?.past.length ?? ""}</span></div>
      <div className="fy-list" data-testid="rv-past">
        {o && !o.past.length && <div className="fy-row"><div className="main"><div className="s">No closed months yet.</div></div></div>}
        {o?.past.map((p) => <PastRow key={p.month} p={p} />)}
      </div>
    </>
  );
}
