"use client";
// Quick add (FINNY-41): the amount large, Spend / Income / Transfer, categories as a grid of tiles (most used first, the
// suggestion from history highlighted), accounts as chips (the last one remembered), Today / Yesterday / a date.
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Sparkles, Search, PenLine } from "lucide-react";
import { api, remember, useFinny, type Category, type Txn } from "./store";
import { OfflineError, outbox, useNet } from "@/lib/offline";
import { CatTile, Tile } from "./icons";
import { TYPE_LOOK } from "./ui";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { dayBefore, shortDate, todayIn } from "@/lib/dates";
import { flattenTree } from "@/lib/category-rule";

type Kind = "spend" | "income" | "transfer";
const TOP = 9;

export function CategoryPicker({ cats, value, onPick, suggested }: { cats: Category[]; value: string; onPick: (id: string) => void; suggested: string | null }) {
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  // Every category can be picked (a parent too, e.g. Beli Kopi with Kopi Susu inside): most used first, then the tree order.
  const order = new Map(flattenTree(cats, undefined).map((c, i) => [c.id, i]));
  const leaves = [...cats].sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  let shown = all ? leaves : leaves.slice(0, TOP);
  for (const id of [value, suggested]) if (id && !shown.some((c) => c.id === id)) { const c = cats.find((x) => x.id === id); if (c) shown = [c, ...shown.slice(0, TOP - 1)]; }
  if (all && q.trim()) shown = leaves.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="fy-subhead"><span>Category</span>{leaves.length > TOP && <button type="button" onClick={() => { setAll(!all); setQ(""); }}>{all ? "Fewer" : "All categories"}</button>}</div>
      {all && <label className="fy-search" style={{ display: "block", marginBottom: 6 }}><Search size={16} /><input className="fy-input" placeholder="Find a category" aria-label="Find a category" value={q} onChange={(e) => setQ(e.target.value)} /></label>}
      <div className="fy-catgrid" role="radiogroup" aria-label="Category">
        {shown.map((c) => (
          <button type="button" key={c.id} role="radio" aria-checked={value === c.id} aria-label={c.name} className="fy-cat" onClick={() => onPick(c.id)}>
            <CatTile c={c} size={40} /><small>{c.name}</small>
          </button>
        ))}
        {!all && leaves.length > TOP && <button type="button" className="fy-cat" onClick={() => setAll(true)} aria-label="Show all categories"><Tile icon="shapes" color="slate" size={40} /><small>More</small></button>}
      </div>
    </>
  );
}

