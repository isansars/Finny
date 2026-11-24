"use client";
// The emergency fund (FINNY-104), as approved in "Sprint 9 · Design notes (emergency fund)": how far along, the target,
// where it sits, and getting there.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Calendar, Check, ChevronLeft, Landmark, PiggyBank, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { api, useFinny } from "./store";
import { Sheet } from "./ui";
import { formatCompact, formatRupiah, parseRupiah } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { reachedMonth } from "@/lib/emergency-rule";

type Src = { accountId: string; name: string; type: string; holdingKind: string | null; maturityOn: string | null; valueSen: number; partSen: number | null; amountSen: number };
type Cand = { id: string; name: string; type: string; holdingKind: string | null; valueSen: number };
type Fund = { today: string; thisMonth: string; configured: boolean;
  settings: { stability: "stable" | "fair" | "uncertain"; dependents: number; spendingSen: number | null; target: "low" | "high" | "own"; ownTargetSen: number | null; monthlySen: number };
  averageSpendingSen: number; spendingSen: number; months: [number, number]; lowSen: number; highSen: number; targetSen: number; targetMonths: number | null;
  setAsideSen: number; pct: number; coveredMonths: number | null; toGoSen: number; reached: string | null; sources: Src[]; candidates: Cand[] };

const plain = (sen: number) => formatRupiah(sen, { prefix: false });
const mon = (m: string | null) => (m ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z")) : "–");
const STAB = { stable: "Very stable", fair: "Fairly stable", uncertain: "Uncertain" } as const;
const KIND = { cash: "Cash", bank: "Bank", ewallet: "E-wallet", investment: "Investment" } as Record<string, string>;
const icon = (t: string) => (t === "investment" ? <PiggyBank size={18} /> : t === "ewallet" ? <Wallet size={18} /> : <Landmark size={18} />);
const months1 = (n: number | null) => (n == null ? "–" : `${n.toLocaleString("id-ID")} month${n === 1 ? "" : "s"}`);

function useFund() {
  const { version } = useFinny();
  const [data, setData] = useState<Fund | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { let live = true; api<Fund>("emergency").then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => { if (live) setErr(e.message); }); return () => { live = false; }; }, [version]);
  return { data, setData, err };
}

function Ring({ pct }: { pct: number }) {
  const r = 52, C = 2 * Math.PI * r;
  return (
    <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`${pct}% of target`} style={{ flex: "none" }}>
      <defs><linearGradient id="efr" x1="0" x2="1"><stop offset="0" stopColor="#34d399" /><stop offset="1" stopColor="#10b981" /></linearGradient></defs>
      <circle cx="66" cy="66" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="14" />
      {pct > 0 && <circle cx="66" cy="66" r={r} fill="none" stroke="url(#efr)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 66 66)" />}
      <text x="66" y="63" textAnchor="middle" fontSize="26" fontWeight="800" fill="var(--text)">{pct}%</text>
      <text x="66" y="83" textAnchor="middle" fontSize="11.5" fontWeight="700" fill="var(--text-3)">of target</text>
    </svg>
  );
}

