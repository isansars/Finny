"use client";
// Net worth goals (FINNY-120), as approved in "Sprint 11 · Design notes (net worth goals, approved)": the goals, a new
// or changed goal, and one goal with its chart.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Gem, Landmark, PiggyBank, Plus, ShieldCheck, Wallet } from "lucide-react";
import { api, useFinny } from "./store";
import { Sheet } from "./ui";
import { formatCompact, formatRupiah, parseRupiah } from "@/lib/money";
import { monthLabel } from "@/lib/dates";
import { neededPerMonth, savedFrom } from "@/lib/goal-rule";

type Src = { accountId: string; name: string; type: string; valueSen: number; partSen: number | null; amountSen: number };
type Goal = { id: string; name: string; kind: "save" | "networth"; byMonth: string | null; savedSen: number; targetSen: number; leftSen: number; pct: number;
  neededSen: number | null; paceSen: number; paceMonths: number; reachedAtPace: string | null; reached: boolean; onTrack: boolean; behindSen: number; sources: Src[] };
type Cand = { id: string; name: string; type: string; valueSen: number };
type Overview = { today: string; netSen: number; netPaceSen: number; netPaceMonths: number; goals: Goal[]; emergency: { configured: boolean; pct: number; setAsideSen: number; targetSen: number; reached: string | null }; candidates: Cand[] };
type Detail = Goal & { history: { month: string; sen: number }[]; projection: { needed: { month: string; sen: number }[]; pace: { month: string; sen: number }[] } };

const plain = (sen: number) => formatRupiah(sen, { prefix: false });
const jt = (sen: number) => formatCompact(sen);
const mon = (m: string | null) => (m ? new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z")) : "–");
const GREEN = "linear-gradient(90deg,#34d399,#10b981)", AMBER = "linear-gradient(90deg,#fbbf24,#f59e0b)";
const icon = (g: { kind: string }) => (g.kind === "networth" ? <Gem size={18} /> : <PiggyBank size={18} />);

function Tile({ color, children }: { color: string; children: React.ReactNode }) {
  return <span className="fy-tile" data-color={color} style={{ width: 32, height: 32, borderRadius: 10 }}>{children}</span>;
}
function GBar({ pct, good, label }: { pct: number; good: boolean; label: string }) {
  return <div className="fy-bbar" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} style={{ margin: "8px 0 4px" }}><i style={{ width: `${pct}%`, background: good ? GREEN : AMBER }} /></div>;
}
/** "On track", "Behind · Rp 1,2 jt/mo more", "Reached", or the month at your pace. */
function status(g: Goal) {
  if (g.reached) return { text: "Reached 🎉", good: true };
  if (g.byMonth) return g.onTrack ? { text: "On track", good: true } : { text: `Behind · Rp ${jt(g.behindSen)}/mo more`, good: false };
  return g.reachedAtPace ? { text: `At your pace: ${mon(g.reachedAtPace)}`, good: true } : { text: "Not growing yet", good: false };
}

function useGoals() {
  const { version } = useFinny();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { let live = true; api<Overview>("goals").then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => { if (live) setErr(e.message); }); return () => { live = false; }; }, [version, tick]);
  return { data, err, reload: () => setTick((t) => t + 1) };
}

