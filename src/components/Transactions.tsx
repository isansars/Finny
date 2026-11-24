"use client";
// FINNY-172/173: every transaction, to check, as approved in "Sprint 18 · Design notes (Every transaction, to check,
// approved)": a table on a laptop and rows on a phone, filters kept in the URL, Finny's guesses at mistakes, and
// fixing or deleting one or several at once.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Check, CircleAlert, Download, Pencil, Search, Tag, Trash2, X } from "lucide-react";
import { api, useFinny, type Txn } from "./store";
import { CategoryOptions, Money, Sheet } from "./ui";
import { formatRupiah } from "@/lib/money";
import { flagLabel, type Flag } from "@/lib/check-rule";
import { todayIn } from "@/lib/dates";

type Row = Txn & { looksOk: boolean; source: "typed" | "statement" | "workbook"; flags: Flag[] };
type Page = { items: Row[]; count: number; outSen: number; inSen: number; counts: { all: number; look: number; typed: number; statement: number; workbook: number }; more: boolean };
const SOURCE: Record<Row["source"], string> = { typed: "Typed", statement: "Statement", workbook: "Workbook" };
const PAGE = 50;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shortDay = (d: string) => `${Number(d.slice(8))} ${MONTHS[Number(d.slice(5, 7)) - 1].slice(0, 3)}${d.slice(0, 4) !== todayIn().slice(0, 4) ? ` ${d.slice(0, 4)}` : ""}`;
const wideQuery = () => window.matchMedia("(min-width: 760px)");
const useWide = () => useSyncExternalStore((l) => { const m = wideQuery(); m.addEventListener("change", l); return () => m.removeEventListener("change", l); }, () => wideQuery().matches, () => true);
/** What a set of rows adds up to, signed: spending −, income +, transfers 0. */
const signed = (rows: Row[]) => rows.reduce((n, r) => n + (r.kind === "spend" ? -r.amountSen : r.kind === "income" ? r.amountSen : 0), 0);
const money = (sen: number) => `${sen < 0 ? "−" : sen > 0 ? "+" : ""}Rp ${formatRupiah(Math.abs(sen), { prefix: false })}`;