export function Emergency() {
  const { data, setData, err } = useFund();
  const [sheet, setSheet] = useState<"target" | "where" | null>(null);
  return (
    <>
      <Link className="fy-back" href="/assets"><ChevronLeft size={20} />Assets</Link>
      <div className="fy-large"><div><div className="sub">Assets</div><h1>Emergency fund</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {data && !data.configured && (
        <div className="fy-card fy-pad" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Set your target</div>
          <div className="fy-hint" style={{ margin: "0 0 10px" }}>Money for a few months of life if your income stops. Finny suggests how much from how steady your income is and what you spend.</div>
          <button className="fy-btn primary block" onClick={() => setSheet("target")}><ShieldCheck size={16} />Set your target</button>
        </div>
      )}
      <div className="fy-hero" data-testid="ef-hero">
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Ring pct={data?.pct ?? 0} />
          <div style={{ minWidth: 0 }}><div className="lbl">Set aside</div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-.02em", whiteSpace: "nowrap" }} data-testid="ef-set">{data ? formatRupiah(data.setAsideSen) : <span className="fy-skel" />}</div>
            <div className="fy-hint" style={{ margin: "2px 0 0", fontWeight: 700 }} data-testid="ef-target">{data ? `of ${formatRupiah(data.targetSen)} · ${months1(data.targetMonths)}` : ""}</div></div>
        </div>
        <div className="stats" style={{ marginTop: 12 }}>
          <div className="fy-stat"><small>Covers</small><b data-testid="ef-covered">{data ? months1(data.coveredMonths) : "…"}</b></div>
          <div className="fy-stat"><small>Still to go</small><b data-testid="ef-togo" style={{ color: data?.toGoSen ? "var(--spend)" : "var(--income)" }}>{data ? (data.toGoSen ? formatRupiah(data.toGoSen) : "Reached 🎉") : "…"}</b></div>
        </div>
        {data && data.toGoSen > 0 && <div className="extra"><span data-testid="ef-reach">{data.settings.monthlySen ? <>At <b>{formatRupiah(data.settings.monthlySen)}</b> a month you get there by <b>{mon(data.reached)}</b></> : <Link className="fy-more" style={{ padding: 0 }} href="/assets/emergency/plan">Plan a monthly amount ›</Link>}</span></div>}
      </div>
      <div className="fy-section"><span>Where it sits</span><button className="fy-linkish" style={{ color: "var(--primary-text)", fontWeight: 700 }} onClick={() => setSheet("where")}>Edit</button></div>
      <div className="fy-list" data-testid="ef-sources">
        {data && !data.sources.length && <button className="fy-row" onClick={() => setSheet("where")}><div className="main"><div className="t">Pick the accounts that hold it</div><div className="s">Whole accounts, or a part of one</div></div></button>}
        {data?.sources.map((s) => (
          <div className="fy-row" key={s.accountId}><span className="fy-tile" data-color={s.type === "investment" ? "lavender" : "mint"} style={{ width: 32, height: 32, borderRadius: 10 }}>{icon(s.type)}</span>
            <div className="main"><div className="t">{s.name}</div><div className="s">{s.partSen == null ? "all of it" : `Rp ${plain(s.amountSen)} of ${plain(s.valueSen)}`}{s.maturityOn ? ` · matures ${shortDate(s.maturityOn)}` : ""}</div></div>
            <span className="fy-amt">{plain(s.amountSen)}</span></div>
        ))}
      </div>
      <div className="fy-section"><span>Why this target</span><button className="fy-linkish" style={{ color: "var(--primary-text)", fontWeight: 700 }} onClick={() => setSheet("target")}>Change</button></div>
      <div className="fy-list" data-testid="ef-why">
        <div className="fy-row"><span className="fy-tile" data-color="peach" style={{ width: 32, height: 32, borderRadius: 10 }}><Calendar size={18} /></span><div className="main"><div className="t">Monthly spending</div><div className="s">{data?.settings.spendingSen != null ? "your own number" : "3-month average from Finny"}</div></div><span className="fy-amt">{data ? plain(data.spendingSen) : ""}</span></div>
        <div className="fy-row"><span className="fy-tile" data-color="pink" style={{ width: 32, height: 32, borderRadius: 10 }}><Briefcase size={18} /></span><div className="main"><div className="t">Income</div><div className="s">{data ? `${STAB[data.settings.stability]} · ${data.settings.dependents ? `${data.settings.dependents}${data.settings.dependents === 3 ? "+" : ""} rely on you` : "no dependents"}` : ""}</div></div><span className="fy-amt">{data ? `${data.months[0]}–${data.months[1]} months` : ""}</span></div>
      </div>
      <Link className="fy-btn block" style={{ marginTop: 12 }} href="/assets/emergency/plan"><TrendingUp size={16} />Getting there</Link>
      {sheet === "target" && data && <TargetSheet f={data} onClose={() => setSheet(null)} onSaved={(d) => { setData(d); setSheet(null); }} />}
      {sheet === "where" && data && <WhereSheet f={data} onClose={() => setSheet(null)} onSaved={(d) => { setData(d); setSheet(null); }} />}
    </>
  );
}