export function Goals() {
  const { data, err, reload } = useGoals();
  const [adding, setAdding] = useState(false);
  const router = useRouter();
  return (
    <>
      <Link className="fy-back" href="/assets"><ChevronLeft size={20} />Assets</Link>
      <div className="fy-large"><div><div className="sub">Assets</div><h1>Goals</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-hero" style={{ padding: "14px 16px" }} data-testid="goals-hero">
        <div className="lbl">Net worth today</div>
        <div style={{ fontSize: 24, fontWeight: 800 }}>{data ? formatRupiah(data.netSen) : <span className="fy-skel" />}</div>
        {data && data.netPaceMonths > 0 && <div className="extra"><span>{data.netPaceSen >= 0 ? "Growing" : "Shrinking"} about <b>Rp {plain(Math.abs(data.netPaceSen))}</b> a month (last {data.netPaceMonths} month{data.netPaceMonths === 1 ? "" : "s"})</span></div>}
      </div>
      <div className="fy-section"><span>Your goals</span><span>{data ? data.goals.length + (data.emergency.configured ? 1 : 0) : ""}</span></div>
      <div data-testid="goals">
        {data && !data.goals.length && <div className="fy-card fy-pad fy-hint" style={{ margin: "0 0 10px" }}>Aim your money somewhere: a house deposit, a trip, or a net worth by a date. Finny shows what&apos;s needed a month and when you&apos;ll get there.</div>}
        {data?.goals.map((g) => { const s = status(g); return (
          <Link key={g.id} href={`/assets/goals/${g.id}`} className="fy-card fy-goal" data-testid={`goal-${g.name}`}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Tile color={g.kind === "networth" ? "lavender" : "peach"}>{icon(g)}</Tile>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800 }}>{g.name}</div><div className="fy-hint" style={{ margin: 0, fontWeight: 700 }}>{g.byMonth ? `by ${mon(g.byMonth)}` : "no date"} · {g.kind === "networth" ? "net worth" : g.sources.map((x) => x.name).join(" + ")}</div></div>
              <b style={{ fontVariantNumeric: "tabular-nums" }}>{g.pct}%</b></div>
            <GBar pct={g.pct} good={s.good} label={`${g.name}: ${g.pct}%`} />
            <div className="fy-goal-foot"><span>Rp {jt(g.savedSen)} of {jt(g.targetSen)}</span><span style={{ color: s.good ? "var(--income)" : "var(--warn-text, #b45309)" }}>{s.text}</span></div>
          </Link>); })}
        {data?.emergency.configured && (
          <Link href="/assets/emergency" className="fy-card fy-goal" data-testid="goal-emergency">
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}><Tile color="mint"><ShieldCheck size={18} /></Tile>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800 }}>Emergency fund</div><div className="fy-hint" style={{ margin: 0, fontWeight: 700 }}>from the emergency fund page</div></div><b>{data.emergency.pct}%</b></div>
            <GBar pct={data.emergency.pct} good label={`Emergency fund: ${data.emergency.pct}%`} />
            <div className="fy-goal-foot"><span>Rp {jt(data.emergency.setAsideSen)} of {jt(data.emergency.targetSen)}</span><span style={{ color: "var(--income)" }}>{data.emergency.reached ? mon(data.emergency.reached) : ""}</span></div>
          </Link>)}
      </div>
      <button className="fy-btn primary block" style={{ marginTop: 4 }} onClick={() => setAdding(true)}><Plus size={16} />Add a goal</button>
      {adding && data && <GoalSheet candidates={data.candidates} onClose={() => setAdding(false)} onSaved={(g) => { setAdding(false); reload(); router.push(`/assets/goals/${g.id}`); }} />}
    </>
  );
}

