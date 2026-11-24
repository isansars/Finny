"use client";
// Assets and investments (FINNY-96/97), as approved in "Sprint 8 · Design notes (assets and investments)": net worth with
// everything, investments with profit and loss, one sheet to update values, and property, vehicles and business stakes.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bike, Briefcase, ChevronLeft, ChevronRight, Coins, Gem, House, Landmark, Laptop, Package, Pencil, PiggyBank, Plus, TrendingUp, CreditCard, Settings2, ShieldCheck } from "lucide-react";
import { api, useFinny } from "./store";
import { GoalsRow } from "./Goals";
import { DateField, Sheet } from "./ui";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { shortDate, todayIn } from "@/lib/dates";
import { thingAt, type Thing } from "@/lib/asset-rule";

type Holding = { id: string; name: string; kind: string; investedSen: number; valueSen: number; plSen: number; plPct: number; valuedOn: string | null; interestSen: number; accruedSen: number; rateBp: number | null; maturityOn: string | null; fixed: boolean };
type G = { sen: number; costSen: number; count: number };
type Overview = { today: string; groups: Record<"cash" | "investments" | "fixed" | "things" | "business" | "other", G>; haveSen: number; oweSen: number; netSen: number; changeSen: number;
  holdings: Holding[]; things: (Thing & { worthSen: number; myCostSen: number })[]; lastValued: string | null };