function TargetSheet({ f, onClose, onSaved }: { f: Fund; onClose: () => void; onSaved: (d: Fund) => void }) {
  const [stability, setStability] = useState(f.settings.stability);
  const [dependents, setDependents] = useState(f.settings.dependents);
  const [spending, setSpending] = useState(plain(f.settings.spendingSen ?? f.averageSpendingSen));
  const [target, setTarget] = useState(f.settings.target);
  const [own, setOwn] = useState(f.settings.ownTargetSen != null ? plain(f.settings.ownTargetSen) : "");
  const [err, setErr] = useState("");
  const base = { stable: [3, 6], fair: [6, 9], uncertain: [9, 12] }[stability], lo = base[0] + dependents, hi = base[1] + dependents;
  const sp = parseRupiah(spending) ?? 0;
  async function save() {
    try {
      const auto = sp === f.averageSpendingSen && f.settings.spendingSen == null;
      onSaved(await api<Fund>("emergency", { method: "PUT", json: { stability, dependents, spending: auto ? "" : spending, target, ownTarget: target === "own" ? own : "" } }));
    } catch (e) { setErr((e as Error).message); }
  }
  const opt = (k: "low" | "high" | "own", label: string, sub: string) => (
    <button type="button" role="radio" aria-checked={target === k} className={`fy-opt ${target === k ? "on" : ""}`} onClick={() => setTarget(k)}><b>{label}</b><span>{sub}</span></button>
  );
  return (
    <Sheet title="Your target" onClose={onClose}>
      <div className="fy-subhead"><span>How steady is your income?</span></div>
      <div className="fy-seg" role="radiogroup" aria-label="How steady is your income" style={{ marginBottom: 10 }}>
        {(["stable", "fair", "uncertain"] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={stability === s} className={stability === s ? "on" : ""} onClick={() => setStability(s)}>{STAB[s]}</button>)}</div>
      <div className="fy-subhead"><span>People who rely on you</span></div>
      <div className="fy-seg" role="radiogroup" aria-label="People who rely on you" style={{ marginBottom: 10 }}>
        {[0, 1, 2, 3].map((n) => <button key={n} type="button" role="radio" aria-checked={dependents === n} className={dependents === n ? "on" : ""} onClick={() => setDependents(n)}>{n === 0 ? "None" : n === 3 ? "3+" : n}</button>)}</div>
      <label className="fy-field"><span className="fy-label" style={{ display: "flex", justifyContent: "space-between" }}><span>Monthly spending (Rp)</span><span style={{ color: "var(--text-3)" }}>3-month average {plain(f.averageSpendingSen)}</span></span>
        <input className="fy-input" inputMode="decimal" value={spending} onChange={(e) => setSpending(e.target.value)} aria-label="Monthly spending" style={{ fontWeight: 800 }} /></label>
      <div className="fy-subhead"><span>Target</span></div>
      <div role="radiogroup" aria-label="Target">
        {opt("low", `${lo} months · Rp ${plain(lo * sp)}`, `The low end for ${STAB[stability].toLowerCase()} income`)}
        {opt("high", `${hi} months · Rp ${plain(hi * sp)}`, "The high end")}
        {opt("own", "My own amount", "Type it")}
      </div>
      {target === "own" && <input className="fy-input" inputMode="decimal" value={own} onChange={(e) => setOwn(e.target.value)} placeholder="Rp" aria-label="My own target" style={{ marginBottom: 10, fontWeight: 800 }} />}
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" onClick={save}>Save target</button></div>
    </Sheet>
  );
}