export function GoalSheet({ goal, candidates, onClose, onSaved, onDeleted }: { goal?: Goal; candidates: Cand[]; onClose: () => void; onSaved: (g: Detail) => void; onDeleted?: () => void }) {
  const [kind, setKind] = useState<"save" | "networth">(goal?.kind ?? "save");
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? plain(goal.targetSen) : "");
  const [by, setBy] = useState(goal?.byMonth ?? "");
  const [picked, setPicked] = useState<Record<string, { on: boolean; part: boolean; amount: string }>>(Object.fromEntries(candidates.map((c) => {
    const s = goal?.sources.find((x) => x.accountId === c.id); return [c.id, { on: !!s, part: s?.partSen != null, amount: s?.partSen != null ? plain(s.partSen) : "" }];
  })));
  const [err, setErr] = useState("");
  const set = (id: string, v: Partial<{ on: boolean; part: boolean; amount: string }>) => setPicked({ ...picked, [id]: { ...picked[id], ...v } });
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()).slice(0, 7);
  const t = parseRupiah(target) ?? 0;
  const saved = kind === "networth" ? null : savedFrom(candidates.filter((c) => picked[c.id]?.on).map((c) => ({ valueSen: c.valueSen, partSen: picked[c.id].part ? parseRupiah(picked[c.id].amount) ?? 0 : null })));
  const need = saved != null && t > 0 && /^\d{4}-\d{2}$/.test(by) ? neededPerMonth(saved, t, by, thisMonth) : null;
  async function save() {
    const json = { name, kind, target, byMonth: by || null, sources: kind === "save" ? candidates.filter((c) => picked[c.id]?.on).map((c) => ({ accountId: c.id, part: picked[c.id].part ? picked[c.id].amount : "" })) : [] };
    try { onSaved(await api<Detail>(goal ? `goals/${goal.id}` : "goals", { method: goal ? "PATCH" : "POST", json })); } catch (e) { setErr((e as Error).message); }
  }
  async function del() { if (!goal || !confirm(`Delete "${goal.name}"?`)) return; try { await api(`goals/${goal.id}`, { method: "DELETE" }); onDeleted?.(); } catch (e) { setErr((e as Error).message); } }
  return (
    <Sheet title={goal ? "Change goal" : "New goal"} onClose={onClose}>
      <div className="fy-subhead"><span>What is it?</span></div>
      <div className="fy-seg" role="radiogroup" aria-label="What is it" style={{ marginBottom: 10 }}>
        <button type="button" role="radio" aria-checked={kind === "save"} className={kind === "save" ? "on" : ""} onClick={() => setKind("save")}>Save for something</button>
        <button type="button" role="radio" aria-checked={kind === "networth"} className={kind === "networth" ? "on" : ""} onClick={() => setKind("networth")}>Net worth</button>
      </div>
      <label className="fy-field"><span className="fy-label">Name</span><input className="fy-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={kind === "networth" ? "Net worth Rp 1 M" : "DP rumah"} /></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="fy-field"><span className="fy-label">Target (Rp)</span><input className="fy-input" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} style={{ fontWeight: 800 }} /></label>
        <label className="fy-field"><span className="fy-label">By (optional)</span><input className="fy-input" type="month" min={thisMonth} value={by} onChange={(e) => setBy(e.target.value)} /></label>
      </div>
      {kind === "save" && <>
        <div className="fy-subhead"><span>Where it&apos;s saved</span></div>
        <div className="fy-list" style={{ marginBottom: 10 }}>
          {candidates.map((c) => { const p = picked[c.id]; return (
            <div className="fy-row" key={c.id} style={{ flexWrap: "wrap", gap: 10 }}>
              <button type="button" role="checkbox" aria-checked={p.on} aria-label={`Use ${c.name}`} className={`fy-check ${p.on ? "on" : ""}`} onClick={() => set(c.id, { on: !p.on })}>{p.on && <Check size={14} />}</button>
              <div className="main"><div className="t">{c.name}</div><div className="s">{plain(c.valueSen)}</div>
                {p.on && p.part && <input className="fy-input" inputMode="decimal" value={p.amount} onChange={(e) => set(c.id, { amount: e.target.value })} aria-label={`Part of ${c.name}`} placeholder="Rp" style={{ marginTop: 6, fontWeight: 800 }} />}</div>
              {p.on && <div className="fy-seg" style={{ flex: "none", width: 132 }} role="radiogroup" aria-label={`How much of ${c.name}`}>
                <button type="button" role="radio" aria-checked={!p.part} className={!p.part ? "on" : ""} onClick={() => set(c.id, { part: false })}>All</button>
                <button type="button" role="radio" aria-checked={p.part} className={p.part ? "on" : ""} onClick={() => set(c.id, { part: true })}>Part</button></div>}
            </div>); })}
        </div>
      </>}
      {need != null && need > 0 && <div className="fy-note" style={{ marginBottom: 10 }} data-testid="goal-need">Needs Rp {plain(need)} a month to reach it by {mon(by)}.</div>}
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" onClick={save}>Save goal</button></div>
      {goal && <button className="fy-btn block" style={{ marginTop: 8, color: "var(--spend)" }} onClick={del}>Delete goal</button>}
    </Sheet>
  );
}