const plain = (sen: number) => formatRupiah(sen, { prefix: false });
const signed = (sen: number) => `${sen >= 0 ? "+" : "−"}Rp ${plain(Math.abs(sen))}`;
const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toLocaleString("id-ID")}%`;
const COLORS: Record<string, string> = { cash: "#38bdf8", investments: "#f472b6", fixed: "#a78bfa", things: "#fbbf24", business: "#34d399", other: "#94a3b8" };
const LABEL: Record<string, string> = { cash: "Cash & bank", investments: "Investments", fixed: "Fixed income", things: "Property & vehicles", business: "Business", other: "Other" };
const KIND_LABEL: Record<string, string> = { stock: "Stock", fund: "Mutual fund", crypto: "Crypto", gold: "Gold", bond: "Bond", deposit: "Deposit", p2p: "P2P lending", other: "Investment" };
const THING_LABEL: Record<string, string> = { property: "Property", vehicle: "Vehicle", equipment: "Equipment", personal: "Personal", business: "Business", other: "Other" };
const THING_ICON: Record<string, React.ReactNode> = { property: <House size={18} />, vehicle: <Bike size={18} />, equipment: <Laptop size={18} />, personal: <Gem size={18} />, business: <Briefcase size={18} />, other: <Package size={18} /> };
const tile = (color: string, icon: React.ReactNode) => <span className="fy-tile" data-color={color} style={{ width: 32, height: 32, borderRadius: 10 }}>{icon}</span>;

function useOverview() {
  const { version } = useFinny();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => { let live = true; api<Overview>("assets").then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => { if (live) setErr(e.message); }); return () => { live = false; }; }, [version, tick]);
  return { data, setData, err, reload: () => setTick((t) => t + 1) };
}

// ---------------------------------------------------------------- overview

export function Assets() {
  const { data, err } = useOverview();
  const { version } = useFinny();
  const [ef, setEf] = useState<{ configured: boolean; pct: number; targetSen: number; setAsideSen: number } | null>(null);
  useEffect(() => { let live = true; api<{ configured: boolean; pct: number; targetSen: number; setAsideSen: number }>("emergency").then((d) => { if (live) setEf(d); }).catch(() => {}); return () => { live = false; }; }, [version]);
  const order = ["cash", "investments", "fixed", "things", "business", "other"] as const;
  const total = data ? order.reduce((n, k) => n + Math.max(0, data.groups[k].sen), 0) || 1 : 1;
  const sub = (k: (typeof order)[number]) => {
    if (!data) return "";
    const g = data.groups[k], n = g.count;
    if (k === "cash") return `${n} account${n === 1 ? "" : "s"}`;
    if (k === "investments") return [...new Set(data.holdings.filter((h) => !h.fixed).map((h) => KIND_LABEL[h.kind]))].join(", ") + ` · ${n}`;
    if (k === "fixed") return [...new Set(data.holdings.filter((h) => h.fixed).map((h) => KIND_LABEL[h.kind]))].join(", ") + ` · ${n}`;
    if (k === "business") return data.things.filter((t) => t.kind === "business" && t.worthSen).map((t) => `${t.name} (${t.shareBp / 100}%)`).join(", ");
    return data.things.filter((t) => t.kind !== "business" && t.worthSen).map((t) => t.name).join(", ") + ` · ${n}`;
  };
  const gain = (k: (typeof order)[number]) => {
    if (!data || k === "cash" || k === "other") return null;
    const g = data.groups[k]; const d = g.sen - g.costSen; if (!g.count || !d) return null;
    if (k === "fixed") { const i = data.holdings.filter((h) => h.fixed).reduce((n, h) => n + h.interestSen + h.accruedSen, 0); return i ? { text: `+Rp ${plain(i)} interest`, up: true } : null; }
    return { text: `${signed(d)} (${pct(Math.round((d / (g.costSen || 1)) * 1000) / 10)})`, up: d >= 0 };
  };
  const href = (k: string) => (k === "cash" ? "/accounts" : k === "investments" || k === "fixed" ? "/assets/investments" : "/assets/things");
  return (
    <>
      <Link className="fy-back" href="/accounts"><ChevronLeft size={20} />Accounts</Link>
      <div className="fy-large"><div><div className="sub">Accounts</div><h1>Assets</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-hero" data-testid="worth">
        <div className="lbl">Net worth · everything you have, minus what you owe</div>
        <div className="big" style={{ marginBottom: 4 }}>{data ? formatRupiah(data.netSen) : <span className="fy-skel" style={{ width: "7em" }} />}</div>
        {data && <div className="fy-hint" style={{ margin: "0 0 4px", fontWeight: 800, color: data.changeSen >= 0 ? "var(--income)" : "var(--spend)" }}>{data.changeSen >= 0 ? "▲" : "▼"} {formatRupiah(Math.abs(data.changeSen))} since last month</div>}
        {data && <div className="fy-alloc" role="img" aria-label="How your assets are split">{order.filter((k) => data.groups[k].sen > 0).map((k) => <i key={k} style={{ width: `${(data.groups[k].sen / total) * 100}%`, background: COLORS[k] }} />)}</div>}
        {data && <div className="fy-key">{order.filter((k) => data.groups[k].sen > 0).map((k) => <span key={k}><i style={{ background: COLORS[k] }} />{LABEL[k]} {Math.round((data.groups[k].sen / total) * 100)}%</span>)}</div>}
      </div>
      <div className="fy-section"><span>What you have</span><span className="num">{data ? formatRupiah(data.haveSen) : ""}</span></div>
      <div className="fy-list" data-testid="groups">
        {data && order.filter((k) => data.groups[k].count || k === "cash").map((k) => { const g = gain(k); return (
          <Link className="fy-row" key={k} href={href(k)} data-testid={`group-${k}`}>
            {tile({ cash: "sky", investments: "pink", fixed: "lavender", things: "lemon", business: "mint", other: "slate" }[k], { cash: <Landmark size={18} />, investments: <TrendingUp size={18} />, fixed: <PiggyBank size={18} />, things: <Bike size={18} />, business: <Briefcase size={18} />, other: <Coins size={18} /> }[k])}
            <div className="main"><div className="t">{LABEL[k]}</div><div className="s">{sub(k)}</div>{g && <div className="s" style={{ fontWeight: 800, color: g.up ? "var(--income)" : "var(--spend)" }}>{g.text}</div>}</div>
            <span className="fy-amt">{plain(data.groups[k].sen)}</span><ChevronRight className="chev" size={18} />
          </Link>); })}
      </div>
      <div className="fy-section"><span>What you owe</span><span className="num">{data ? formatRupiah(data.oweSen) : ""}</span></div>
      <div className="fy-list"><Link className="fy-row" href="/debts">{tile("peach", <CreditCard size={18} />)}<div className="main"><div className="t">Debts</div><div className="s">Cards and loans</div></div><span className="fy-amt">{data ? plain(data.oweSen) : ""}</span><ChevronRight className="chev" size={18} /></Link></div>
      <div className="fy-section"><span>Safety net and goals</span></div>
      <div className="fy-list"><GoalsRow /><Link className="fy-row" href="/assets/emergency" data-testid="ef-row">{tile("mint", <ShieldCheck size={18} />)}<div className="main"><div className="t">Emergency fund</div><div className="s">{ef ? (ef.configured ? `${ef.pct}% of ${formatRupiah(ef.targetSen)}` : "Set your target") : ""}</div></div><span className="fy-amt">{ef?.configured ? plain(ef.setAsideSen) : ""}</span><ChevronRight className="chev" size={18} /></Link></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <Link className="fy-btn" href="/assets/investments"><TrendingUp size={16} />Investments</Link>
        <Link className="fy-btn" href="/assets/things"><Bike size={16} />Property &amp; vehicles</Link>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- investments

export function Investments() {
  const { data, setData, err, reload } = useOverview();
  const [update, setUpdate] = useState(false);
  const [setup, setSetup] = useState<Holding | null>(null);
  const vary = data?.holdings.filter((h) => !h.fixed) ?? [], fixed = data?.holdings.filter((h) => h.fixed) ?? [];
  const value = vary.reduce((n, h) => n + h.valueSen, 0), invested = vary.reduce((n, h) => n + h.investedSen, 0);
  const row = (h: Holding) => (
    <button className="fy-row" key={h.id} onClick={() => setSetup(h)} data-testid={`holding-${h.name}`}>
      {tile(h.fixed ? "lavender" : h.kind === "gold" || h.kind === "crypto" ? "lemon" : "pink", h.fixed ? <PiggyBank size={18} /> : h.kind === "gold" || h.kind === "crypto" ? <Coins size={18} /> : <TrendingUp size={18} />)}
      <div className="main"><div className="t">{h.name}</div><div className="s">{h.fixed ? `${h.rateBp ? `${(h.rateBp / 100).toLocaleString("id-ID")}% a year` : "Rate not set"}${h.maturityOn ? ` · matures ${shortDate(h.maturityOn)}` : ""}` : `${KIND_LABEL[h.kind]}${h.valuedOn ? ` · valued ${shortDate(h.valuedOn).replace(/ \d{4}$/, "")}` : " · not valued yet"}`}</div></div>
      <div style={{ textAlign: "right", flex: "none" }}><div className="fy-amt">{plain(h.fixed ? h.investedSen : h.valueSen)}</div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: (h.fixed ? h.interestSen + h.accruedSen : h.plSen) >= 0 ? "var(--income)" : "var(--spend)" }}>{h.fixed ? `+${plain(h.interestSen + h.accruedSen)}` : h.valuedOn && h.investedSen ? pct(h.plPct) : ""}</div></div>
    </button>
  );
  return (
    <>
      <Link className="fy-back" href="/assets"><ChevronLeft size={20} />Assets</Link>
      <div className="fy-large"><div><div className="sub">Assets</div><h1>Investments</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-hero" data-testid="inv-hero">
        <div className="lbl">Market value{data?.lastValued ? ` · updated ${shortDate(data.lastValued).replace(/ \d{4}$/, "")}` : ""}</div>
        <div className="big" style={{ marginBottom: 8 }}>{data ? formatRupiah(value) : <span className="fy-skel" />}</div>
        <div className="stats"><div className="fy-stat"><small>Invested</small><b>{data ? formatRupiah(invested) : "…"}</b></div>
          <div className="fy-stat"><small>Profit / loss</small><b data-testid="inv-pl" style={{ color: value - invested >= 0 ? "var(--income)" : "var(--spend)" }}>{data ? signed(value - invested) : "…"}</b></div></div>
      </div>
      {vary.length > 0 && <button className="fy-btn primary block" style={{ marginTop: 12 }} onClick={() => setUpdate(true)}><Pencil size={16} />Update values</button>}
      {data && !data.holdings.length && <div className="fy-card fy-empty" style={{ marginTop: 12 }}><b>No investments yet</b>Add an account of type Investment under Accounts (e.g. &quot;Reksadana Saham&quot;), move money into it, then tap it here to say what it holds.</div>}
      {vary.length > 0 && <><div className="fy-section"><span>Holdings</span><span>value · P/L</span></div><div className="fy-list" data-testid="holdings">{vary.map(row)}</div></>}
      {fixed.length > 0 && <><div className="fy-section"><span>Fixed income</span><span>principal · interest</span></div><div className="fy-list" data-testid="fixed">{fixed.map(row)}</div></>}
      {update && data && <UpdateValues holdings={vary} onClose={() => setUpdate(false)} onSaved={(d) => { setData(d); setUpdate(false); }} />}
      {setup && <HoldingSheet h={setup} onClose={() => setSetup(null)} onSaved={() => { setSetup(null); reload(); }} />}
    </>
  );
}

function UpdateValues({ holdings, onClose, onSaved }: { holdings: Holding[]; onClose: () => void; onSaved: (d: Overview) => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [on, setOn] = useState(todayIn());
  const [err, setErr] = useState("");
  const n = Object.values(vals).filter((v) => v.trim() && parseRupiah(v) !== null).length;
  async function save() {
    try { onSaved(await api<Overview>("assets/values", { method: "POST", json: { on, values: Object.entries(vals).map(([accountId, value]) => ({ accountId, value })) } })); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Sheet title="Update values" onClose={onClose}>
      <div className="fy-hint" style={{ margin: "0 0 10px" }}>Today&apos;s market value for each holding, from your app or the price × what you hold. Leave one blank to keep its last value.</div>
      <div className="fy-list" style={{ marginBottom: 12 }}>
        {holdings.map((h) => (
          <div className="fy-row" key={h.id} style={{ gap: 10 }}><div className="main"><div className="t">{h.name}</div><div className="s">Last: {plain(h.valueSen)}{h.valuedOn ? ` · ${shortDate(h.valuedOn).replace(/ \d{4}$/, "")}` : " · what you put in"}</div></div>
            <input className="fy-input" inputMode="decimal" aria-label={`Value of ${h.name}`} value={vals[h.id] ?? ""} onChange={(e) => setVals({ ...vals, [h.id]: e.target.value })} style={{ width: 132, flex: "none", textAlign: "right", fontWeight: 800 }} /></div>
        ))}
      </div>
      <label className="fy-field"><span className="fy-label">Valued on</span><DateField value={on} onChange={setOn} label="Valued on" /></label>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" disabled={!n} onClick={save}>Save {n} value{n === 1 ? "" : "s"}</button></div>
    </Sheet>
  );
}

function HoldingSheet({ h, onClose, onSaved }: { h: Holding; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState(h.kind);
  const [rate, setRate] = useState(h.rateBp != null ? (h.rateBp / 100).toLocaleString("id-ID") : "");
  const [maturity, setMaturity] = useState(h.maturityOn ?? "");
  const [err, setErr] = useState("");
  const fixed = ["bond", "deposit", "p2p"].includes(kind);
  async function save() {
    try { await api(`accounts/${h.id}/holding`, { method: "PUT", json: { kind, ...(fixed ? { rate, maturityOn: maturity || null } : { rate: "", maturityOn: null }) } }); onSaved(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Sheet title={h.name} onClose={onClose}>
      <div className="fy-hint" style={{ margin: "0 0 10px" }}>Put in {formatRupiah(h.investedSen)}{h.fixed ? `; interest so far ${formatRupiah(h.interestSen + h.accruedSen)}` : `; worth ${formatRupiah(h.valueSen)} (${pct(h.plPct)})`}.</div>
      <label className="fy-field"><span className="fy-label">What it holds</span>
        <select className="fy-input" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="What it holds">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l === "Investment" ? "Something else" : l}</option>)}</select></label>
      {fixed && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="fy-field"><span className="fy-label">Rate a year (%)</span><input className="fy-input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="6,5" aria-label="Rate a year" /></label>
        <label className="fy-field"><span className="fy-label">Matures</span><input className="fy-input" type="date" value={maturity} onChange={(e) => setMaturity(e.target.value)} aria-label="Matures" /></label></div>}
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" onClick={save}><Settings2 size={16} />Save</button></div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- things

export function Things() {
  const { data, err, reload } = useOverview();
  const [edit, setEdit] = useState<Partial<Thing> | null>(null);
  const items = data?.things ?? [];
  const live = items.filter((t) => !t.soldOn), sold = items.filter((t) => t.soldOn);
  const row = (t: Overview["things"][number]) => {
    const d = t.worthSen - t.myCostSen;
    return (
      <Link className="fy-row" key={t.id} href={`/assets/things/${t.id}`} data-testid={`thing-${t.name}`}>
        {tile(t.kind === "business" ? "mint" : "lemon", THING_ICON[t.kind])}
        <div className="main"><div className="t">{t.name}</div><div className="s">{THING_LABEL[t.kind]}{t.kind === "business" ? ` · your ${t.shareBp / 100}%` : ""}{t.soldOn ? ` · sold ${shortDate(t.soldOn)}` : ""}</div></div>
        <div style={{ textAlign: "right", flex: "none" }}><div className="fy-amt">{plain(t.worthSen)}</div>{!t.soldOn && d !== 0 && <div style={{ fontSize: 12.5, fontWeight: 800, color: d >= 0 ? "var(--income)" : "var(--spend)" }}>{signed(d)}</div>}</div>
        <ChevronRight className="chev" size={18} />
      </Link>
    );
  };
  return (
    <>
      <Link className="fy-back" href="/assets"><ChevronLeft size={20} />Assets</Link>
      <div className="fy-large"><div><div className="sub">Assets</div><h1>Property &amp; vehicles</h1></div><button className="fy-btn primary small" onClick={() => setEdit({})} aria-label="Add a thing"><Plus size={16} />Add</button></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {data && !items.length && <div className="fy-card fy-empty" style={{ marginTop: 12 }}><b>Nothing here yet</b>Add your home, a motorbike, a laptop or a share in a business: what it cost, when, and how much it gains or loses a year.</div>}
      {live.length > 0 && <div className="fy-list" data-testid="things">{live.map(row)}</div>}
      {sold.length > 0 && <><div className="fy-section"><span>Sold</span></div><div className="fy-list">{sold.map(row)}</div></>}
      {edit && <ThingSheet t={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

const TYPICAL: Record<string, string> = { property: "3", vehicle: "-12", equipment: "-20", personal: "0", business: "0", other: "0" };
function ThingSheet({ t, onClose, onSaved }: { t: Partial<Thing>; onClose: () => void; onSaved: () => void }) {
  const isNew = !t.id;
  const [name, setName] = useState(t.name ?? "");
  const [kind, setKind] = useState(t.kind ?? "vehicle");
  const [boughtOn, setBoughtOn] = useState(t.boughtOn ?? todayIn());
  const [cost, setCost] = useState(t.costSen != null ? plain(t.costSen) : "");
  const [yearly, setYearly] = useState(t.yearlyBp != null ? String(t.yearlyBp / 100).replace(".", ",") : TYPICAL.vehicle);
  const [share, setShare] = useState(t.shareBp != null ? String(t.shareBp / 100).replace(".", ",") : "100");
  const [value, setValue] = useState(t.valueSen != null ? plain(t.valueSen) : "");
  const [valueOn, setValueOn] = useState(t.valueOn ?? todayIn());
  const [err, setErr] = useState("");
  async function save(extra: Record<string, unknown> = {}) {
    try {
      const body = { name, kind, boughtOn, cost, yearly, share: kind === "business" ? share : "100", value, valueOn, ...extra };
      await api(isNew ? "things" : `things/${t.id}`, { method: isNew ? "POST" : "PATCH", json: body }); onSaved();
    } catch (e) { setErr((e as Error).message); }
  }
  async function remove() { if (!confirm(`Delete ${t.name}?`)) return; try { await api(`things/${t.id}`, { method: "DELETE" }); onSaved(); } catch (e) { setErr((e as Error).message); } }
  return (
    <Sheet title={isNew ? "Add a thing" : t.name ?? ""} onClose={onClose}>
      <label className="fy-field"><span className="fy-label">Name</span><input className="fy-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Motor (Vario 160)" aria-label="Name" /></label>
      <label className="fy-field"><span className="fy-label">Kind</span><select className="fy-input" value={kind} aria-label="Kind" onChange={(e) => { setKind(e.target.value); if (isNew) setYearly(TYPICAL[e.target.value]); }}>{Object.entries(THING_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="fy-field"><span className="fy-label">{kind === "business" ? "Put in (Rp)" : "Bought for (Rp)"}</span><input className="fy-input" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} aria-label="Bought for" /></label>
        <label className="fy-field"><span className="fy-label">When</span><DateField value={boughtOn} onChange={setBoughtOn} label="Bought on" /></label></div>
      <div style={{ display: "grid", gridTemplateColumns: kind === "business" ? "1fr 1fr" : "1fr", gap: 8 }}>
        <label className="fy-field"><span className="fy-label">Gains (+) or loses (−) a year, %</span><input className="fy-input" inputMode="decimal" value={yearly} onChange={(e) => setYearly(e.target.value)} aria-label="Yearly change" /></label>
        {kind === "business" && <label className="fy-field"><span className="fy-label">Your share, %</span><input className="fy-input" inputMode="decimal" value={share} onChange={(e) => setShare(e.target.value)} aria-label="Your share" /></label>}</div>
      <div className="fy-subhead"><span>Or set what it&apos;s worth (e.g. from a price check)</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="fy-field"><span className="fy-label">{kind === "business" ? "Whole business worth (Rp)" : "Worth (Rp)"}</span><input className="fy-input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Optional" aria-label="Worth" /></label>
        <label className="fy-field"><span className="fy-label">On</span><DateField value={valueOn} onChange={setValueOn} label="Worth on" /></label></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" onClick={() => save()}>{isNew ? "Add" : "Save"}</button>
      {!isNew && !t.soldOn && <button className="fy-btn block" style={{ marginTop: 8 }} onClick={() => save({ soldOn: todayIn() })}>Mark sold today</button>}
      {!isNew && <button className="fy-btn danger block" style={{ marginTop: 8 }} onClick={remove}>Delete</button>}</div>
    </Sheet>
  );
}

function WorthLine({ t, today }: { t: Thing; today: string }) {
  const start = t.boughtOn, end = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  const n = 24, span = Date.parse(end) - Date.parse(start);
  const pts = Array.from({ length: n + 1 }, (_, i) => new Date(Date.parse(start) + (span * i) / n).toISOString().slice(0, 10)).map((d) => ({ d, v: thingAt({ ...t, soldOn: null }, d) }));
  const max = Math.max(1, ...pts.map((p) => p.v)), min = Math.min(...pts.map((p) => p.v));
  const w = 340, h = 100, x = (i: number) => 8 + (i * (w - 16)) / n, y = (v: number) => 8 + (h - 16) * (1 - (v - min) / (max - min || 1));
  const nowI = Math.round(((Date.parse(today) - Date.parse(start)) / span) * n);
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h + 18}`} role="img" aria-label="What it's worth over time" style={{ display: "block" }}>
      <path d={pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {nowI >= 0 && nowI <= n && <circle cx={x(nowI)} cy={y(pts[nowI].v)} r="5" fill="#f59e0b" stroke="#fff" strokeWidth="2" />}
      <text x={8} y={h + 14} fontSize="12" fontWeight="700" fill="var(--text-3)">{shortDate(start)}</text>
      <text x={w - 8} y={h + 14} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--text-3)">{shortDate(end)}</text>
    </svg>
  );
}