function WhereSheet({ f, onClose, onSaved }: { f: Fund; onClose: () => void; onSaved: (d: Fund) => void }) {
  const [picked, setPicked] = useState<Record<string, { on: boolean; part: boolean; amount: string }>>(
    Object.fromEntries(f.candidates.map((c) => { const s = f.sources.find((x) => x.accountId === c.id); return [c.id, { on: !!s, part: s?.partSen != null, amount: s?.partSen != null ? plain(s.partSen) : "" }]; })));
  const [err, setErr] = useState("");
  const total = f.candidates.reduce((n, c) => { const p = picked[c.id]; if (!p?.on) return n; const a = p.part ? Math.min(parseRupiah(p.amount) ?? 0, Math.max(0, c.valueSen)) : Math.max(0, c.valueSen); return n + a; }, 0);
  const set = (id: string, v: Partial<{ on: boolean; part: boolean; amount: string }>) => setPicked({ ...picked, [id]: { ...picked[id], ...v } });
  async function save() {
    try { onSaved(await api<Fund>("emergency/sources", { method: "PUT", json: { sources: f.candidates.filter((c) => picked[c.id]?.on).map((c) => ({ accountId: c.id, part: picked[c.id].part ? picked[c.id].amount : "" })) } })); }
    catch (e) { setErr((e as Error).message); }
  }
  return (
    <Sheet title="Where it sits" onClose={onClose}>
      <div className="fy-hint" style={{ margin: "0 0 10px" }}>Tick the accounts that hold your emergency money. Use Part when only some of a balance is set aside.</div>
      <div className="fy-list" style={{ marginBottom: 12 }}>
        {f.candidates.map((c) => { const p = picked[c.id]; return (
          <div className="fy-row" key={c.id} style={{ flexWrap: "wrap", gap: 10 }}>
            <button type="button" role="checkbox" aria-checked={p.on} aria-label={`Use ${c.name}`} className={`fy-check ${p.on ? "on" : ""}`} onClick={() => set(c.id, { on: !p.on })}>{p.on && <Check size={14} />}</button>
            <div className="main"><div className="t">{c.name}</div><div className="s">{KIND[c.type] ?? c.type} · {plain(c.valueSen)}</div>
              {p.on && p.part && <input className="fy-input" inputMode="decimal" value={p.amount} onChange={(e) => set(c.id, { amount: e.target.value })} aria-label={`Part of ${c.name}`} placeholder="Rp" style={{ marginTop: 6, fontWeight: 800 }} />}</div>
            {p.on && <div className="fy-seg" style={{ flex: "none", width: 132 }} role="radiogroup" aria-label={`How much of ${c.name}`}>
              <button type="button" role="radio" aria-checked={!p.part} className={!p.part ? "on" : ""} onClick={() => set(c.id, { part: false })}>All</button>
              <button type="button" role="radio" aria-checked={p.part} className={p.part ? "on" : ""} onClick={() => set(c.id, { part: true })}>Part</button></div>}
          </div>); })}
      </div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" onClick={save}>Save · {formatRupiah(total)}</button></div>
    </Sheet>
  );
}

