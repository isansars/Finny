"use client";
// FINNY-215: "Check with statements" for one account, and "Possible doubles" (approved design, Sprint 23 screens 5 and 6).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, CircleAlert, Undo2 } from "lucide-react";
import { api, useFinny, type Txn } from "./store";
import { formatRupiah } from "@/lib/money";
import { shortDate } from "@/lib/dates";

type Point = { on: string; bankSen: number; finnySen: number; apartSen: number };
type Check = { account: { id: string; name: string; type: string }; statements: number; withoutDates: number; points: Point[]; matched: number;
  parted: { on: string; apartSen: number; steady: boolean; from: string | null } | null };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthOf = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const owes = (t: string) => t === "card" || t === "loan";
/** How a balance reads: a card's as what's owed. */
const shown = (type: string, sen: number) => formatRupiah(owes(type) ? -sen : sen);

export function StatementCheck({ id }: { id: string }) {
  const { openAdd, version } = useFinny();
  const [c, setC] = useState<Check | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<Check>(`accounts/${id}/checkpoints`).then(setC).catch((e) => setErr((e as Error).message)); }, [id, version]);
  if (err) return <div className="fy-err" role="alert">{err}</div>;
  if (!c) return <div className="fy-empty" style={{ padding: 24 }}>Checking…</div>;
  const t = c.account.type, p = c.parted;
  // Finny lower than the bank: money in (or a smaller charge) is missing; higher: money out is missing.
  const diff = p ? Math.abs(p.apartSen) : 0;
  const lower = p ? p.apartSen < 0 : false;
  const word = (sen: number) => formatRupiah(Math.abs(sen));
  function addDifference() {
    if (!p) return;
    const draft: Txn = { id: "", on: p.on, kind: lower ? "income" : "spend", amountSen: diff, accountId: c!.account.id, toAccountId: null, categoryId: null, entity: null,
      description: "Difference with the bank statement", note: `Check with statements, ${shortDate(p.on)}` };
    openAdd(draft);
  }
  return (
    <>
      <Link className="fy-back" href="/accounts"><ChevronLeft size={20} />Accounts</Link>
      <div className="fy-large"><div><div className="sub">{c.account.name}</div><h1>Check with statements</h1></div></div>
      {!c.points.length ? (
        <div className="fy-card fy-pad" data-testid="no-dates">
          <b>No statement dates yet.</b>
          <p style={{ margin: "6px 0 10px", color: "var(--text-2)" }}>{c.statements
            ? `${c.statements} statement${c.statements > 1 ? "s were" : " was"} saved before Finny kept balances. Upload ${c.statements > 1 ? "them" : "it"} again under Bank statements to add ${c.statements > 1 ? "their" : "its"} dates; nothing is saved twice.`
            : "Read this account's bank statements and each one's opening and closing balance appears here."}</p>
          <Link className="fy-btn primary block" href="/import/statements">Bank statements</Link>
        </div>
      ) : (
        <>
          {p ? (
            <div className="fy-card fy-pad fy-gap" data-testid="parted"><div className="h"><CircleAlert size={18} /> Parted on {shortDate(p.on)}</div>
              <div className="b">{c.matched} of {c.points.length} statement dates match. On {shortDate(p.on)} Finny is {word(p.apartSen)} {(owes(t) ? !lower : lower) ? "lower" : "higher"} than the bank
                {p.steady ? `, and the gap has stayed the same since: something ${p.from ? `between ${shortDate(p.from)} and ${shortDate(p.on)}` : `before ${shortDate(p.on)}`} is ${lower ? "missing" : "extra"}.` : ", and the gap changes after that: look at the first period first."}</div></div>
          ) : (
            <div className="fy-ok" data-testid="parted"><Check size={16} /> All {c.points.length} statement dates match Finny</div>
          )}
          {c.withoutDates > 0 && <div className="fy-note" style={{ margin: "8px 0" }}>{c.withoutDates} older statement{c.withoutDates > 1 ? "s have" : " has"} no dates yet: upload {c.withoutDates > 1 ? "them" : "it"} again to add {c.withoutDates > 1 ? "them" : "it"}.</div>}
          <div className="fy-section"><span>Every statement date</span></div>
          <div className="fy-list" data-testid="points">
            {[...c.points].reverse().map((x) => (
              <div className="fy-row" key={x.on} data-testid="point" data-apart={x.apartSen}>
                <span className="fy-tile" data-color={x.apartSen ? "lemon" : "mint"} style={{ width: 32, height: 32, borderRadius: 10 }}>{x.apartSen ? <CircleAlert size={18} /> : <Check size={18} />}</span>
                <div className="main"><div className="t">{shortDate(x.on)}{p && x.on === p.on ? " · first" : ""}</div>
                  <div className="s">{x.apartSen ? `Bank ${shown(t, x.bankSen)} · Finny ${shown(t, x.finnySen)}` : `Statement and Finny: ${shown(t, x.bankSen)}`}</div></div>
                {x.apartSen !== 0 && <span className="fy-pill" style={{ background: "var(--lemon-s)", color: "var(--lemon-i)" }}>{word(x.apartSen)} apart</span>}
              </div>
            ))}
          </div>
          {p && (
            <div className="fy-sheet-foot">
              <Link className="fy-btn primary block" href={`/transactions?account=${c.account.id}&month=${p.on.slice(0, 7)}`}>See {monthOf(p.on)}&apos;s lines</Link>
              <button className="fy-btn block" style={{ marginTop: 8 }} onClick={addDifference}>Add the difference as one line</button>
            </div>
          )}
        </>
      )}
    </>
  );
}

