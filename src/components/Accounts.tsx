"use client";
import Link from "next/link";
// Accounts (FINNY-28, restyled in FINNY-40): grouped lists by type, balances computed, cards with a usage bar; Reorder mode.
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight, Plus, FileText } from "lucide-react";
import { api, useFinny, type Account } from "./store";
import { AmountInput, DateField, Money, Sheet, TYPE_LABEL, TYPE_LOOK } from "./ui";
import { Tile } from "./icons";
import { formatCompact, formatRupiah, parseRupiah } from "@/lib/money";
import { todayIn } from "@/lib/dates";

const GROUPS: { title: string; types: string[] }[] = [
  { title: "Cash & bank", types: ["cash", "bank"] }, { title: "E-wallets", types: ["ewallet"] }, { title: "Owed to you", types: ["owed"] },
  { title: "Credit cards", types: ["card"] }, { title: "Loans & paylater", types: ["loan"] }, { title: "Investments", types: ["investment"] },
];

function AccountForm({ a, onDone }: { a: Account | null; onDone: () => void }) {
  const { reload } = useFinny();
  const [name, setName] = useState(a?.name ?? "");
  const [type, setType] = useState(a?.type ?? "bank");
  const owes = type === "card" || type === "loan";
  const lent = type === "owed"; // FINNY-214: money someone owes the owner
  const openLabel = owes ? "Owed on the opening date" : lent ? "They owe you now" : "Opening balance";
  const [opening, setOpening] = useState(a ? formatRupiah(owes ? -a.openingSen : a.openingSen, { prefix: false }) : "");
  const [openingOn, setOpeningOn] = useState(a?.openingOn ?? todayIn());
  const [limit, setLimit] = useState(a?.limitSen != null ? formatRupiah(a.limitSen, { prefix: false }) : "");
  const [statementDay, setStatementDay] = useState(a?.statementDay ? String(a.statementDay) : "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const o = opening.trim() ? parseRupiah(opening) : 0;
    if (o === null) { setErr(`"${opening}" isn't an amount.`); return; }
    const body: Record<string, unknown> = { name, type, openingSen: owes ? -Math.abs(o) : o, openingOn, limit: owes ? limit : null, statementDay: type === "card" ? statementDay : null };
    setBusy(true);
    try { await api(a ? `accounts/${a.id}` : "accounts", { method: a ? "PATCH" : "POST", json: body }); await reload(); onDone(); }
    catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  async function archive(v: boolean) {
    if (!a) return; setBusy(true);
    try { await api(`accounts/${a.id}`, { method: "PATCH", json: { archived: v } }); await reload(); onDone(); } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <form onSubmit={save} aria-label={a ? "Edit account" : "Add an account"}>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <label className="fy-field"><span className="fy-label">{lent ? "Who owes you" : "Name"}</span><input className="fy-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={lent ? "Rina" : "BCA"} maxLength={80} required autoFocus /></label>
      <label className="fy-field"><span className="fy-label">Type</span>
        <select className="fy-input" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label className="fy-field"><span className="fy-label">{openLabel}</span><AmountInput label={openLabel} value={opening} onChange={setOpening} /></label>
        <div className="fy-field"><span className="fy-label">Opening date</span><DateField label="Opening date" value={openingOn} onChange={setOpeningOn} /></div>
      </div>
      {lent && <div className="fy-note" data-testid="owed-note" style={{ lineHeight: 1.45, marginBottom: 12 }}>Lending is a transfer <b>to</b> {name.trim() || "them"}; a repayment is a transfer <b>from</b> {name.trim() || "them"}. Neither is spending or income, and what {name.trim() || "they"} {name.trim() ? "owes" : "owe"} counts in your net worth.</div>}
      {owes && (
        <div style={{ display: "grid", gridTemplateColumns: type === "card" ? "1fr 1fr" : "1fr", gap: 10 }}>
          <label className="fy-field"><span className="fy-label">{type === "card" ? "Credit limit" : "Loan amount (optional)"}</span><AmountInput label="Limit" value={limit} onChange={setLimit} /></label>
          {type === "card" && <label className="fy-field"><span className="fy-label">Statement day</span><input className="fy-input" type="number" min={1} max={31} value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="25" /></label>}
        </div>
      )}
      <div className="fy-sheet-foot"><button className="fy-btn primary block" disabled={busy}>{a ? "Save changes" : "Add account"}</button></div>
      {a && <button type="button" className="fy-btn block" style={{ marginTop: 8 }} disabled={busy} onClick={() => archive(!a.archived)}>{a.archived ? "Reopen account" : "Close account (keeps its history)"}</button>}
    </form>
  );
}

export function Accounts() {
  const { accounts, loaded, reload } = useFinny();
  const [edit, setEdit] = useState<Account | null | undefined>(undefined);
  const [showClosed, setShowClosed] = useState(false);
  const [reorder, setReorder] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (new URLSearchParams(location.search).get("add") === "1") setEdit(null); }, []);
  const open = accounts.filter((a) => !a.archived), closed = accounts.filter((a) => a.archived);
  const total = open.reduce((s, a) => s + a.balanceSen, 0);
  async function move(a: Account, by: number) {
    const ids = open.map((x) => x.id); const i = ids.indexOf(a.id), j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api("accounts/order", { method: "PUT", json: { ids: [...ids, ...closed.map((x) => x.id)] } }); await reload();
  }
  const row = (a: Account) => {
    const look = TYPE_LOOK[a.type] ?? { icon: "wallet", color: "slate" };
    const sub = a.card ? (a.card.limit != null ? `Rp ${formatCompact(a.card.available ?? 0)} left of ${formatCompact(a.card.limit)}` : TYPE_LABEL[a.type])
      : a.owed ? `Lent ${formatRupiah(a.owed.lentSen)} · paid back ${formatRupiah(a.owed.paidSen)}` : TYPE_LABEL[a.type];
    const inner = (<>
      <Tile icon={look.icon} color={look.color} />
      <div className="main"><div className="t">{a.name}</div><div className="s">{sub}</div>
        {a.card && a.card.limit ? <div className="fy-usage"><i style={{ width: `${Math.min(100, (a.card.used / a.card.limit) * 100)}%` }} /></div> : null}</div>
      {a.card ? <span className="fy-amt fy-owed" data-testid="balance">{formatRupiah(a.balanceSen > 0 ? a.balanceSen : a.card.used)}<small>{a.balanceSen > 0 ? "in credit" : a.card.used ? "owed" : "nothing owed"}</small></span> : <Money sen={a.balanceSen} />}
    </>);
    if (reorder && !a.archived) return (
      <div key={a.id} className="fy-row" data-testid={`account-${a.name}`}>{inner}
        <span className="fy-reorder"><button aria-label={`Move ${a.name} up`} onClick={() => move(a, -1)}><ArrowUp size={16} /></button><button aria-label={`Move ${a.name} down`} onClick={() => move(a, 1)}><ArrowDown size={16} /></button></span></div>
    );
    return <button key={a.id} className="fy-row" aria-label={`Edit ${a.name}`} data-testid={`account-${a.name}`} onClick={() => setEdit(a)}>{inner}<ChevronRight className="chev" size={18} /></button>;
  };
  return (
    <>
      <div className="fy-large"><div><div className="sub">{open.length} open</div><h1>Accounts</h1></div>
        <div style={{ display: "flex", gap: 8 }}>{open.length > 1 && <button className="fy-btn small" onClick={() => setReorder(!reorder)}>{reorder ? "Done" : "Reorder"}</button>}<button className="fy-btn primary small" onClick={() => setEdit(null)} aria-label="New account"><Plus size={16} />New account</button></div></div>
      <div className="fy-hero"><div className="lbl" style={{ display: "flex", justifyContent: "space-between" }}><span>Total across open accounts</span><span style={{ display: "flex", gap: 12 }}><Link className="fy-more" style={{ padding: 0, fontSize: 13 }} href="/assets">Assets ›</Link>{open.some((a) => a.type === "card" || a.type === "loan") && <Link className="fy-more" style={{ padding: 0, fontSize: 13 }} href="/debts">Debts ›</Link>}</span></div><div className="big" style={{ marginBottom: 0 }} data-testid="accounts-total">{formatRupiah(total)}</div></div>
      {loaded && !accounts.length && <div className="fy-card fy-empty" style={{ marginTop: 12 }}><Tile icon="landmark" color="sky" size={52} /><b>No accounts yet</b>Add each place your money lives: cash, banks, e-wallets, credit cards and loans.</div>}
      {GROUPS.map((g) => {
        const list = open.filter((a) => g.types.includes(a.type));
        if (!list.length) return null;
        return <div key={g.title} data-testid={`group-${g.title}`}><div className="fy-section"><span>{g.title}</span><span className="num">{formatRupiah(list.reduce((s, a) => s + a.balanceSen, 0))}</span></div><div className="fy-list">{list.map(row)}</div></div>;
      })}
      {closed.length > 0 && (<>
        <div className="fy-section"><button className="fy-more" style={{ padding: 0, fontSize: 13 }} aria-expanded={showClosed} onClick={() => setShowClosed(!showClosed)}>Closed ({closed.length})</button></div>
        {showClosed && <div className="fy-list">{closed.map(row)}</div>}
      </>)}
      {edit !== undefined && <Sheet title={edit ? edit.name : "New account"} label={edit ? `Edit ${edit.name}` : "Add an account"} onClose={() => setEdit(undefined)}>
        {edit && (edit.type === "bank" || edit.type === "card") && <a className="fy-btn block" style={{ marginBottom: 12 }} href={`/import/statements?account=${edit.id}`}><FileText size={17} />Read a statement</a>}
        <AccountForm a={edit} onDone={() => setEdit(undefined)} /></Sheet>}
    </>
  );
}