function Chart({ d }: { d: Detail }) {
  const all = [...d.history, ...d.projection.needed.slice(1), ...d.projection.pace.slice(1)];
  const months = [...new Set(all.map((p) => p.month))].sort();
  if (months.length < 2) return null;
  const w = 340, h = 120, idx = new Map(months.map((m, i) => [m, i]));
  const top = Math.max(d.targetSen, ...all.map((p) => p.sen)), low = Math.min(0, ...all.map((p) => p.sen));
  const x = (m: string) => 8 + ((idx.get(m) ?? 0) * (w - 16)) / (months.length - 1), y = (v: number) => 22 + (h - 30) * (1 - (v - low) / (top - low || 1));
  const path = (ps: { month: string; sen: number }[]) => ps.map((p, i) => `${i ? "L" : "M"}${x(p.month).toFixed(1)},${y(p.sen).toFixed(1)}`).join(" ");
  const now = d.history[d.history.length - 1];
  return (
    <figure style={{ margin: 0 }}>
      <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label={`${d.name}: saved over time, needed and your pace to the target`} style={{ display: "block" }}>
        <line x1="8" x2={w - 8} y1={y(d.targetSen)} y2={y(d.targetSen)} stroke="#94a3b8" strokeDasharray="4 5" strokeWidth="2" />
        <text x={w - 8} y={y(d.targetSen) - 6} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--text-3)">target {jt(d.targetSen)}</text>
        {d.projection.needed.length > 1 && <path d={path(d.projection.needed)} fill="none" stroke="#10b981" strokeWidth="2.5" strokeDasharray="6 5" />}
        {d.projection.pace.length > 1 && <path d={path(d.projection.pace)} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="2 5" strokeLinecap="round" />}
        <path d={path(d.history)} fill="none" stroke="#ec4899" strokeWidth="3" strokeLinecap="round" />
        <circle cx={x(now.month)} cy={y(now.sen)} r="5" fill="#ec4899" stroke="#fff" strokeWidth="2" />
        <text x="8" y={h + 14} fontSize="12" fontWeight="700" fill="var(--text-3)">{mon(months[0])}</text>
        <text x={w - 8} y={h + 14} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--text-3)">{mon(months[months.length - 1])}</text>
      </svg>
      <figcaption className="fy-goal-legend"><span><i style={{ background: "#ec4899" }} />saved</span>{d.projection.needed.length > 1 && <span><i className="dash" style={{ borderColor: "#10b981" }} />needed</span>}{d.projection.pace.length > 1 && <span><i className="dot" style={{ borderColor: "#f59e0b" }} />your pace</span>}</figcaption>
    </figure>
  );
}