type Side = { id: string; on: string; kind: string; amountSen: number; description: string; account: string; toAccount: string | null };
type Double = { reason: "card" | "transfer" | "same-day"; sure: boolean; removeId: string; keepId: string; daysApart: number; apartSen: number; remove: Side; keep: Side };
const REASON: Record<Double["reason"], string> = { card: "A card payment added twice", transfer: "A transfer seen by both banks", "same-day": "Same amount, same day" };

export function Doubles() {
  const { reload } = useFinny();
  const [list, setList] = useState<Double[] | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ n: number; undoId: string } | null>(null);
  const load = useCallback(() => api<{ doubles: Double[] }>("transactions/doubles").then((r) => { setList(r.doubles); setTicked(new Set(r.doubles.filter((d) => d.sure).map((d) => d.removeId))); }).catch((e) => setErr((e as Error).message)), []);
  useEffect(() => { load(); }, [load]);
  const toggle = (id: string) => setTicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function remove() {
    setBusy(true); setErr("");
    try {
      const r = await api<{ changed: number; undoId: string }>("transactions/bulk", { method: "POST", json: { action: "delete", ids: [...ticked] } });
      setDone({ n: r.changed, undoId: r.undoId }); await reload(); await load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function notDouble(d: Double) {
    setBusy(true); setErr("");
    try { await api("transactions/bulk", { method: "POST", json: { action: "fine", ids: [d.removeId] } }); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function undo() {
    if (!done) return; setBusy(true);
    try { await api("transactions/undo", { method: "POST", json: { undoId: done.undoId } }); setDone(null); await reload(); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const sub = (d: Double) => d.reason === "card" ? `${d.keep.account} → ${d.keep.toAccount}, ${shortDate(d.keep.on)}${d.apartSen ? `, ${formatRupiah(d.apartSen)} apart` : ", same amount"}`
    : d.reason === "transfer" ? `Also on ${shortDate(d.keep.on)}${d.daysApart ? ` (${d.daysApart} day${d.daysApart > 1 ? "s" : ""} apart)` : ""}` : "Could be two: left unticked";
  const title = (s: Side) => `${s.description || (s.kind === "transfer" ? `${s.account} → ${s.toAccount}` : s.account)}, ${shortDate(s.on)}`;
  return (
    <>
      <a className="fy-back" href="/settings"><ChevronLeft size={20} />Settings</a>
      <div className="fy-large"><div><div className="sub">Settings</div><h1>Possible doubles</h1></div></div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {done && <div className="fy-ok" role="status" data-testid="removed"><Check size={16} /> Removed {done.n}. <button className="fy-btn small" style={{ marginLeft: "auto" }} disabled={busy} onClick={undo}><Undo2 size={16} /> Undo</button></div>}
      {!list ? <div className="fy-empty" style={{ padding: 24 }}>Looking…</div> : !list.length ? (
        <div className="fy-ok" data-testid="none"><Check size={16} /> Nothing looks recorded twice</div>
      ) : (
        <>
          <div className="fy-note" style={{ marginBottom: 10, lineHeight: 1.45 }}>Finny found lines that look recorded twice. Tick the ones to remove; you can undo for a day.</div>
          {(["card", "transfer", "same-day"] as const).filter((r) => list.some((d) => d.reason === r)).map((r) => (
            <div key={r} data-testid={`group-${r}`}>
              <div className="fy-section"><span>{REASON[r]}</span></div>
              <div className="fy-list">
                {list.filter((d) => d.reason === r).map((d) => (
                  <div className="fy-row" key={d.removeId} data-testid="double">
                    <button type="button" role="checkbox" aria-checked={ticked.has(d.removeId)} aria-label={`Remove ${title(d.remove)}`} className={`fy-check${ticked.has(d.removeId) ? " on" : ""}`} onClick={() => toggle(d.removeId)}>{ticked.has(d.removeId) && <Check size={16} />}</button>
                    <div className="main"><div className="t">{title(d.remove)}</div><div className="s">{sub(d)}</div></div>
                    <div style={{ textAlign: "right", flex: "none" }}><span className="fy-amt">{formatRupiah(d.remove.amountSen, { prefix: false })}</span>
                      <div><button type="button" className="fy-more" style={{ padding: 0, fontSize: 12.5 }} disabled={busy} onClick={() => notDouble(d)}>Not a double</button></div></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="fy-sheet-foot"><button className="fy-btn primary block" disabled={!ticked.size || busy} onClick={remove}>{ticked.size ? `Remove ${ticked.size}` : "Tick the ones to remove"}</button></div>
        </>
      )}
    </>
  );
}
