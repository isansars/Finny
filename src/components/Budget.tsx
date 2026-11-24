"use client";
// The month's budget (FINNY-63), as approved in "Sprint 5 · Design notes (budget)": planned, spent so far, left to plan,
// expected income, and every budgeted category with a bar (green, amber from 90%, red over). Tap one to change it.
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Plus, Wand2, Copy } from "lucide-react";
import { BudgetWarning } from "./Review";
import { api, useFinny, type Category } from "./store";
import { CatTile, Tile } from "./icons";
import { AmountInput, CategoryOptions, Sheet } from "./ui";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { monthLabel, todayIn } from "@/lib/dates";
import { MonthNav } from "./MonthPicker";
import type { Line, State } from "@/lib/budget-rule";

export type BudgetMonth = { month: string; daysLeft: number; lines: Line[]; totals: { plannedSen: number; spentSen: number; incomePlanSen: number; leftToPlanSen: number; over: number; close: number; pct: number }; incomeSen: number; incomeEvery: boolean };
type Quick = { lastMonthSen: number; avg3Sen: number; thisMonthSen: number; lastYear: string; lastYearSen: number | null };

export const BAR: Record<State, string> = { ok: "linear-gradient(90deg,#34d399,#10b981)", close: "linear-gradient(90deg,#fbbf24,#f59e0b)", over: "linear-gradient(90deg,#fb7185,#e11d48)" };
const monthName = (m: string) => monthLabel(m).split(" ")[0];
const plain = (sen: number) => formatRupiah(sen, { prefix: false });