export function AccountChips({ label, accounts, value, onPick }: { label: string; accounts: { id: string; name: string; type: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="fy-chips wrap" role="radiogroup" aria-label={label} style={{ marginBottom: 4 }}>
      {accounts.map((a) => (
        <button type="button" key={a.id} role="radio" aria-checked={value === a.id} aria-label={a.name} className="fy-chip" onClick={() => onPick(a.id)}>
          <Tile icon={TYPE_LOOK[a.type]?.icon ?? "wallet"} color={TYPE_LOOK[a.type]?.color ?? "slate"} size={22} />{a.name}
        </button>
      ))}
    </div>
  );
}

export function QuickAddForm({ existing, onDone, inline }: { existing?: Txn | null; onDone?: () => void; inline?: boolean }) {
  // FINNY-89: a transaction without an id is a draft to fill in (e.g. "Mark paid"), not one to edit.
  const isEdit = Boolean(existing?.id);
  const { offline } = useNet();
  const { accounts, categories, reload } = useFinny();
  const usable = accounts.filter((a) => !a.archived || a.id === existing?.accountId || a.id === existing?.toAccountId);
  const today = todayIn(), yesterday = dayBefore(today);
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "spend");
  const [amount, setAmount] = useState(existing ? formatRupiah(existing.amountSen, { prefix: false }) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [picked, setPicked] = useState(Boolean(existing?.categoryId));
  const [suggested, setSuggested] = useState<{ id: string; name: string } | null>(null);
  const [accountId, setAccountId] = useState(existing?.accountId ?? remember.get("lastAccount") ?? "");
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? "");
  const [on, setOn] = useState(existing?.on ?? today);
  const [entity, setEntity] = useState(existing?.entity ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [more, setMore] = useState(Boolean(existing?.entity || existing?.note));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]);
  const amountRef = useRef<HTMLInputElement>(null);

  const account = usable.find((a) => a.id === accountId && (!a.archived || existing)) ?? usable.find((a) => !a.archived);
  const kinds = kind === "income" ? ["income"] : ["expense", "saving", "investment"];
  const pickable = categories.filter((c) => kinds.includes(c.kind) && (c.active || c.id === existing?.categoryId));
  const catOk = pickable.some((c) => c.id === categoryId);

  useEffect(() => { api<{ id: string; name: string }[]>("entities").then(setEntities).catch(() => {}); }, []);
  useEffect(() => {
    const skip = kind === "transfer" || description.trim().length < 3;
    const t = setTimeout(() => {
      if (skip) { setSuggested(null); return; }
      api<{ categoryId: string | null; name?: string }>(`suggest?q=${encodeURIComponent(description)}`).then((s) => {
        const c = categories.find((x) => x.id === s.categoryId);
        if (c && kinds.includes(c.kind)) { setSuggested({ id: c.id, name: c.name }); if (!picked) setCategoryId(c.id); } else setSuggested(null);
      }).catch(() => {});
    }, skip ? 0 : 250);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, kind, picked, categories]);

  const amountSen = useMemo(() => parseRupiah(amount), [amount]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    if (!amountSen || amountSen <= 0) { setErr("Enter an amount above zero."); amountRef.current?.focus(); return; }
    if (!account) { setErr("Add an account first."); return; }
    const body = { kind, amount, on, accountId: account.id, toAccountId: kind === "transfer" ? toAccountId : null, categoryId: kind === "transfer" ? null : (catOk ? categoryId : ""), description, entity, note };
    setBusy(true);
    // FINNY-151: a new entry carries its own id; with no connection it waits on this phone and is sent once later.
    const clientRef = isEdit ? null : crypto.randomUUID();
    try {
      try {
        await api(isEdit ? `transactions/${existing!.id}` : "transactions", { method: isEdit ? "PATCH" : "POST", json: clientRef ? { ...body, clientRef } : body });
      } catch (x) {
        if (!(x instanceof OfflineError) || isEdit) throw x;
        await outbox.add({ clientRef: clientRef!, body, savedAt: new Date().toISOString() });
      }
      remember.set("lastAccount", account.id);
      await reload().catch(() => {}); // offline: the kept copy, or nothing new yet
      if (isEdit || !inline) onDone?.();
      else { setAmount(""); setDescription(""); setEntity(""); setNote(""); setPicked(false); setCategoryId(""); setSuggested(null); setBusy(false); amountRef.current?.focus(); }
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  // FINNY-173: a transaction Finny flagged that the owner checked: stop guessing it's a mistake.
  async function looksFine() {
    setBusy(true);
    try { await api(`transactions/${existing!.id}`, { method: "PATCH", json: { looksOk: true } }); await reload(); onDone?.(); } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  async function remove() {
    if (!isEdit || !confirm("Delete this transaction?")) return;
    setBusy(true);
    try { await api(`transactions/${existing!.id}`, { method: "DELETE" }); await reload(); onDone?.(); } catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  if (!usable.some((a) => !a.archived) && !existing) {
    return <div className="fy-empty"><Tile icon="landmark" color="sky" size={52} /><b>Add an account first</b>Money moves in and out of an account: cash, a bank, an e-wallet or a card.<div style={{ marginTop: 14 }}><a className="fy-btn primary" href="/accounts?add=1">Add an account</a></div></div>;
  }
  const isDate = on !== today && on !== yesterday;
  return (
    <form onSubmit={save} aria-label={isEdit ? "Edit transaction" : "Add a transaction"}>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className="fy-seg" role="tablist" aria-label="Kind">
        {(["spend", "income", "transfer"] as Kind[]).map((k) => (
          <button type="button" role="tab" aria-selected={kind === k} key={k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); if (!existing) { setPicked(false); setCategoryId(""); } }}>
            {k === "spend" ? "Spend" : k === "income" ? "Income" : "Transfer"}
          </button>
        ))}
      </div>
      <div className="fy-amount"><small>Rp</small>
        <input ref={amountRef} inputMode="decimal" autoComplete="off" aria-label="Amount" placeholder="0" value={amount} autoFocus={!inline && !existing}
          style={{ width: `${Math.max(1, amount.length) * 0.62 + 0.4}em` }}
          onChange={(e) => setAmount(e.target.value)} onBlur={() => { const s = parseRupiah(amount); if (s !== null && amount.trim()) setAmount(formatRupiah(s, { prefix: false })); }} />
      </div>
      <label className="fy-what"><PenLine size={17} color="var(--text-3)" />
        <input aria-label="What for" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300}
          placeholder={kind === "income" ? "What is it? e.g. Gaji November" : kind === "transfer" ? "Note, e.g. Top up GoPay (optional)" : "What for? e.g. Ngopi di Le Tusa"} />
      </label>
      {suggested && kind !== "transfer" && (
        <button type="button" className="fy-sugg" data-testid="suggestion" onClick={() => { setCategoryId(suggested.id); setPicked(true); }}><Sparkles size={13} />Suggested: {suggested.name}</button>
      )}
      {kind !== "transfer" ? (
        pickable.length ? <CategoryPicker cats={pickable} value={catOk ? categoryId : ""} suggested={suggested?.id ?? null} onPick={(id) => { setCategoryId(id); setPicked(true); }} />
          : <p className="fy-note" style={{ margin: "10px 0" }}>No categories yet. <a href="/categories">Add some</a> first.</p>
      ) : null}
      <div className="fy-subhead"><span>{kind === "income" ? "Into" : kind === "transfer" ? "From" : "Paid from"}</span></div>
      <AccountChips label={kind === "transfer" ? "From account" : "Account"} accounts={usable} value={account?.id ?? ""} onPick={setAccountId} />
      {kind === "transfer" && (<>
        <div className="fy-subhead"><span>To</span></div>
        <AccountChips label="To account" accounts={usable.filter((a) => a.id !== account?.id)} value={toAccountId} onPick={setToAccountId} />
      </>)}
      <div className="fy-subhead"><span>Date</span></div>
      <div className="fy-chips" style={{ alignItems: "center" }}>
        <button type="button" className={`fy-chip ${on === today ? "on" : ""}`} onClick={() => setOn(today)}>Today</button>
        <button type="button" className={`fy-chip ${on === yesterday ? "on" : ""}`} onClick={() => setOn(yesterday)}>Yesterday</button>
        <label className={`fy-chip ${isDate ? "on" : ""}`} style={{ position: "relative" }}>{isDate ? shortDate(on) : "Pick a date"}
          <input type="date" aria-label="Date" value={on} onChange={(e) => e.target.value && setOn(e.target.value)} required
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", fontSize: 16 }} />
        </label>
      </div>
      {more ? (<div style={{ marginTop: 12 }}>
        <label className="fy-field"><span className="fy-label">{kind === "income" ? "From (optional)" : "Paid to (optional)"}</span>
          <input className="fy-input" list="fy-entities" value={entity} onChange={(e) => setEntity(e.target.value)} maxLength={80} placeholder={kind === "income" ? "Kantor" : "Le Tusa"} />
          <datalist id="fy-entities">{entities.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        </label>
        <label className="fy-field"><span className="fy-label">Note</span><textarea className="fy-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label>
      </div>) : <button type="button" className="fy-more" onClick={() => setMore(true)}><ChevronDown size={16} />Paid to, note</button>}
      {kind === "transfer" && <p className="fy-note" style={{ margin: "8px 0 0" }}>A transfer moves money between your own accounts. It isn&apos;t spending or income.</p>}
      {offline && !isEdit && <p className="fy-offline-note" role="status">No connection: this is kept on your phone and sent when you&apos;re back online.</p>}
      {offline && isEdit && <p className="fy-offline-note" role="status">No connection: changes need a connection. Try again when you&apos;re back online.</p>}
      {isEdit && existing && <a className="fy-btn block" style={{ marginTop: 14 }} data-testid="make-recurring"
        href={`/settings/recurring?new=1&${new URLSearchParams({ name: existing.description || "", kind: existing.kind, amount: String(existing.amountSen), account: existing.accountId, to: existing.toAccountId ?? "", category: existing.categoryId ?? "", on: existing.on })}`}>Make it recurring</a>}
      {/* FINNY-164: in a sheet on a laptop these stay in view while the form scrolls (Delete left, Save right); on a phone Save comes first. */}
      <div className="fy-sheet-foot">
        <button className="fy-btn primary block" disabled={busy || (offline && isEdit)}>{busy ? "Saving…" : isEdit ? "Save changes" : offline ? "Save on this phone" : "Save"}</button>
        {isEdit && <button type="button" className="fy-btn danger block" onClick={remove} disabled={busy}>Delete</button>}
        {isEdit && (existing as { flags?: unknown[] } | null)?.flags?.length ? <button type="button" className="fy-btn block" onClick={looksFine} disabled={busy}>Looks fine</button> : null}
      </div>
    </form>
  );
}
