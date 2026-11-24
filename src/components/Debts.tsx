"use client";
// Debts and cards (FINNY-88/89), as approved in "Sprint 7 · Design notes (debts and cards)": what you owe and what's due,
// one debt with its terms and history, the payoff plan, and bills coming up on Home.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Calendar, Check, ChevronLeft, CreditCard, Flag, HandCoins, Percent } from "lucide-react";
import { api, useFinny, type Txn } from "./store";
import { Sheet } from "./ui";
import { formatCompact, formatRupiah, parseRupiah } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import type { Plan } from "@/lib/debt-rule";

type Terms = { interestBp: number | null; interestPer: "month" | "year" | null; minFixedSen: number | null; minPctBp: number | null; minFloorSen: number | null; statementDay: number | null; dueDay: number | null; purpose: string | null };
type DebtRow = { id: string; name: string; type: string; owedSen: number; peakSen: number; progressPct: number; minimumSen: number; monthlyRatePct: number; hasTerms: boolean; terms: Terms; nextDue: string | null; paidThisYearSen: number;
  history: { month: string; paymentsSen: number; chargesSen: number; owedSen: number | null }[] };
type Bill = { id: string; name: string; type: string; due: string; statement: string | null; inDays: number; billSen: number; paidSen: number; leftSen: number; minimumSen: number };
type Overview = { today: string; owedSen: number; minimumsSen: number; paidThisYearSen: number; debtFreeMonth: string | null; plan: { method: string; extraSen: number }; bills: Bill[]; debts: DebtRow[] };
type Plans = { method: "minimums" | "snowball" | "avalanche"; extraSen: number; plans: Record<"minimums" | "snowball" | "avalanche", Plan> };

const ICON: Record<string, React.ReactNode> = { card: <CreditCard size={18} />, loan: <HandCoins size={18} /> };
const COLOR = ["peach", "lavender", "rose", "sky", "mint", "lemon"];
const plain = (sen: number) => formatRupiah(sen, { prefix: false });
const mon = (m: string | null) => (m ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z")) : "never");
const weekday = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
const G = "linear-gradient(90deg,#34d399,#10b981)";
const nth = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
function Bar({ pct }: { pct: number }) { return <div className="fy-bbar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% paid off`}><i style={{ width: `${pct}%`, background: G }} /></div>; }

function useLoad<T>(path: string) {
  const { version } = useFinny();
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { let live = true; api<T>(path).then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => { if (live) setErr(e.message); }); return () => { live = false; }; }, [path, version, tick]);
  return { data, err, reload: () => setTick((t) => t + 1) };
}

// ---------------------------------------------------------------- the list

export function Debts() {
  const { data, err } = useLoad<Overview>("debts");
  const next = data?.bills.find((b) => b.leftSen > 0);
  return (
    <>
      <Link className="fy-back" href="/accounts"><ChevronLeft size={20} />Accounts</Link>
      <div className="fy-large"><div><div className="sub">Accounts</div><h1>Debts</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-hero" data-testid="owed">
        <div className="lbl">You owe</div>
        <div className="big" style={{ marginBottom: 8 }}>{data ? formatRupiah(data.owedSen) : <span className="fy-skel" style={{ width: "6em" }} />}</div>
        <div className="stats">
          <div className="fy-stat"><small>Paid off since Jan</small><b style={{ color: "var(--income)" }} data-testid="paid-year">{data ? formatRupiah(data.paidThisYearSen) : "…"}</b></div>
          <div className="fy-stat"><small>Debt-free</small><b data-testid="debt-free">{data ? (data.owedSen ? mon(data.debtFreeMonth) : "Now 🎉") : "…"}</b></div>
        </div>
        {data && data.minimumsSen > 0 && <div className="extra"><span>Minimums <b>{formatRupiah(data.minimumsSen)}</b> a month</span></div>}
      </div>
      {next && (
        <div className="fy-card fy-pad fy-billnote" data-testid="next-bill"><Bell size={20} />
          <div><div className="h">{next.name} bill · {formatRupiah(next.leftSen)}</div>
            <div className="b">Due {weekday(next.due)}, {next.inDays === 0 ? "today" : `in ${next.inDays} day${next.inDays > 1 ? "s" : ""}`}{next.statement ? ` · from the ${shortDate(next.statement).replace(/ \d{4}$/, "")} statement` : ""}{next.paidSen ? ` · ${formatRupiah(next.paidSen)} already paid` : ""}</div></div></div>
      )}
      {data && !data.debts.length && <div className="fy-card fy-empty" style={{ marginTop: 12 }}><b>No debts</b>Credit cards and loans you add under Accounts show here.</div>}
      {data && data.debts.length > 0 && <>
        <div className="fy-section"><span>Your debts</span><span>{data.plan.method === "minimums" ? "by what you owe" : "by what to pay first"}</span></div>
        <div className="fy-list" data-testid="debts">
          {data.debts.map((d, i) => (
            <Link className="fy-row" key={d.id} href={`/debts/${d.id}`} data-testid={`debt-${d.name}`}>
              <span className="fy-tile" data-color={COLOR[i % COLOR.length]} style={{ width: 32, height: 32, borderRadius: 10 }}>{ICON[d.type]}</span>
              <div className="main"><div className="t fy-bline"><span>{d.name}</span><span className="num">{plain(d.owedSen)}</span></div><Bar pct={d.progressPct} />
                <div className="s">{d.owedSen ? `${d.progressPct}% paid off · min ${plain(d.minimumSen)}${d.nextDue ? ` · due ${shortDate(d.nextDue).replace(/ \d{4}$/, "")}` : ""}` : "Nothing owed"}{!d.hasTerms ? " · add its terms" : ""}</div></div>
            </Link>
          ))}
        </div>
        <Link className="fy-btn primary block" style={{ marginTop: 12 }} href="/debts/plan"><Flag size={17} />See your payoff plan</Link>
      </>}
    </>
  );
}

