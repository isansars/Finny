"use client";
// Recurring transactions (FINNY-143), as approved in "Sprint 14 · Design notes (recurring transactions, approved)":
// Due today and Coming up on Home, Settings › Recurring, the sheet, and suggestions from the history.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Plus, Repeat, Sparkles, X } from "lucide-react";
import { api, useFinny } from "./store";
import { Sheet } from "./ui";
import { CatTile, Tile } from "./icons";
import { CategoryPicker, AccountChips } from "./QuickAdd";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { dayLabel, shortDate, todayIn } from "@/lib/dates";
import { daysOf, nextDay, type Every } from "@/lib/recurring-rule";

type Kind = "spend" | "income" | "transfer";
export type Item = { id: string; name: string; kind: Kind; amountSen: number | null; accountId: string; toAccountId: string | null; categoryId: string | null; every: Every; anchorOn: string; endOn: string | null; nextOn: string | null; lastAmountSen: number | null };
type Suggestion = { key: string; name: string; kind: "spend" | "income"; amountSen: number; accountId: string; categoryId: string | null; day: number; months: number; lastOn: string };
type List = { today: string; items: Item[]; perMonth: { inSen: number; outSen: number }; suggestions: Suggestion[] };
type Due = { today: string; due: { id: string; dueOn: string; name: string; kind: Kind; amountSen: number | null; accountId: string; toAccountId: string | null; categoryId: string | null; every: Every }[];
  coming: { id: string; on: string; name: string; kind: Kind; amountSen: number | null; accountId: string; toAccountId: string | null }[] };

const plain = (sen: number) => formatRupiah(sen, { prefix: false });
const signed = (kind: Kind, sen: number) => (kind === "income" ? `+${plain(sen)}` : kind === "spend" ? `−${plain(sen)}` : plain(sen));
const cls = (kind: Kind) => (kind === "income" ? "income" : kind === "spend" ? "spend" : "");
const nth = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function howOften(every: Every, anchorOn: string) {
  const d = new Date(anchorOn + "T00:00:00Z");
  if (every === "week") return `every ${WEEKDAYS[d.getUTCDay()]}`;
  if (every === "year") return `every year on ${shortDate(anchorOn).replace(/ \d{4}$/, "")}`;
  return `every month on the ${nth(d.getUTCDate())}`;
}

function useAccName() {
  const { accounts } = useFinny();
  return (id: string | null) => accounts.find((a) => a.id === id)?.name ?? "";
}
function ItemTile({ kind, categoryId }: { kind: Kind; categoryId: string | null }) {
  const { categories } = useFinny();
  const c = categories.find((x) => x.id === categoryId);
  return c ? <CatTile c={c} /> : <Tile icon={kind === "transfer" ? "arrow-left-right" : "repeat"} color="lavender" />;
}

// ---------------------------------------------------------------- Home