export function GoalDetail({ id }: { id: string }) {
  const { version } = useFinny();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [cands, setCands] = useState<Cand[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [edit, setEdit] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.all([api<Detail>(`goals/${id}`), api<Overview>("goals")]).then(([g, o]) => { if (live) { setD(g); setCands(o.candidates); setErr(""); } }).catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [id, version]);
  async function toBudget() { try { const r = await api<{ name: string; amountSen: number; month: string }>(`goals/${id}/budget`, { method: "POST" }); setMsg(`Added: ${r.name}, Rp ${plain(r.amountSen)} in ${monthLabel(r.month)}'s budget.`); } catch (e) { setErr((e as Error).message); } }
  const s = d ? status(d) : null;
  return (
    <>
      <Link className="fy-back" href="/assets/goals"><ChevronLeft size={20} />Goals</Link>
      <div className="fy-large"><div><div className="sub">Goals</div><h1>{d?.name ?? "…"}</h1></div>{d && <button className="fy-btn" onClick={() => setEdit(true)}>Edit</button>}</div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {d && s && <>
        <div className="fy-hero" style={{ padding: "14px 16px" }} data-testid="goal-hero">
          <div className="lbl">{d.kind === "networth" ? "Net worth" : "Saved"}</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>Rp {plain(d.savedSen)} <span style={{ fontSize: 14, color: "var(--text-2)" }}>of {plain(d.targetSen)}</span></div>
          <GBar pct={d.pct} good={s.good} label={`${d.pct}% of target`} />
          <div className="stats" style={{ marginTop: 8 }}>
            <div className="fy-stat"><small>Needed a month</small><b data-testid="goal-needed">{d.neededSen == null ? "No date" : `Rp ${plain(d.neededSen)}`}</b></div>
            <div className="fy-stat"><small>Your pace</small><b data-testid="goal-pace" style={{ color: s.good ? undefined : "var(--warn-text, #b45309)" }}>{d.paceMonths ? `Rp ${plain(d.paceSen)}` : "–"}</b></div>
          </div>
          <div className="extra"><span data-testid="goal-reach">{d.reached ? "Reached 🎉" : d.reachedAtPace ? <>At your pace you reach it by <b>{mon(d.reachedAtPace)}</b>{d.byMonth && d.reachedAtPace > d.byMonth ? `, after ${mon(d.byMonth)}` : d.byMonth ? `, before ${mon(d.byMonth)}` : ""}</> : d.paceMonths ? "Not growing yet at your pace" : "Your pace shows after a month-end"}</span></div>
        </div>
        <div className="fy-card fy-pad" style={{ marginTop: 12 }} data-testid="goal-chart"><Chart d={d} /></div>
        {d.kind === "save" && <>
          <div className="fy-section"><span>Where it&apos;s saved</span><button className="fy-linkish" style={{ color: "var(--primary-text)", fontWeight: 700 }} onClick={() => setEdit(true)}>Edit</button></div>
          <div className="fy-list" data-testid="goal-sources">{d.sources.map((x) => (
            <div className="fy-row" key={x.accountId}><Tile color={x.type === "investment" ? "lavender" : "sky"}>{x.type === "investment" ? <PiggyBank size={18} /> : x.type === "ewallet" ? <Wallet size={18} /> : <Landmark size={18} />}</Tile>
              <div className="main"><div className="t">{x.name}</div><div className="s">{x.partSen == null ? "all of it" : `${plain(x.amountSen)} of ${plain(x.valueSen)}`}</div></div><span className="fy-amt">{plain(x.amountSen)}</span></div>))}</div>
        </>}
        {msg && <div className="fy-ok" role="status" style={{ marginTop: 10 }}><Check size={16} /> {msg}</div>}
        {d.neededSen ? <button className="fy-btn block" style={{ marginTop: 12 }} onClick={toBudget}><PiggyBank size={16} />Add Rp {plain(d.neededSen)} to this month&apos;s budget</button> : null}
      </>}
      {edit && d && <GoalSheet goal={d} candidates={cands} onClose={() => setEdit(false)} onSaved={(g) => { setD({ ...d, ...g }); setEdit(false); }} onDeleted={() => router.push("/assets/goals")} />}
    </>
  );
}

/** Assets: the Goals row. */
export function GoalsRow() {
  const { data } = useGoals();
  const n = data?.goals.length ?? 0;
  return (
    <Link className="fy-row" href="/assets/goals" data-testid="goals-row"><Tile color="lavender"><Gem size={18} /></Tile>
      <div className="main"><div className="t">Goals</div><div className="s">{data ? (n ? `${n} goal${n === 1 ? "" : "s"} · ${data.goals.filter((g) => g.onTrack).length} on track` : "Aim your money somewhere") : ""}</div></div><ChevronRight className="chev" size={18} /></Link>
  );
}