export function ThingDetail({ id }: { id: string }) {
  const { data, err, reload } = useOverview();
  const [edit, setEdit] = useState(false);
  const t = data?.things.find((x) => x.id === id);
  const d = t ? t.worthSen - t.myCostSen : 0;
  return (
    <>
      <Link className="fy-back" href="/assets/things"><ChevronLeft size={20} />Property &amp; vehicles</Link>
      <div className="fy-large"><div><div className="sub">{t ? THING_LABEL[t.kind] : "Assets"}</div><h1>{t?.name ?? "…"}</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {data && !t && <div className="fy-err" role="alert">That isn&apos;t here.</div>}
      {t && data && <>
        <div className="fy-hero" data-testid="thing-hero">
          <div className="lbl">{t.soldOn ? `Sold ${shortDate(t.soldOn)}` : t.valueOn && t.valueOn === data.today ? "Worth now" : "Worth now (estimated)"}{t.kind === "business" ? ` · your ${t.shareBp / 100}%` : ""}</div>
          <div className="big" style={{ marginBottom: 4 }}>{formatRupiah(t.worthSen)}</div>
          {!t.soldOn && <div className="fy-hint" style={{ margin: "0 0 6px", fontWeight: 800, color: d >= 0 ? "var(--income)" : "var(--spend)" }}>{signed(d)} since {t.kind === "business" ? "you put it in" : "bought"}</div>}
          <WorthLine t={t} today={data.today} />
        </div>
        <div className="fy-section"><span>Details</span><button className="fy-linkish" style={{ color: "var(--primary-text)", fontWeight: 700 }} onClick={() => setEdit(true)}>Edit</button></div>
        <div className="fy-list" data-testid="thing-details">
          <div className="fy-row">{tile("lemon", THING_ICON[t.kind])}<div className="main"><div className="t">Kind</div></div><span className="fy-amt" style={{ fontSize: 14 }}>{THING_LABEL[t.kind]}</span></div>
          <div className="fy-row">{tile("mint", <Coins size={18} />)}<div className="main"><div className="t">{t.kind === "business" ? "Put in" : "Bought"}</div><div className="s">{shortDate(t.boughtOn)}</div></div><span className="fy-amt" style={{ fontSize: 14 }}>{plain(t.costSen)}</span></div>
          <div className="fy-row">{tile("peach", <TrendingUp size={18} />)}<div className="main"><div className="t">{t.yearlyBp < 0 ? "Loses each year" : "Gains each year"}</div></div><span className="fy-amt" style={{ fontSize: 14 }}>{Math.abs(t.yearlyBp / 100).toLocaleString("id-ID")}%</span></div>
          {t.valueSen != null && <div className="fy-row">{tile("sky", <Pencil size={18} />)}<div className="main"><div className="t">Worth set by you</div><div className="s">{shortDate(t.valueOn!)}; the yearly change carries on from there</div></div><span className="fy-amt" style={{ fontSize: 14 }}>{plain(t.valueSen)}</span></div>}
        </div>
        <div className="fy-hint" style={{ marginTop: 10 }}>Selling it? Record the money as income into the account it goes to, then mark it sold here.</div>
        {edit && <ThingSheet t={t} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); reload(); }} />}
      </>}
    </>
  );
}