export function EmergencyPlan() {
  const { data, setData, err } = useFund();
  const [monthly, setMonthly] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const m = monthly ?? (data ? plain(data.settings.monthlySen) : "");
  const sen = parseRupiah(m) ?? 0;
  const reached = data ? reachedMonth(data.setAsideSen, data.targetSen, sen, data.thisMonth) : null;
  const months = data && reached ? (Number(reached.slice(0, 4)) - Number(data.thisMonth.slice(0, 4))) * 12 + Number(reached.slice(5)) - Number(data.thisMonth.slice(5)) : null;
  async function save(v = m) { const d = await api<Fund>("emergency", { method: "PUT", json: { monthly: v } }); setData(d); }
  async function toBudget() { setMsg(""); await save(); const r = await api<{ amountSen: number; month: string }>("emergency/budget", { method: "POST" }); setMsg(`Added: Dana Darurat, Rp ${plain(r.amountSen)} in ${mon(r.month)}'s budget.`); }
  // Quick picks: about 6, 12 and 18 months away, rounded up to Rp 500.000.
  const picks = data ? [6, 12, 18].map((n) => Math.max(500_000_00, Math.ceil(data.toGoSen / n / 500_000_00) * 500_000_00)).filter((v, i, a) => a.indexOf(v) === i) : [];
  const line = () => {
    if (!data || !sen || !months) return null;
    const n = Math.min(months, 60), w = 340, h = 110, top = Math.max(data.targetSen, data.setAsideSen + n * sen);
    const x = (i: number) => 8 + (i * (w - 16)) / Math.max(1, n), y = (v: number) => 24 + (h - 32) * (1 - v / top);
    const pts = Array.from({ length: n + 1 }, (_, i) => Math.min(data.targetSen, data.setAsideSen + i * sen));
    return (
      <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="Your emergency fund growing to its target" style={{ display: "block" }}>
        <line x1="8" x2={w - 8} y1={y(data.targetSen)} y2={y(data.targetSen)} stroke="#94a3b8" strokeDasharray="4 5" strokeWidth="2" />
        <text x={w - 8} y={y(data.targetSen) - 6} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--text-3)">target {formatCompact(data.targetSen)}</text>
        <path d={pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />
        <circle cx={x(0)} cy={y(pts[0])} r="5" fill="#10b981" stroke="#fff" strokeWidth="2" />
        <text x={8} y={h + 14} fontSize="11" fontWeight="700" fill="var(--text-3)">Now</text>
        <text x={w - 8} y={h + 14} textAnchor="end" fontSize="11" fontWeight="700" fill="var(--text-3)">{mon(reached)}</text>
      </svg>
    );
  };
  return (
    <>
      <Link className="fy-back" href="/assets/emergency"><ChevronLeft size={20} />Emergency fund</Link>
      <div className="fy-large"><div><div className="sub">Emergency fund</div><h1>Getting there</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {data && data.toGoSen === 0 && <div className="fy-ok"><Check size={16} /> Your emergency fund has reached its target.</div>}
      <label className="fy-field"><span className="fy-label">Put aside each month (Rp)</span><input className="fy-input" inputMode="decimal" value={m} onChange={(e) => setMonthly(e.target.value)} onBlur={() => save()} aria-label="Put aside each month" style={{ fontWeight: 800 }} /></label>
      {data && <div className="fy-card fy-pad" data-testid="ef-plan">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div className="fy-stat"><small>Reached</small><b data-testid="ef-plan-reached">{sen || data.toGoSen === 0 ? mon(reached) : "–"}</b></div>
          <div className="fy-stat"><small>Months</small><b data-testid="ef-plan-months">{months ?? "–"}</b></div></div>
        <div style={{ marginTop: 8 }}>{line()}</div>
      </div>}
      {picks.length > 0 && data && data.toGoSen > 0 && <div className="fy-chips wrap" style={{ marginTop: 12 }}>{picks.map((p) => <button key={p} type="button" className={`fy-chip ${sen === p ? "on" : ""}`} onClick={() => { setMonthly(plain(p)); save(plain(p)); }}>Rp {formatCompact(p)} · {mon(reachedMonth(data.setAsideSen, data.targetSen, p, data.thisMonth))}</button>)}</div>}
      {data && data.toGoSen === 0 ? <div className="fy-note" style={{ marginTop: 12 }} data-testid="ef-topped">Reached. Keep it topped up: if it drops below the target, the fund page and the month-end review show what&apos;s still to go.</div>
        : <div className="fy-note" style={{ marginTop: 12 }}>Tip: make it a budget line (&quot;Dana Darurat&quot;, a saving category) so Budget reminds you each month.</div>}
      {msg && <div className="fy-ok" role="status" style={{ marginTop: 10 }}><Check size={16} /> {msg}</div>}
      {!(data && data.toGoSen === 0) && <button className="fy-btn block" style={{ marginTop: 12 }} disabled={!sen} onClick={toBudget}><PiggyBank size={16} />Add it to this month&apos;s budget</button>}
    </>
  );
}