/** Home: what's due today (and missed since), and the next 7 days. Nothing is added without a tap. */
export function DueToday() {
  const { version, reload } = useFinny();
  const acc = useAccName();
  const [d, setD] = useState<Due | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; api<Due>("recurring/due").then((x) => { if (live) setD(x); }).catch(() => {}); return () => { live = false; }; }, [version]);
  if (!d || (!d.due.length && !d.coming.length)) return null;
  const k = (x: { id: string; dueOn: string }) => `${x.id}|${x.dueOn}`;
  async function act(list: Due["due"], how: "add" | "skip") {
    setErr(""); setBusy(true);
    try {
      for (const x of list) await api(`recurring/${x.id}/${how}`, { method: "POST", json: { dueOn: x.dueOn, amount: x.amountSen == null ? amounts[k(x)] : undefined } });
    } catch (e) { setErr((e as Error).message); }
    setBusy(false); await reload();
  }
  const ready = d.due.filter((x) => x.amountSen != null);
  return (
    <>
      {d.due.length > 0 && <div className="fy-card fy-rc-due" data-testid="rc-due">
        <div className="fy-rc-head"><b><Repeat size={16} /> Due{d.due.every((x) => x.dueOn === d.today) ? " today" : ""} · {d.due.length}</b>
          {ready.length > 1 && <button className="fy-linkish" style={{ color: "var(--primary-text)", fontWeight: 800 }} disabled={busy} onClick={() => act(ready, "add")}>Add all {ready.length}</button>}</div>
        {err && <div className="fy-err" role="alert" style={{ margin: "0 12px 8px" }}>{err}</div>}
        {d.due.map((x) => (
          <div className="fy-row" key={k(x)} data-testid={`rc-due-${x.name}`}>
            <ItemTile kind={x.kind} categoryId={x.categoryId} />
            <div className="main"><div className="t">{x.name}</div><div className="s">{x.dueOn === d.today ? "" : `${dayLabel(x.dueOn, d.today)} · `}{x.kind === "transfer" ? `${acc(x.accountId)} → ${acc(x.toAccountId)}` : acc(x.accountId)}</div>
              {x.amountSen == null && <input className="fy-input" inputMode="decimal" placeholder="Amount (Rp)" aria-label={`Amount for ${x.name}`} value={amounts[k(x)] ?? ""} onChange={(e) => setAmounts({ ...amounts, [k(x)]: e.target.value })} style={{ marginTop: 6, minHeight: 40, fontWeight: 800, width: "100%" }} />}</div>
            <div style={{ textAlign: "right", flex: "none" }}>
              {x.amountSen != null && <div className={`fy-amt ${cls(x.kind)}`}>{signed(x.kind, x.amountSen)}</div>}
              <div className="fy-rc-acts">
                <button className="fy-chip" disabled={busy} onClick={() => act([x], "skip")} aria-label={`Skip ${x.name}`}>Skip</button>
                <button className="fy-chip on" disabled={busy || (x.amountSen == null && !parseRupiah(amounts[k(x)] ?? ""))} onClick={() => act([x], "add")} aria-label={`Add ${x.name}`}><Check size={13} /> Add</button>
              </div>
            </div>
          </div>
        ))}
      </div>}
      {d.coming.length > 0 && <>
        <div className="fy-section"><span>Coming up</span><span>next 7 days</span></div>
        <div className="fy-list" data-testid="rc-coming">{d.coming.map((x) => (
          <div className="fy-row" key={`${x.id}|${x.on}`}><ItemTile kind={x.kind} categoryId={null} />
            <div className="main"><div className="t">{x.name}</div><div className="s">{dayLabel(x.on, d.today)} · {x.kind === "transfer" ? `${acc(x.accountId)} → ${acc(x.toAccountId)}` : acc(x.accountId)}</div></div>
            <span className={`fy-amt ${cls(x.kind)}`}>{x.amountSen == null ? "changes" : signed(x.kind, x.amountSen)}</span></div>))}</div>
      </>}
    </>
  );
}

// ---------------------------------------------------------------- the sheet

