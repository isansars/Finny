"use client";
// Accounts (FINNY-28): grouped by type, balances computed, cards show used of limit, closed accounts folded away.
import { useEffect, useState } from "react";
import { api, useFinny, type Account } from "./store";
import { AmountInput, Money, Sheet, TYPE_EMOJI, TYPE_LABEL } from "./ui";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { todayIn } from "@/lib/dates";

const GROUPS: { title: string; types: string[] }[] = [
  { title: "Cash & bank", types: ["cash", "bank"] }, { title: "E-wallets", types: ["ewallet"] },
  { title: "Credit cards", types: ["card"] }, { title: "Loans & paylater", types: ["loan"] }, { title: "Investments", types: ["investment"] },
];

function AccountForm({ a, onDone }: { a: Account | null; onDone: () => void }) {
  const { reload } = useFinny();
  const [name, setName] = useState(a?.name ?? "");
  const [type, setType] = useState(a?.type ?? "bank");
  const [emoji, setEmoji] = useState(a?.emoji ?? "");
  const owes = type === "card" || type === "loan";
  // Cards and loans are entered as what you owe today (a positive number) and stored as a negative balance.
  const [opening, setOpening] = useState(a ? formatRupiah(owes ? -a.openingSen : a.openingSen) : "");
  const [openingOn, setOpeningOn] = useState(a?.openingOn ?? todayIn());
  const [limit, setLimit] = useState(a?.limitSen != null ? formatRupiah(a.limitSen) : "");
  const [statementDay, setStatementDay] = useState(a?.statementDay ? String(a.statementDay) : "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    const o = opening.trim() ? parseRupiah(opening) : 0;
    if (o === null) { setErr(`"${opening}" isn't an amount.`); return; }
    const body: Record<string, unknown> = { name, type, emoji, openingSen: owes ? -Math.abs(o) : o, openingOn, limit: owes ? limit : null, statementDay: type === "card" ? statementDay : null };
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
      <div className="fy-row2">
        <label className="fy-field"><span>Name</span><input className="fy-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="BCA" maxLength={80} required autoFocus /></label>
        <label className="fy-field"><span>Type</span>
          <select className="fy-input" value={type} onChange={(e) => setType(e.target.value)}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{TYPE_EMOJI[k]} {v}</option>)}</select>
        </label>
      </div>
      <div className="fy-row2">
        <label className="fy-field"><span>{owes ? "Owed on the opening date" : "Opening balance"}</span><AmountInput label={owes ? "Owed on the opening date" : "Opening balance"} value={opening} onChange={setOpening} /></label>
        <label className="fy-field"><span>Opening date</span><input className="fy-input" type="date" value={openingOn} onChange={(e) => setOpeningOn(e.target.value)} required /></label>
      </div>
      {owes && (
        <div className="fy-row2">
          <label className="fy-field"><span>{type === "card" ? "Credit limit" : "Loan amount (optional)"}</span><AmountInput label="Limit" value={limit} onChange={setLimit} /></label>
          {type === "card" && <label className="fy-field"><span>Statement day</span><input className="fy-input" type="number" min={1} max={31} value={statementDay} onChange={(e) => setStatementDay(e.target.value)} placeholder="25" /></label>}
        </div>
      )}
      <label className="fy-field"><span>Emoji (optional)</span><input className="fy-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} placeholder={TYPE_EMOJI[type]} /></label>
      <button className="fy-btn block" disabled={busy}>{a ? "Save changes" : "Add account"}</button>
      {a && <button type="button" className="fy-btn ghost block" style={{ marginTop: 8 }} disabled={busy} onClick={() => archive(!a.archived)}>{a.archived ? "Reopen account" : "Close account (keeps its history)"}</button>}
    </form>
  );
}

export function Accounts() {
  const { accounts, loaded, reload } = useFinny();
  const [edit, setEdit] = useState<Account | null | undefined>(undefined);
  const [showClosed, setShowClosed] = useState(false);
  // /accounts?add=1 opens the form straight away (from Home's first-run prompt).
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
  const row = (a: Account, list: Account[]) => (
    <div key={a.id} className="fy-acc" role="button" tabIndex={0} aria-label={`Edit ${a.name}`} onClick={() => setEdit(a)} onKeyDown={(e) => { if (e.key === "Enter") setEdit(a); }} data-testid={`account-${a.name}`}>
      <div className="grow" style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 800 }}>
          <span>{a.emoji || TYPE_EMOJI[a.type]} {a.name}</span>
          {a.card ? <span className="fy-amt" data-testid="balance">{a.card.used ? `owe ${formatRupiah(a.card.used)}` : formatRupiah(a.balanceSen)}</span> : <Money sen={a.balanceSen} />}
        </div>
        {a.card && a.card.limit != null && (<>
          <div className="fy-card-line">
            <span data-testid="used">used {formatRupiah(a.card.used, { prefix: false })}</span><span>available {formatRupiah(a.card.available ?? 0, { prefix: false })} of {formatRupiah(a.card.limit, { prefix: false })}</span>
          </div>
          <div className="fy-meter"><i style={{ width: `${Math.min(100, a.card.limit ? (a.card.used / a.card.limit) * 100 : 0)}%` }} /></div>
        </>)}
      </div>
      {!a.archived && list.length > 1 && (
        <span style={{ display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
          <button className="fy-chip" aria-label={`Move ${a.name} up`} onClick={() => move(a, -1)}>▲</button>
          <button className="fy-chip" aria-label={`Move ${a.name} down`} style={{ marginTop: 2 }} onClick={() => move(a, 1)}>▼</button>
        </span>
      )}
    </div>
  );
  return (
    <>
      <div className="fy-h1"><span>Accounts</span><button className="fy-btn small" onClick={() => setEdit(null)}>＋ Add</button></div>
      <div className="fy-hero"><small>Total across open accounts</small><b data-testid="accounts-total">{formatRupiah(total)}</b></div>
      {loaded && !accounts.length && <div className="fy-empty"><b>No accounts yet</b>Add each place money lives: cash, banks (BCA, Mandiri…), e-wallets (GoPay, OVO…), credit cards and loans.</div>}
      {GROUPS.map((g) => {
        const list = open.filter((a) => g.types.includes(a.type));
        if (!list.length) return null;
        return <div key={g.title}><div className="fy-grp"><span>{g.title}</span><span>{formatRupiah(list.reduce((s, a) => s + a.balanceSen, 0))}</span></div>{list.map((a) => row(a, open))}</div>;
      })}
      {closed.length > 0 && (<>
        <button className="fy-grp fy-link" style={{ border: 0, background: "none", width: "100%" }} aria-expanded={showClosed} onClick={() => setShowClosed(!showClosed)}><span>Closed ({closed.length}) {showClosed ? "▾" : "▸"}</span></button>
        {showClosed && closed.map((a) => row(a, closed))}
      </>)}
      {edit !== undefined && <Sheet title={edit ? `Edit ${edit.name}` : "Add an account"} onClose={() => setEdit(undefined)}><AccountForm a={edit} onDone={() => setEdit(undefined)} /></Sheet>}
    </>
  );
}
