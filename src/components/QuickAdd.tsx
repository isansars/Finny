"use client";
// Quick add (FINNY-32): Spend / Income / Transfer, amount first, the category suggested from history as you type,
// the last account remembered. The same form edits and deletes a transaction.
import { useEffect, useMemo, useRef, useState } from "react";
import { api, remember, useFinny, type Txn } from "./store";
import { AmountInput, CategoryOptions } from "./ui";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { todayIn } from "@/lib/dates";

type Kind = "spend" | "income" | "transfer";

export function QuickAddForm({ existing, onDone, inline }: { existing?: Txn | null; onDone?: () => void; inline?: boolean }) {
  const { accounts, categories, reload } = useFinny();
  const open = accounts.filter((a) => !a.archived || a.id === existing?.accountId || a.id === existing?.toAccountId);
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "spend");
  const [amount, setAmount] = useState(existing ? formatRupiah(existing.amountSen) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? "");
  const [picked, setPicked] = useState(Boolean(existing?.categoryId)); // the owner chose a category: stop suggesting
  const [suggested, setSuggested] = useState<string | null>(null);
  const [accountId, setAccountId] = useState(existing?.accountId ?? remember.get("lastAccount") ?? "");
  const [toAccountId, setToAccountId] = useState(existing?.toAccountId ?? "");
  const [on, setOn] = useState(existing?.on ?? todayIn());
  const [entity, setEntity] = useState(existing?.entity ?? "");
  const [note, setNote] = useState(existing?.note ?? "");
  const [more, setMore] = useState(Boolean(existing?.note));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([]);
  const amountRef = useRef<HTMLInputElement>(null);

  // A remembered account that's gone or closed falls back to the first open one.
  const account = open.find((a) => a.id === accountId && !a.archived) ?? (existing ? open.find((a) => a.id === accountId) : undefined) ?? open.find((a) => !a.archived);
  const kinds = kind === "income" ? ["income"] : ["expense", "saving", "investment"];
  const catOk = categories.some((c) => c.id === categoryId && kinds.includes(c.kind));

  useEffect(() => { api<{ id: string; name: string }[]>("entities").then(setEntities).catch(() => {}); }, []);
  // Suggest while typing (debounced); only fills the category when the owner hasn't picked one.
  useEffect(() => {
    const skip = kind === "transfer" || description.trim().length < 3;
    const t = setTimeout(() => {
      if (skip) { setSuggested(null); return; }
      api<{ categoryId: string | null; name?: string }>(`suggest?q=${encodeURIComponent(description)}`).then((s) => {
        const c = categories.find((x) => x.id === s.categoryId);
        if (c && kinds.includes(c.kind)) { setSuggested(c.name); if (!picked) setCategoryId(c.id); } else setSuggested(null);
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
    try {
      await api(existing ? `transactions/${existing.id}` : "transactions", { method: existing ? "PATCH" : "POST", json: body });
      remember.set("lastAccount", account.id);
      await reload();
      if (existing || !inline) onDone?.();
      else { setAmount(""); setDescription(""); setEntity(""); setNote(""); setPicked(false); setCategoryId(""); setSuggested(null); amountRef.current?.focus(); }
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!existing || !confirm("Delete this transaction?")) return;
    setBusy(true);
    try { await api(`transactions/${existing.id}`, { method: "DELETE" }); await reload(); onDone?.(); } catch (x) { setErr((x as Error).message); setBusy(false); }
  }

  if (!open.some((a) => !a.archived) && !existing) {
    return <div className="fy-empty"><b>Add an account first</b>Transactions go in or out of an account: cash, a bank, an e-wallet or a card.<div style={{ marginTop: 12 }}><a className="fy-btn" href="/accounts?add=1">＋ Add an account</a></div></div>;
  }
  return (
    <form onSubmit={save} aria-label={existing ? "Edit transaction" : "Add a transaction"}>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <div className={`fy-seg ${kind}`} role="tablist" aria-label="Kind">
        {(["spend", "income", "transfer"] as Kind[]).map((k) => (
          <button type="button" role="tab" aria-selected={kind === k} key={k} className={kind === k ? "on" : ""} onClick={() => { setKind(k); if (!existing) { setPicked(false); setCategoryId(""); } }}>
            {k === "spend" ? "Spend" : k === "income" ? "Income" : "Transfer"}
          </button>
        ))}
      </div>
      <label className="fy-field"><span className="fy-sr">Amount</span>
        <AmountInput big label="Amount" value={amount} onChange={setAmount} autoFocus={!inline && !existing} />
      </label>
      <label className="fy-field"><span>{kind === "transfer" ? "What for (optional)" : "What for"}</span>
        <input className="fy-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={kind === "income" ? "Gaji November" : kind === "transfer" ? "Top up GoPay" : "Ngopi di Le Tusa"} maxLength={300} />
        {suggested && kind !== "transfer" && <span className="fy-sugg" data-testid="suggestion">✨ {suggested}</span>}
      </label>
      {kind !== "transfer" && (
        <label className="fy-field"><span>Category</span>
          <select className="fy-input" aria-label="Category" value={catOk ? categoryId : ""} onChange={(e) => { setCategoryId(e.target.value); setPicked(true); }}>
            <option value="">Choose…</option>
            <CategoryOptions cats={categories} kinds={kinds} includeOff={Boolean(existing)} />
          </select>
          {!categories.some((c) => kinds.includes(c.kind) && c.active) && <a className="fy-link" href="/categories">＋ Add categories first</a>}
        </label>
      )}
      <div className={kind === "transfer" ? "fy-row2" : ""}>
        <label className="fy-field"><span>{kind === "income" ? "Into" : kind === "transfer" ? "From" : "Paid from"}</span>
          <select className="fy-input" aria-label={kind === "transfer" ? "From account" : "Account"} value={account?.id ?? ""} onChange={(e) => setAccountId(e.target.value)}>
            {open.map((a) => <option key={a.id} value={a.id}>{a.emoji ?? ""} {a.name}</option>)}
          </select>
        </label>
        {kind === "transfer" && (
          <label className="fy-field"><span>To</span>
            <select className="fy-input" aria-label="To account" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)}>
              <option value="">Choose…</option>
              {open.filter((a) => a.id !== account?.id).map((a) => <option key={a.id} value={a.id}>{a.emoji ?? ""} {a.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="fy-row2">
        <label className="fy-field"><span>Date</span><input className="fy-input" type="date" value={on} onChange={(e) => setOn(e.target.value)} required /></label>
        <label className="fy-field"><span>{kind === "income" ? "From (optional)" : "Paid to (optional)"}</span>
          <input className="fy-input" list="fy-entities" value={entity} onChange={(e) => setEntity(e.target.value)} maxLength={80} />
          <datalist id="fy-entities">{entities.map((x) => <option key={x.id} value={x.name} />)}</datalist>
        </label>
      </div>
      {more ? (
        <label className="fy-field"><span>Note</span><textarea className="fy-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></label>
      ) : <button type="button" className="fy-link" onClick={() => setMore(true)}>＋ Add a note</button>}
      {kind === "transfer" && <p className="fy-note" style={{ margin: "4px 0 10px" }}>A transfer moves money between two of your accounts: it counts as neither spending nor income.</p>}
      <button className="fy-btn block" disabled={busy}>{busy ? "Saving…" : existing ? "Save changes" : "Save"}</button>
      {existing && <button type="button" className="fy-btn danger block" style={{ marginTop: 8 }} onClick={remove} disabled={busy}>Delete</button>}
    </form>
  );
}