export function Bar({ l }: { l: Pick<Line, "pct" | "state"> }) {
  return <div className="fy-bbar" role="progressbar" aria-valuenow={l.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${l.pct}% used`}><i style={{ width: `${Math.min(100, l.pct)}%`, background: BAR[l.state] }} /></div>;
}

export function Budget() {
  const { categories, version, loaded } = useFinny();
  const today = todayIn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [data, setData] = useState<BudgetMonth | null>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<{ categoryId: string | null } | null>(null);
  const [income, setIncome] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { const m = new URLSearchParams(location.search).get("month"); if (m && /^\d{4}-\d{2}$/.test(m)) setMonth(m); }, []);
  useEffect(() => {
    let live = true;
    api<BudgetMonth>(`budgets?month=${month}`).then((d) => { if (live) { setData(d); setErr(""); } }).catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [month, version]);
  const cat = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const t = data?.totals;
  const name = monthName(month);
  const sub = data ? `${monthLabel(month)}${data.daysLeft > 0 && month === today.slice(0, 7) ? ` · ${data.daysLeft} day${data.daysLeft > 1 ? "s" : ""} left` : ""}` : monthLabel(month);
  const status = t ? [t.over ? `${t.over} over` : "", t.close ? `${t.close} close` : ""].filter(Boolean).join(", ") || "All on track" : "";
  return (
    <>
      <div className="fy-large">
        <div><div className="sub" data-testid="budget-sub">{sub}</div><h1>Budget</h1></div>
        <MonthNav month={month} setMonth={setMonth} />
      </div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-hero" data-testid="budget-hero">
        <div className="lbl">Planned for {name}</div>
        <div className="big" style={{ marginBottom: 10 }} data-testid="planned">{t ? formatRupiah(t.plannedSen) : <span className="fy-skel" />}</div>
        <div className="stats">
          <div className="fy-stat"><small>Spent so far</small><b data-testid="spent-so-far">{t ? formatRupiah(t.spentSen) : <span className="fy-skel" />}</b></div>
          <div className="fy-stat"><small>Left to plan</small><b data-testid="left-to-plan" style={{ color: t && t.leftToPlanSen < 0 ? "var(--spend)" : "var(--income)" }}>{t ? formatRupiah(t.leftToPlanSen) : <span className="fy-skel" />}</b></div>
        </div>
        <div className="extra"><button className="fy-linkish" onClick={() => setIncome(true)} data-testid="expected-income">Expected income <b>{t ? (t.incomePlanSen ? formatRupiah(t.incomePlanSen) : "set it") : "…"}</b></button>
          {data && data.incomeSen > 0 && <span>Received <b>{formatRupiah(data.incomeSen)}</b></span>}</div>
      </div>
      {data && !data.lines.length ? (
        <div className="fy-card fy-empty" style={{ marginTop: 12 }} data-testid="budget-empty">
          <Tile icon="pie-chart" color="pink" size={52} /><b>Plan {name}</b>Give your categories a budget for the month. A group&apos;s budget covers everything inside it.
          <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 320, margin: "14px auto 0" }}>
            <button className="fy-btn primary block" onClick={() => setEdit({ categoryId: null })}><Plus size={17} />Budget a category</button>
            <a className="fy-btn block" href="/import"><FileSpreadsheet size={17} />Bring in your workbook budget</a>
          </div>
        </div>
      ) : (<>
        <div className="fy-section"><span>By category</span><span data-testid="budget-status">{status}</span></div>
        <div className="fy-list" data-testid="budget-lines">
          {!data && [0, 1, 2].map((i) => <div className="fy-row" key={i}><span className="fy-skel" style={{ width: "100%", height: 40 }} /></div>)}
          {data?.lines.map((l) => {
            const c = cat.get(l.categoryId); if (!c) return null;
            const parent = c.parentId ? cat.get(c.parentId)?.name : null;
            const left = l.leftSen >= 0 ? `${formatRupiah(l.leftSen)} left` : `${formatRupiah(-l.leftSen)} over`;
            const inside = l.covers.length ? `${l.covers.length} inside` : parent ?? (l.every ? "Every month" : "");
            return (
              <button className="fy-row" key={l.categoryId} onClick={() => setEdit({ categoryId: l.categoryId })} data-testid={`budget-${c.name}`} data-state={l.state} aria-label={`${c.name}: ${plain(l.spentSen)} of ${plain(l.plannedSen)}, ${left}`}>
                <CatTile c={c} />
                <div className="main">
                  <div className="t fy-bline"><span>{c.name}</span><span className="num">{plain(l.spentSen)} <span className="of">/ {plain(l.plannedSen)}</span></span></div>
                  <Bar l={l} />
                  <div className="s">{left}{inside ? ` · ${inside}` : ""}</div>
                </div>
              </button>
            );
          })}
        </div>
        {data && <button className="fy-btn block" style={{ marginTop: 12 }} onClick={() => setEdit({ categoryId: null })}><Plus size={17} />Budget another category</button>}
      </>)}
      {edit && loaded && <BudgetSheet month={month} categoryId={edit.categoryId} data={data} categories={categories} onClose={() => setEdit(null)} onSaved={(d) => { setData(d); setEdit(null); }} />}
      {income && data && <IncomeSheet month={month} data={data} onClose={() => setIncome(false)} onSaved={(d) => { setData(d); setIncome(false); }} />}
    </>
  );
}

type Scope = "one" | "rest" | "every";
function ScopeSeg({ month, scope, setScope }: { month: string; scope: Scope; setScope: (s: Scope) => void }) {
  return (<>
    <div className="fy-subhead"><span>Apply to</span></div>
    <div className="fy-seg" role="radiogroup" aria-label="Apply to" style={{ marginBottom: 14 }}>
      {([["one", `Only ${monthName(month)}`], ["rest", `Rest of ${month.slice(0, 4)}`], ["every", "Every month"]] as [Scope, string][]).map(([s, label]) =>
        <button key={s} type="button" role="radio" aria-checked={scope === s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>{label}</button>)}
    </div>
  </>);
}

function BudgetSheet({ month, categoryId, data, categories, onClose, onSaved }: { month: string; categoryId: string | null; data: BudgetMonth | null; categories: Category[]; onClose: () => void; onSaved: (d: BudgetMonth) => void }) {
  const [id, setId] = useState(categoryId ?? "");
  const line = data?.lines.find((l) => l.categoryId === id);
  const [amount, setAmount] = useState(line ? plain(line.plannedSen) : "");
  const [scope, setScope] = useState<Scope>(line?.every ? "every" : "one");
  const [quick, setQuick] = useState<Quick | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const c = categories.find((x) => x.id === id);
  const parent = c?.parentId ? categories.find((x) => x.id === c.parentId) : null;
  useEffect(() => {
    if (!id) return;
    let live = true;
    api<Quick>(`budgets/quick?categoryId=${id}&month=${month}`).then((q) => { if (live) setQuick(q); }).catch(() => {});
    return () => { live = false; };
  }, [id, month]);
  const sen = parseRupiah(amount);
  async function save(remove = false) {
    setBusy(true); setErr("");
    try { onSaved(await api<BudgetMonth>("budgets", { method: "PUT", json: { categoryId: id, month, scope, ...(remove ? { remove: true } : { amountSen: sen }) } })); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const chip = (label: string, v: number | null | undefined, Icon?: typeof Copy) => v ? <button type="button" className={`fy-chip ${sen === v ? "on" : ""}`} onClick={() => setAmount(plain(v))}>{Icon && <Icon size={15} />}{label} · {plain(v)}</button> : null;
  const taken = new Set((data?.lines ?? []).map((l) => l.categoryId));
  return (
    <Sheet title={c ? c.name : "Budget a category"} label={c ? `Budget for ${c.name}` : "Budget a category"} onClose={onClose}>
      {!categoryId && (
        <label className="fy-field"><span className="fy-label">Category</span>
          <select className="fy-input" value={id} onChange={(e) => { setId(e.target.value); setQuick(null); }} aria-label="Category">
            <option value="">Pick a category…</option>
            <CategoryOptions cats={categories.filter((x) => !taken.has(x.id))} kinds={["expense", "saving", "investment"]} />
          </select></label>
      )}
      {c && <>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}><CatTile c={c} size={44} />
          <div><div style={{ fontWeight: 800 }}>{c.name}</div><div className="fy-hint" style={{ margin: 0 }}>{parent ? `${parent.name} · ` : ""}spent {formatRupiah(line?.spentSen ?? quick?.thisMonthSen ?? 0)} this month{line?.covers.length ? `, with ${line.covers.length} inside` : ""}</div></div></div>
        <div className="fy-amount" style={{ margin: "14px 0 0" }}><small>Rp</small><AmountInput value={amount} onChange={setAmount} label="Budget amount" autoFocus={!line} className="" /></div>
        <div className="fy-hint" style={{ textAlign: "center", margin: "0 0 12px" }}>a month</div>
        {quick && (quick.lastMonthSen || quick.avg3Sen || quick.lastYearSen) ? <>
          <div className="fy-subhead"><span>Quick fill</span></div>
          <div className="fy-chips wrap" style={{ marginBottom: 12 }}>{chip("Last month", quick.lastMonthSen, Copy)}{chip("3-month average", quick.avg3Sen, Wand2)}{chip(`Budget ${quick.lastYear}`, quick.lastYearSen)}</div>
        </> : null}
        <ScopeSeg month={month} scope={scope} setScope={setScope} />
        {err && <div className="fy-err" role="alert">{err}</div>}
        <div className="fy-sheet-foot"><button className="fy-btn primary block" disabled={!sen || busy} onClick={() => save()}>Save budget</button></div>
        {line && <button className="fy-btn block danger" style={{ marginTop: 8 }} disabled={busy} onClick={() => save(true)}>Remove budget</button>}
      </>}
    </Sheet>
  );
}

function IncomeSheet({ month, data, onClose, onSaved }: { month: string; data: BudgetMonth; onClose: () => void; onSaved: (d: BudgetMonth) => void }) {
  const [amount, setAmount] = useState(data.totals.incomePlanSen ? plain(data.totals.incomePlanSen) : "");
  const [scope, setScope] = useState<Scope>(data.incomeEvery ? "every" : "one");
  const [err, setErr] = useState("");
  const sen = parseRupiah(amount);
  async function save() {
    try { onSaved(await api<BudgetMonth>("budgets/income", { method: "PUT", json: { month, scope, amountSen: sen ?? 0 } })); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <Sheet title="Expected income" onClose={onClose}>
      <div className="fy-hint" style={{ textAlign: "center", margin: "0 0 4px" }}>What you expect to receive in {monthName(month)}: your salary and anything regular.</div>
      <div className="fy-amount" style={{ margin: "10px 0 12px" }}><small>Rp</small><AmountInput value={amount} onChange={setAmount} label="Expected income" autoFocus className="" /></div>
      <ScopeSeg month={month} scope={scope} setScope={setScope} />
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" disabled={sen === null} onClick={save}>Save expected income</button></div>
    </Sheet>
  );
}

/** Home's Budget card (FINNY-64): the top budgeted categories and % used, linking to Budget. */
export function BudgetCard({ month }: { month: string }) {
  const { categories, version } = useFinny();
  const [data, setData] = useState<BudgetMonth | null>(null);
  useEffect(() => {
    let live = true;
    api<BudgetMonth>(`budgets?month=${month}`).then((d) => { if (live) setData(d); }).catch(() => {});
    return () => { live = false; };
  }, [month, version]);
  if (!data?.lines.length) return null;
  const name = (id: string) => categories.find((c) => c.id === id)?.name ?? "";
  const thisMonth = month === todayIn().slice(0, 7);
  return (
    <div className="fy-card fy-pad" style={{ marginTop: 12 }} data-testid="budget-card">
      <div className="fy-section" style={{ margin: "0 0 10px" }}><span>Budget</span><span>{data.totals.pct}% used{thisMonth && data.daysLeft ? ` · ${data.daysLeft} day${data.daysLeft > 1 ? "s" : ""} left` : ""}</span></div>
      {thisMonth && <BudgetWarning lines={data.lines} daysLeft={data.daysLeft} name={name} />}
      {data.lines.slice(0, 4).map((l) => (
        <div key={l.categoryId} style={{ marginBottom: 10 }}>
          <div className="fy-bline" style={{ fontWeight: 700, fontSize: 14 }}><span>{name(l.categoryId)}</span><span className="num">{l.pct}%</span></div>
          <Bar l={l} />
        </div>
      ))}
      <a className="fy-more" style={{ padding: 0 }} href={`/budget?month=${month}`}>See the whole budget ›</a>
    </div>
  );
}