export type Draft = Partial<Omit<Item, "id" | "nextOn" | "lastAmountSen">>;
export function RecurringSheet({ item, draft, onClose, onSaved }: { item?: Item; draft?: Draft; onClose: () => void; onSaved: () => void }) {
  const { accounts, categories } = useFinny();
  const start = item ?? draft ?? {};
  const today = todayIn();
  const [kind, setKind] = useState<Kind>(start.kind ?? "spend");
  const [name, setName] = useState(start.name ?? "");
  const [changes, setChanges] = useState(item ? item.amountSen == null : false);
  const [amount, setAmount] = useState(start.amountSen != null ? plain(start.amountSen) : "");
  const [accountId, setAccountId] = useState(start.accountId ?? accounts.find((a) => !a.archived)?.id ?? "");
  const [toAccountId, setTo] = useState(start.toAccountId ?? "");
  const [categoryId, setCat] = useState(start.categoryId ?? "");
  const [every, setEvery] = useState<Every>(start.every ?? "month");
  const [anchorOn, setAnchor] = useState(start.anchorOn ?? today);
  const [err, setErr] = useState("");
  const open = accounts.filter((a) => !a.archived);
  const cats = categories.filter((c) => c.active && (kind === "income" ? c.kind === "income" : c.kind !== "income"));
  const rule = { every, anchorOn, endOn: null };
  const next = /^\d{4}-\d{2}-\d{2}$/.test(anchorOn) ? (daysOf(rule, today, today)[0] ?? nextDay(rule, today)) : null;
  async function save() {
    setErr("");
    const json = { name, kind, amount: changes ? null : amount, accountId, toAccountId: kind === "transfer" ? toAccountId : null, categoryId: kind === "transfer" ? null : categoryId, every, anchorOn };
    try { await api(item ? `recurring/${item.id}` : "recurring", { method: item ? "PATCH" : "POST", json }); onSaved(); } catch (e) { setErr((e as Error).message); }
  }
  async function remove() { if (!item || !confirm(`Delete "${item.name}"? The transactions already added stay.`)) return; try { await api(`recurring/${item.id}`, { method: "DELETE" }); onSaved(); } catch (e) { setErr((e as Error).message); } }
  return (
    <Sheet title={item ? "Change recurring" : "New recurring"} onClose={onClose}>
      <div className="fy-seg" role="radiogroup" aria-label="Kind" style={{ marginBottom: 10 }}>
        {(["spend", "income", "transfer"] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={kind === x} className={kind === x ? "on" : ""} onClick={() => setKind(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}
      </div>
      <label className="fy-field"><span className="fy-label">Name</span><input className="fy-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Netflix" /></label>
      <label className="fy-field"><span className="fy-label">Amount (Rp)</span><input className="fy-input" inputMode="decimal" value={changes ? "" : amount} disabled={changes} placeholder={changes ? "asked each time" : ""} onChange={(e) => setAmount(e.target.value)} style={{ fontWeight: 800 }} /></label>
      <button type="button" role="switch" aria-checked={changes} className="fy-row fy-linkish" style={{ padding: "6px 0", minHeight: 48 }} onClick={() => setChanges(!changes)}>
        <div className="main"><div className="t" style={{ fontSize: 14 }}>The amount changes each time</div><div className="s">Finny asks for it on the day</div></div><span className="fy-switch" data-on={changes} aria-hidden="true"><i /></span></button>
      <div className="fy-subhead"><span>{kind === "transfer" ? "From" : kind === "income" ? "Into" : "Paid from"}</span></div>
      <AccountChips label={kind === "transfer" ? "From" : "Account"} accounts={open} value={accountId} onPick={setAccountId} />
      {kind === "transfer" && <><div className="fy-subhead"><span>To</span></div><AccountChips label="To" accounts={open.filter((a) => a.id !== accountId)} value={toAccountId} onPick={setTo} /></>}
      {kind !== "transfer" && <CategoryPicker cats={cats} value={categoryId} onPick={setCat} suggested={null} />}
      <div className="fy-subhead"><span>How often</span></div>
      <div className="fy-seg" role="radiogroup" aria-label="How often" style={{ marginBottom: 10 }}>
        {(["month", "week", "year"] as const).map((x) => <button key={x} type="button" role="radio" aria-checked={every === x} className={every === x ? "on" : ""} onClick={() => setEvery(x)}>{x === "month" ? "Monthly" : x === "week" ? "Weekly" : "Yearly"}</button>)}
      </div>
      <label className="fy-field"><span className="fy-label">{every === "month" ? "First day (it repeats on this day of the month)" : every === "week" ? "First day (it repeats on this weekday)" : "First day (it repeats on this date)"}</span>
        <input className="fy-input" type="date" value={anchorOn} onChange={(e) => setAnchor(e.target.value)} aria-label="First day" /></label>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <button className="fy-btn primary block" onClick={save}>Save{next ? ` · ${next === today ? "due today" : `next on ${shortDate(next).replace(/ \d{4}$/, "")}`}` : ""}</button>
      {item && <button className="fy-btn block" style={{ marginTop: 8, color: "var(--spend)" }} onClick={remove}>Delete recurring</button>}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Settings › Recurring

export function RecurringPage() {
  const { version, reload } = useFinny();
  const acc = useAccName();
  const [d, setD] = useState<List | null>(null);
  const [edit, setEdit] = useState<{ item?: Item; draft?: Draft } | null>(null);
  const [err, setErr] = useState("");
  const load = () => api<List>("recurring").then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [version]);
  // ?from=… (a transaction's "Make it recurring") opens the sheet filled in.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("new")) setEdit({ draft: { name: q.get("name") ?? "", kind: (q.get("kind") as Kind) ?? "spend", amountSen: q.get("amount") ? Number(q.get("amount")) : undefined, accountId: q.get("account") ?? undefined, toAccountId: q.get("to") || null, categoryId: q.get("category") || null, every: "month", anchorOn: q.get("on") ?? undefined } }); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);
  async function dismiss(key: string) { await api("recurring/dismiss", { method: "POST", json: { key } }).catch(() => {}); load(); }
  const groups: [string, Kind][] = [["Income", "income"], ["Bills and subscriptions", "spend"], ["Transfers", "transfer"]];
  return (
    <>
      <Link className="fy-back" href="/settings"><ChevronLeft size={20} />Settings</Link>
      <div className="fy-large"><div><div className="sub">Settings</div><h1>Recurring</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {d && d.items.length > 0 && <div className="fy-hero" style={{ padding: "14px 16px" }} data-testid="rc-month">
        <div className="stats"><div className="fy-stat"><small>In a month</small><b style={{ color: "var(--income)" }}>+{plain(d.perMonth.inSen)}</b></div><div className="fy-stat"><small>Out a month</small><b>−{plain(d.perMonth.outSen)}</b></div></div>
      </div>}
      {d && !d.items.length && <div className="fy-card fy-pad fy-hint" style={{ margin: "0 0 10px" }}>Salary, rent, subscriptions, card payments: set them up once and they show on Home on their day, one tap to add.</div>}
      {d && groups.map(([label, kind]) => { const xs = d.items.filter((x) => x.kind === kind); return xs.length ? (
        <div key={kind}><div className="fy-section"><span>{label}</span><span>{xs.length}</span></div>
          <div className="fy-list" data-testid={`rc-${kind}`}>{xs.map((x) => (
            <button className="fy-row fy-linkish" key={x.id} style={{ width: "100%" }} onClick={() => setEdit({ item: x })} aria-label={`Change ${x.name}`}>
              <ItemTile kind={x.kind} categoryId={x.categoryId} />
              <div className="main"><div className="t">{x.name}</div><div className="s" style={{ whiteSpace: "normal" }}>{howOften(x.every, x.anchorOn)} · {x.kind === "transfer" ? `${acc(x.accountId)} → ${acc(x.toAccountId)}` : acc(x.accountId)}</div></div>
              <div style={{ textAlign: "right", flex: "none" }}><div className={`fy-amt ${cls(x.kind)}`}>{x.amountSen != null ? signed(x.kind, x.amountSen) : x.lastAmountSen != null ? `about ${signed(x.kind, x.lastAmountSen)}` : "changes"}</div>
                <div className="fy-hint" style={{ margin: 0, fontSize: 12 }}>{x.nextOn ? `next ${shortDate(x.nextOn).replace(/ \d{4}$/, "")}` : "ended"}</div></div>
            </button>))}</div></div>) : null; })}
      <button className="fy-btn primary block" style={{ marginTop: 12 }} onClick={() => setEdit({})}><Plus size={16} />Add recurring</button>
      {d && d.suggestions.length > 0 && <>
        <div className="fy-card fy-pad fy-rc-spot" data-testid="rc-suggestions-head"><div style={{ fontWeight: 800, display: "flex", gap: 6, alignItems: "center" }}><Sparkles size={16} /> Finny spotted these</div>
          <div className="fy-hint" style={{ margin: "2px 0 0" }}>The same place and amount, about the same day, 3 months or more in a row.</div></div>
        <div className="fy-list" data-testid="rc-suggestions">{d.suggestions.map((s) => (
          <div className="fy-row" key={s.key} style={{ alignItems: "flex-start" }}><ItemTile kind={s.kind} categoryId={s.categoryId} />
            <div className="main"><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div className="t">{s.name}</div><div className={`fy-amt ${cls(s.kind)}`}>{signed(s.kind, s.amountSen)}</div></div>
              <div className="s" style={{ whiteSpace: "normal" }}>around the {nth(s.day)} · {s.months} months · {acc(s.accountId)}</div>
              <div className="fy-rc-acts" style={{ justifyContent: "flex-start" }}>
                <button className="fy-chip on" onClick={() => { const [y, m] = d.today.split("-").map(Number); const day = Math.min(s.day, new Date(Date.UTC(y, m, 0)).getUTCDate());
                  setEdit({ draft: { name: s.name, kind: s.kind, amountSen: s.amountSen, accountId: s.accountId, categoryId: s.categoryId, every: "month", anchorOn: `${d.today.slice(0, 8)}${String(day).padStart(2, "0")}` } }); }} aria-label={`Make ${s.name} recurring`}>Make recurring</button>
                <button className="fy-chip" onClick={() => dismiss(s.key)} aria-label={`Not recurring: ${s.name}`}><X size={13} /> Not recurring</button>
              </div></div></div>))}</div>
      </>}
      {edit && <RecurringSheet item={edit.item} draft={edit.draft} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); reload(); }} />}
    </>
  );
}

/** Settings: the row into Recurring. */
export function RecurringRow() {
  return (
    <a className="fy-row" href="/settings/recurring" aria-label="Recurring"><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><Repeat size={18} /></span>
      <div className="main"><div className="t">Recurring</div><div className="s">Salary, bills, subscriptions: on Home on their day</div></div><ChevronRight className="chev" size={18} /></a>
  );
}