export function Transactions() {
  const { accounts, categories, openAdd, reload, version, loaded } = useFinny();
  const params = useSearchParams(), router = useRouter(), path = usePathname();
  const wide = useWide();
  const month = params.get("month") ?? todayIn().slice(0, 7);
  const filter = useMemo(() => ({ month, account: params.get("account") ?? "", category: params.get("category") ?? "", kind: params.get("kind") ?? "", source: params.get("source") ?? "", look: params.get("look") ?? "", q: params.get("q") ?? "", sort: params.get("sort") ?? "-date" }), [params, month]);
  // Two quick changes in a row (before the page re-renders) must both stick: build on the last URL asked for, not the last rendered.
  const pending = useRef<string | null>(null);
  useEffect(() => { pending.current = null; }, [params]);
  const go = (p: URLSearchParams) => { pending.current = p.toString(); router.replace(`${path}?${p}`, { scroll: false }); };
  const latest = () => new URLSearchParams(pending.current ?? params.toString());
  const set = (k: string, v: string) => { const p = latest(); if (v) p.set(k, v); else p.delete(k); if (k === "look" || k === "source") { if (k === "look") p.delete("source"); else p.delete("look"); } go(p); };
  const query = (offset: number, limit = PAGE) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(filter)) if (v && !(k === "month" && v === "all")) p.set(k, v); p.set("offset", String(offset)); p.set("limit", String(limit)); return p; };

  const [data, setData] = useState<Page | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [recat, setRecat] = useState(false);
  const [q, setQ] = useState(filter.q);
  useEffect(() => { setQ(filter.q); }, [filter.q]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { const t = setTimeout(() => { if (q !== filter.q) set("q", q.trim()); }, 300); return () => clearTimeout(t); });

  // Reload from the top when the filter changes or something was saved (the edit dialog reloads the store).
  useEffect(() => {
    let live = true;
    const shown = data?.items.length ?? 0;
    api<Page>(`transactions/table?${query(0, Math.max(PAGE, shown))}`).then((d) => { if (live) { setData(d); setErr(""); setPicked((p) => new Set([...p].filter((id) => d.items.some((r) => r.id === id)))); } }).catch((e) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [filter, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const more = async () => { if (!data) return; const d = await api<Page>(`transactions/table?${query(data.items.length)}`); setData({ ...d, items: [...data.items, ...d.items] }); };

  const acc = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts]);
  const cat = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);
  const items = data?.items ?? [];
  const pickedRows = items.filter((r) => picked.has(r.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = items.length > 0 && items.every((r) => picked.has(r.id));
  const catOf = (r: Row) => (r.kind === "transfer" ? `${acc.get(r.accountId) ?? ""} → ${r.toAccountId ? acc.get(r.toAccountId) ?? "" : ""}` : (r.categoryId && cat.get(r.categoryId)) || "");
  const name = (r: Row) => r.description || catOf(r) || "Transaction";

  async function bulk(action: "delete" | "category" | "fine", categoryId?: string) {
    const rows = pickedRows; if (!rows.length) return;
    if (action === "delete" && !confirm(`Delete ${rows.length} transaction${rows.length > 1 ? "s" : ""} (${money(signed(rows))})? This can't be undone.`)) return;
    setBusy(true); setErr("");
    try {
      const r = await api<{ changed: number; skipped: number }>("transactions/bulk", { method: "POST", json: { ids: rows.map((x) => x.id), action, categoryId } });
      if (r.skipped) setErr(`${r.skipped} of them kept their category: a transfer has none, and income and spending can't share one.`);
      setPicked(new Set()); setRecat(false); setSelecting(false); await reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function removeOne(r: Row) {
    if (!confirm(`Delete "${name(r)}" (${money(signed([r]))}, ${shortDay(r.on)})?`)) return;
    try { await api(`transactions/${r.id}`, { method: "DELETE" }); await reload(); } catch (e) { setErr((e as Error).message); }
  }

  const monthOptions = useMemo(() => { const out: string[] = []; const [y, m] = todayIn().slice(0, 7).split("-").map(Number); for (let i = 0; i < 24; i++) { const d = new Date(Date.UTC(y, m - 1 - i, 1)); out.push(d.toISOString().slice(0, 7)); } if (month !== "all" && !out.includes(month)) out.unshift(month); return out; }, [month]);
  const sortBy = (k: "date" | "amount") => set("sort", filter.sort === `-${k}` ? k : `-${k}`);
  const sortIcon = (k: string) => (filter.sort === `-${k}` ? <ArrowDown size={13} /> : filter.sort === k ? <ArrowUp size={13} /> : null);
  const ariaSort = (k: string) => (filter.sort === `-${k}` ? "descending" : filter.sort === k ? "ascending" : undefined);
  const flags = (r: Row) => r.flags.map((f, i) => <span key={i} className="fy-pill fy-flag" title={f.kind === "twice" ? "The same amount on the same day and account more than once" : "Far above what this category usually is"}><CircleAlert size={12} />{flagLabel(f)}</span>);
  const chips: [string, string, number | undefined][] = [["all", "All", data?.counts.all], ["look", "Needs a look", data?.counts.look], ["typed", "Typed", data?.counts.typed], ["statement", "From a statement", data?.counts.statement], ["workbook", "From the workbook", data?.counts.workbook]];
  const chipOn = (k: string) => (k === "all" ? !filter.look && !filter.source : k === "look" ? filter.look === "1" : filter.source === k);
  const chipSet = (k: string) => { const p = latest(); p.delete("look"); p.delete("source"); if (k === "look") p.set("look", "1"); else if (k !== "all") p.set("source", k); go(p); };
  const csv = `/api/transactions/csv?${(() => { const p = query(0, 5000); p.delete("offset"); p.delete("limit"); return p; })()}`;

  return (
    <>
      <div className="fy-large"><div><div className="sub">Every record, to check</div><h1>Transactions</h1></div>
        <div style={{ display: "flex", gap: 8 }}>
          {!wide && <button className="fy-btn small" onClick={() => { setSelecting(!selecting); setPicked(new Set()); }} aria-pressed={selecting}>{selecting ? "Done" : "Select"}</button>}
          {wide && <a className="fy-btn small" href={csv} download><Download size={15} />Download CSV</a>}
        </div>
      </div>

      <div className="fy-tx-filters">
        <label className="fy-search"><Search size={16} /><input className="fy-input" type="search" placeholder="Search description, place, note" aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select className="fy-input" aria-label="Month" value={month} onChange={(e) => set("month", e.target.value === todayIn().slice(0, 7) ? "" : e.target.value)}>
          <option value="all">All time</option>
          {monthOptions.map((m) => <option key={m} value={m}>{wide ? MONTHS[Number(m.slice(5)) - 1] : MONTHS[Number(m.slice(5)) - 1].slice(0, 3)} {m.slice(0, 4)}</option>)}
        </select>
        <select className="fy-input" aria-label="Account" value={filter.account} onChange={(e) => set("account", e.target.value)}>
          <option value="">All accounts</option>{accounts.filter((a) => !a.archived || a.id === filter.account).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="fy-input" aria-label="Category" value={filter.category} onChange={(e) => set("category", e.target.value)}>
          <option value="">All categories</option><CategoryOptions cats={categories} kinds={["expense", "income", "saving", "investment"]} includeOff />
        </select>
        <select className="fy-input" aria-label="Kind" value={filter.kind} onChange={(e) => set("kind", e.target.value)}>
          <option value="">All kinds</option><option value="spend">Spending</option><option value="income">Income</option><option value="transfer">Transfers</option>
        </select>
      </div>
      <div className="fy-chips" role="group" aria-label="Show" style={{ margin: "10px 0 12px" }}>
        {chips.map(([k, label, n]) => <button key={k} className={`fy-chip ${chipOn(k) ? "on" : ""}`} aria-pressed={chipOn(k)} onClick={() => chipSet(k)} data-testid={`chip-${k}`}>{k === "look" && <CircleAlert size={13} />}{label}{n !== undefined ? ` ${n}` : ""}</button>)}
      </div>
      {filter.look === "1" && <div className="fy-note" style={{ marginBottom: 12 }}>Finny&apos;s guesses at mistakes: the <b>same amount twice</b> on one day and account, or a spend <b>far above</b> what that category usually is. Fix it, delete it, or mark it as looking fine.</div>}
      {err && <div className="fy-err" role="alert" style={{ marginBottom: 10 }}>{err}</div>}

      {data && !items.length && <div className="fy-card fy-empty" data-testid="tx-empty">{filter.look ? <><b>Nothing needs a look</b>No doubled amounts or unusual spends here.</> : <><b>No transactions</b>Nothing matches these filters.</>}</div>}
      {!data && loaded && !err && <div className="fy-card fy-empty">Loading…</div>}

      {items.length > 0 && (wide ? (
        <div className="fy-card fy-tx-wrap">
          <table className="fy-tx" data-testid="tx-table">
            <thead><tr>
              <th className="pick"><input type="checkbox" className="fy-tick" aria-label="Pick all on this page" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set(items.map((r) => r.id)))} /></th>
              <th aria-sort={ariaSort("date")}><button className="fy-sort" onClick={() => sortBy("date")}>Date {sortIcon("date")}</button></th>
              <th>Description</th><th>Category</th><th>Account</th><th>From</th>
              <th className="am" aria-sort={ariaSort("amount")}><button className="fy-sort" onClick={() => sortBy("amount")}>Amount {sortIcon("amount")}</button></th>
              <th className="act"><span className="fy-sr">Actions</span></th>
            </tr></thead>
            <tbody>{items.map((r) => (
              <tr key={r.id} className={`${picked.has(r.id) ? "on" : ""} ${r.flags.length ? "flag" : ""}`} data-testid="tx-row" data-id={r.id}>
                <td className="pick"><input type="checkbox" className="fy-tick" aria-label={`Pick ${name(r)}, ${shortDay(r.on)}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                <td className="dt">{shortDay(r.on)}</td>
                <td className="ds"><span className="t">{name(r)}</span>{r.entity && r.entity !== r.description ? <span className="s"> · {r.entity}</span> : null} {flags(r)}</td>
                <td>{catOf(r)}</td>
                <td>{r.kind === "transfer" ? "Transfer" : acc.get(r.accountId)}</td>
                <td className="src">{SOURCE[r.source]}</td>
                <td className="am"><Money sen={r.amountSen} kind={r.kind} /></td>
                <td className="act"><button className="fy-icon-btn" aria-label={`Edit ${name(r)}, ${shortDay(r.on)}`} onClick={() => openAdd(r)}><Pencil size={15} /></button>
                  <button className="fy-icon-btn" aria-label={`Delete ${name(r)}, ${shortDay(r.on)}`} onClick={() => removeOne(r)}><Trash2 size={15} /></button></td>
              </tr>))}</tbody>
          </table>
          <div className="fy-tx-foot" data-testid="tx-foot"><span>{data!.count} transaction{data!.count === 1 ? "" : "s"} · showing 1–{items.length}</span><span>Out {formatRupiah(data!.outSen)} · In {formatRupiah(data!.inSen)}</span></div>
        </div>
      ) : (
        <>
          <div className="fy-list" data-testid="tx-list">{items.map((r) => (
            <button key={r.id} className={`fy-row fy-tx-row ${picked.has(r.id) ? "on" : ""} ${r.flags.length ? "flag" : ""}`} data-testid="tx-row" data-id={r.id}
              aria-label={selecting ? `${picked.has(r.id) ? "Unpick" : "Pick"} ${name(r)}, ${shortDay(r.on)}` : `Edit ${name(r)}, ${shortDay(r.on)}`} aria-pressed={selecting ? picked.has(r.id) : undefined}
              onClick={() => (selecting ? toggle(r.id) : openAdd(r))}>
              {selecting && <span className={`fy-check ${picked.has(r.id) ? "on" : ""}`} aria-hidden="true">{picked.has(r.id) && <Check size={16} />}</span>}
              <div className="main"><div className="t">{name(r)} {flags(r)}</div><div className="s">{shortDay(r.on)} · {r.kind === "transfer" ? catOf(r) : `${catOf(r)} · ${acc.get(r.accountId) ?? ""}`} · {SOURCE[r.source]}</div></div>
              <Money sen={r.amountSen} kind={r.kind} />
            </button>))}</div>
          <div className="fy-tx-foot phone" data-testid="tx-foot"><span>{data!.count} · showing {items.length}</span><span>Out {formatRupiah(data!.outSen)} · In {formatRupiah(data!.inSen)}</span></div>
        </>
      ))}
      {data?.more && <button className="fy-btn block" style={{ marginTop: 12 }} onClick={more}>Load more</button>}
      {!wide && items.length > 0 && <a className="fy-more" href={csv} download style={{ display: "inline-flex", marginTop: 14 }}><Download size={15} /> Download these as a spreadsheet</a>}

      {pickedRows.length > 0 && (
        <div className="fy-bulk" role="region" aria-label="Picked transactions" data-testid="bulk">
          <b>{pickedRows.length} selected · {money(signed(pickedRows))}</b>
          <button className="fy-btn small ghost" disabled={busy} onClick={() => setRecat(true)}><Tag size={15} />Change category</button>
          {pickedRows.some((r) => r.flags.length) && <button className="fy-btn small ghost" disabled={busy} onClick={() => bulk("fine")}><Check size={15} />Looks fine</button>}
          <button className="fy-btn small danger-solid" disabled={busy} onClick={() => bulk("delete")}><Trash2 size={15} />Delete {pickedRows.length}</button>
          <button className="fy-icon-btn" aria-label="Clear the selection" onClick={() => setPicked(new Set())}><X size={18} /></button>
        </div>
      )}
      {recat && <RecategoriseSheet count={pickedRows.length} kinds={[...new Set(pickedRows.map((r) => r.kind))]} onClose={() => setRecat(false)} onPick={(id) => bulk("category", id)} busy={busy} />}
    </>
  );
}

function RecategoriseSheet({ count, kinds, onClose, onPick, busy }: { count: number; kinds: string[]; onClose: () => void; onPick: (id: string) => void; busy: boolean }) {
  const { categories } = useFinny();
  const [id, setId] = useState("");
  const income = kinds.includes("income") && !kinds.includes("spend");
  return (
    <Sheet title="Change category" onClose={onClose}>
      <p className="fy-hint" style={{ marginTop: 0 }}>For the {count} picked transaction{count > 1 ? "s" : ""}. Transfers have no category and keep none{kinds.includes("income") && kinds.includes("spend") ? "; income and spending can't share one, so only those that fit change" : ""}.</p>
      <label className="fy-field"><span className="fy-label">New category</span>
        <select className="fy-input" aria-label="New category" value={id} onChange={(e) => setId(e.target.value)}>
          <option value="">Pick a category…</option><CategoryOptions cats={categories} kinds={income ? ["income"] : ["expense", "saving", "investment", "income"]} />
        </select></label>
      <div className="fy-sheet-foot"><button className="fy-btn primary block" disabled={!id || busy} onClick={() => onPick(id)}>Change {count}</button></div>
    </Sheet>
  );
}