// ---------------------------------------------------------------- one debt

export function DebtDetail({ id }: { id: string }) {
  const { data, err, reload } = useLoad<Overview>("debts");
  const [edit, setEdit] = useState(false);
  const d = data?.debts.find((x) => x.id === id);
  const t = d?.terms;
  const interest = t?.interestBp != null ? `${(t.interestBp / 100).toLocaleString("id-ID")}% a ${t.interestPer ?? "month"}` : "Not set";
  const minimum = t?.minFixedSen != null ? `${formatRupiah(t.minFixedSen)} a month` : t?.minPctBp != null ? `${(t.minPctBp / 100).toLocaleString("id-ID")}% of the balance${t.minFloorSen ? `, at least ${formatRupiah(t.minFloorSen)}` : ""}` : "Not set: 5% of the bill, at least Rp 50.000";
  const peakMonth = d ? d.history.reduce((best, h) => ((h.owedSen ?? 0) >= (best?.owedSen ?? -1) ? h : best), null as DebtRow["history"][number] | null) : null;
  return (
    <>
      <Link className="fy-back" href="/debts"><ChevronLeft size={20} />Debts</Link>
      <div className="fy-large"><div><div className="sub">Debts</div><h1>{d?.name ?? "…"}</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {data && !d && <div className="fy-err" role="alert">That debt isn&apos;t here.</div>}
      {d && <>
        <div className="fy-hero" data-testid="debt-hero">
          <div className="lbl">Owed now</div>
          <div className="big" style={{ marginBottom: 6 }}>{formatRupiah(d.owedSen)}</div><Bar pct={d.progressPct} />
          <div className="fy-hint" style={{ margin: "4px 0 0", fontWeight: 700 }}>{d.progressPct}% paid off from its peak of {formatRupiah(d.peakSen)}{peakMonth?.owedSen === d.peakSen ? ` (${mon(peakMonth.month).split(" ")[0]})` : ""}</div>
        </div>
        <div className="fy-section"><span>Terms</span><button className="fy-linkish" style={{ color: "var(--primary-text)", fontWeight: 700 }} onClick={() => setEdit(true)}>Edit</button></div>
        <div className="fy-list" data-testid="terms">
          <div className="fy-row"><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><Percent size={18} /></span><div className="main"><div className="t">Interest</div></div><span className="fy-amt" style={{ fontSize: 14 }}>{interest}</span></div>
          <div className="fy-row"><span className="fy-tile" data-color="mint" style={{ width: 32, height: 32, borderRadius: 10 }}><HandCoins size={18} /></span><div className="main"><div className="t">Minimum payment</div><div className="s">{minimum}</div></div><span className="fy-amt" style={{ fontSize: 14 }}>{plain(d.minimumSen)}</span></div>
          <div className="fy-row"><span className="fy-tile" data-color="sky" style={{ width: 32, height: 32, borderRadius: 10 }}><Calendar size={18} /></span><div className="main"><div className="t">Statement · due</div></div><span className="fy-amt" style={{ fontSize: 14 }}>{t?.statementDay ? nth(t.statementDay) : "–"} · {t?.dueDay ? nth(t.dueDay) : "–"}</span></div>
          <div className="fy-row"><span className="fy-tile" data-color="peach" style={{ width: 32, height: 32, borderRadius: 10 }}><Flag size={18} /></span><div className="main"><div className="t">Kind</div></div><span className="fy-amt" style={{ fontSize: 14 }}>{t?.purpose ? t.purpose[0].toUpperCase() + t.purpose.slice(1) : "–"}</span></div>
        </div>
        <div className="fy-section"><span>Month by month</span><span>paid · charged · owed</span></div>
        <div className="fy-list" data-testid="debt-history">
          {[...d.history].reverse().filter((h) => h.paymentsSen || h.chargesSen || h.owedSen).map((h) => (
            <div className="fy-row plain" key={h.month} data-testid={`dh-${h.month}`}><div className="main"><div className="t">{mon(h.month)}</div></div>
              <div className="fy-3col"><span style={{ color: "var(--income)" }}>{h.paymentsSen ? `+${formatCompact(h.paymentsSen)}` : "–"}</span><span>{h.chargesSen ? `−${formatCompact(h.chargesSen)}` : "–"}</span><span>{h.owedSen === null ? "–" : formatCompact(h.owedSen)}</span></div></div>
          ))}
        </div>
        {edit && <TermsSheet id={d.id} name={d.name} type={d.type} t={d.terms} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      </>}
    </>
  );
}

function TermsSheet({ id, name, type, t, onClose, onSaved }: { id: string; name: string; type: string; t: Terms; onClose: () => void; onSaved: () => void }) {
  const pct = (bp: number | null) => (bp == null ? "" : (bp / 100).toLocaleString("id-ID"));
  const [interest, setInterest] = useState(pct(t.interestBp));
  const [per, setPer] = useState<"month" | "year">(t.interestPer ?? (type === "loan" ? "year" : "month"));
  const [minKind, setMinKind] = useState<"pct" | "fixed">(t.minFixedSen != null ? "fixed" : "pct");
  const [minPct, setMinPct] = useState(pct(t.minPctBp));
  const [minFloor, setMinFloor] = useState(t.minFloorSen != null ? plain(t.minFloorSen) : "");
  const [minFixed, setMinFixed] = useState(t.minFixedSen != null ? plain(t.minFixedSen) : "");
  const [stmt, setStmt] = useState(t.statementDay ? String(t.statementDay) : "");
  const [due, setDue] = useState(t.dueDay ? String(t.dueDay) : "");
  const [purpose, setPurpose] = useState(t.purpose ?? "");
  const [err, setErr] = useState("");
  async function save() {
    setErr("");
    try {
      await api(`accounts/${id}/terms`, { method: "PUT", json: { interest, interestPer: per, minPct: minKind === "pct" ? minPct : "", minFloor: minKind === "pct" ? minFloor : "", minFixed: minKind === "fixed" ? minFixed : "", statementDay: stmt, dueDay: due, purpose } });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Sheet title={`${name} terms`} onClose={onClose}>
      <label className="fy-field"><span className="fy-label">Interest (%)</span>
        <div style={{ display: "flex", gap: 8 }}><input className="fy-input" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} placeholder="1,75" aria-label="Interest percent" />
          <div className="fy-seg" style={{ flex: "none" }} role="radiogroup" aria-label="Interest per">{(["month", "year"] as const).map((p) => <button key={p} type="button" role="radio" aria-checked={per === p} className={per === p ? "on" : ""} onClick={() => setPer(p)}>a {p}</button>)}</div></div></label>
      <div className="fy-subhead"><span>Minimum payment</span></div>
      <div className="fy-seg" role="radiogroup" aria-label="Minimum is" style={{ marginBottom: 10 }}>
        <button type="button" role="radio" aria-checked={minKind === "pct"} className={minKind === "pct" ? "on" : ""} onClick={() => setMinKind("pct")}>% of the bill</button>
        <button type="button" role="radio" aria-checked={minKind === "fixed"} className={minKind === "fixed" ? "on" : ""} onClick={() => setMinKind("fixed")}>A fixed amount</button></div>
      {minKind === "pct" ? <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="fy-field"><span className="fy-label">Percent</span><input className="fy-input" inputMode="decimal" value={minPct} onChange={(e) => setMinPct(e.target.value)} placeholder="10" aria-label="Minimum percent" /></label>
        <label className="fy-field"><span className="fy-label">At least (Rp)</span><input className="fy-input" inputMode="decimal" value={minFloor} onChange={(e) => setMinFloor(e.target.value)} placeholder="50.000" aria-label="Minimum floor" /></label></div>
        : <label className="fy-field"><span className="fy-label">Each month (Rp)</span><input className="fy-input" inputMode="decimal" value={minFixed} onChange={(e) => setMinFixed(e.target.value)} placeholder="250.000" aria-label="Fixed minimum" /></label>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="fy-field"><span className="fy-label">Statement day</span><input className="fy-input" inputMode="numeric" value={stmt} onChange={(e) => setStmt(e.target.value)} placeholder="20" aria-label="Statement day" /></label>
        <label className="fy-field"><span className="fy-label">Due day</span><input className="fy-input" inputMode="numeric" value={due} onChange={(e) => setDue(e.target.value)} placeholder="5" aria-label="Due day" /></label></div>
      <div className="fy-subhead"><span>Kind</span></div>
      <div className="fy-seg" role="radiogroup" aria-label="Kind" style={{ marginBottom: 14 }}>{[["", "Not set"], ["consumptive", "Consumptive"], ["productive", "Productive"]].map(([v, l]) => <button key={v} type="button" role="radio" aria-checked={purpose === v} className={purpose === v ? "on" : ""} onClick={() => setPurpose(v)}>{l}</button>)}</div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" onClick={save}>Save terms</button></div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- payoff plan

function PlanLine({ main, base }: { main: Plan; base: Plan }) {
  const w = 340, h = 120, n = Math.max(main.line.length, base.line.length, 2);
  const max = Math.max(1, ...base.line.map((l) => l.owedSen), ...main.line.map((l) => l.owedSen));
  const x = (i: number) => 8 + (i * (w - 16)) / (n - 1), y = (v: number) => 6 + (h - 12) * (1 - v / max);
  const path = (pts: { owedSen: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.owedSen).toFixed(1)}`).join(" ");
  const ticks = [0, Math.round((n - 1) / 2), n - 1];
  const at = (i: number) => (base.line[i] ?? main.line[i])?.month;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="What you owe over time" style={{ display: "block" }}>
      <path d={path(base.line)} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeDasharray="4 6" strokeLinecap="round" />
      <path d={path(main.line)} fill="none" stroke="#ec4899" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {ticks.map((i) => at(i) ? <text key={i} x={x(i)} y={h + 14} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="12" fontWeight="700" fill="var(--text-3)">{mon(at(i)!)}</text> : null)}
    </svg>
  );
}

export function PayoffPlan() {
  const { data, err, reload } = useLoad<Plans>("debts/plan");
  const [method, setMethod] = useState<Plans["method"] | null>(null);
  const [extra, setExtra] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const m = method ?? data?.method ?? "snowball";
  const ex = extra ?? (data ? plain(data.extraSen) : "");
  async function save(next: { method?: Plans["method"]; extra?: string }) {
    setBusy(true);
    try { await api("debts/plan", { method: "PUT", json: { method: next.method ?? m, extra: next.extra ?? ex } }); reload(); } finally { setBusy(false); }
  }
  const p = data?.plans[m], base = data?.plans.minimums, other = data ? data.plans[m === "avalanche" ? "snowball" : "avalanche"] : null;
  const saves = p && base ? base.totalInterestSen - p.totalInterestSen : 0;
  return (
    <>
      <Link className="fy-back" href="/debts"><ChevronLeft size={20} />Debts</Link>
      <div className="fy-large"><div><div className="sub">Debts</div><h1>Payoff plan</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-seg" role="radiogroup" aria-label="Method" style={{ marginBottom: 10 }}>
        {(["minimums", "snowball", "avalanche"] as const).map((k) => <button key={k} role="radio" aria-checked={m === k} className={m === k ? "on" : ""} disabled={busy} onClick={() => { setMethod(k); save({ method: k }); }}>{{ minimums: "Minimums", snowball: "Snowball", avalanche: "Avalanche" }[k]}</button>)}
      </div>
      {m !== "minimums" && <label className="fy-field"><span className="fy-label">Extra each month, on top of the minimums (Rp)</span>
        <input className="fy-input" inputMode="decimal" value={ex} onChange={(e) => setExtra(e.target.value)} onBlur={() => { const s = parseRupiah(ex); if (s !== null && s !== data?.extraSen) save({ extra: ex }); }} aria-label="Extra each month" style={{ fontWeight: 800 }} /></label>}
      {p && base && <div className="fy-card fy-pad" data-testid="plan">
        <div className="fy-stats3" style={{ marginTop: 0 }}>
          <div className="fy-stat"><small>Debt-free</small><b data-testid="plan-free">{mon(p.debtFreeMonth)}</b></div>
          <div className="fy-stat"><small>Interest</small><b data-testid="plan-interest">{formatCompact(p.totalInterestSen)}</b></div>
          <div className="fy-stat"><small>Saves</small><b data-testid="plan-saves" style={{ color: saves > 0 ? "var(--income)" : undefined }}>{saves > 0 ? formatCompact(saves) : "–"}</b></div>
        </div>
        <div style={{ marginTop: 8 }}><PlanLine main={p} base={base} /></div>
        <div className="fy-key"><i style={{ background: "#ec4899" }} />{{ minimums: "Minimums", snowball: "Snowball", avalanche: "Avalanche" }[m]}{m !== "minimums" && p.extraSen ? ` + ${formatCompact(p.extraSen)}` : ""} <i style={{ background: "#94a3b8" }} />Minimums only ({mon(base.debtFreeMonth)})</div>
        {p.stuck.length > 0 && <div className="fy-err" role="alert" style={{ marginTop: 10 }}>{p.stuck.join(", ")} never get{p.stuck.length > 1 ? "" : "s"} smaller at this pace: the payment doesn&apos;t cover the interest. Add an extra, or check the terms.</div>}
      </div>}
      {p && p.order.length > 0 && <>
        <div className="fy-section"><span>The order</span><span>{{ minimums: "each gets its minimum", snowball: "smallest balance first", avalanche: "highest interest first" }[m]}</span></div>
        <div className="fy-list" data-testid="plan-order">
          {p.order.map((o, i) => (
            <div className="fy-row" key={o.id}><span className="fy-tile" data-color={COLOR[i % COLOR.length]} style={{ width: 32, height: 32, borderRadius: 10, fontWeight: 800 }}>{i + 1}</span>
              <div className="main"><div className="t">{o.name}</div><div className="s">{o.payoffMonth ? `Paid off ${mon(o.payoffMonth)}${i === p.order.length - 1 && p.debtFreeMonth ? " · debt-free 🎉" : ""}` : "Not paid off at this pace"}</div></div></div>
          ))}
        </div>
        {other && m !== "minimums" && other.debtFreeMonth && <div className="fy-hint" style={{ marginTop: 8 }} data-testid="plan-compare">
          {m === "snowball" ? "Avalanche" : "Snowball"} would finish {mon(other.debtFreeMonth)} {other.totalInterestSen === p.totalInterestSen ? "with the same interest" : `and pay ${formatRupiah(Math.abs(other.totalInterestSen - p.totalInterestSen))} ${other.totalInterestSen < p.totalInterestSen ? "less" : "more"} interest`}.</div>}
      </>}
      {data && !p?.order.length && <div className="fy-card fy-empty" style={{ marginTop: 12 }}><b>Nothing to pay off</b>You owe nothing on your cards and loans.</div>}
    </>
  );
}

// ---------------------------------------------------------------- Home: bills coming up

export function BillsCard() {
  const { openAdd } = useFinny();
  const { data } = useLoad<{ today: string; payFromId: string | null; bills: Bill[] }>("debts/bills?days=14");
  const bills = data?.bills.filter((b) => b.leftSen > 0) ?? [];
  if (!bills.length) return null;
  const first = bills[0];
  const pay = () => openAdd({ id: "", on: data!.today, kind: "transfer", amountSen: first.leftSen, accountId: data!.payFromId ?? "", toAccountId: first.id, categoryId: null, entity: null, description: `Pay ${first.name}`, note: null } as Txn);
  return (
    <div className="fy-card fy-pad" style={{ marginTop: 12 }} data-testid="bills-card">
      <div className="fy-section" style={{ margin: "0 0 6px" }}><span>Bills coming up</span><Link className="fy-more" style={{ padding: 0 }} href="/debts">Debts ›</Link></div>
      {bills.map((b) => (
        <div className="fy-row" style={{ padding: "8px 0" }} key={b.id}>
          <span className="fy-tile" data-color={b.type === "loan" ? "rose" : "peach"} style={{ width: 32, height: 32, borderRadius: 10 }}>{ICON[b.type]}</span>
          <div className="main"><div className="t">{b.name}</div><div className="s">{weekday(b.due)} · {b.inDays === 0 ? "today" : `in ${b.inDays} day${b.inDays > 1 ? "s" : ""}`} · min {plain(b.minimumSen)}</div></div>
          <span className="fy-amt">{plain(b.leftSen)}</span>
        </div>
      ))}
      <button className="fy-btn block" style={{ marginTop: 6 }} onClick={pay}><Check size={16} />Mark {first.name} paid…</button>
    </div>
  );
}

