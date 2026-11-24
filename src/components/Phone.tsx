"use client";
// Finny on your home screen (FINNY-150/151), as approved in "Sprint 15 · Design notes (Finny on your home screen,
// approved)": the service worker, sending what waits on this phone, the offline banner, Settings › Finny on your
// phone, and signing out that clears the phone first.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, CircleAlert, Clock, Download, LogOut, Share, SquarePlus, Smartphone, WifiOff } from "lucide-react";
import { useFinny } from "./store";
import { CatTile, Tile } from "./icons";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { clearDevice, flushOutbox, noteSent, promptInstall, resolveConflict, useInstall, useNet, useOutbox, type Sent, type Seen, type Waiting } from "@/lib/offline";

const time = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : null);

/** Registers the service worker (production builds only) and sends what's waiting: on open, when the connection comes
 *  back, and every 30 s while something waits. */
export function PhoneSync() {
  const { reload } = useFinny();
  const busy = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const send = async () => {
      if (busy.current) return; busy.current = true;
      try { const r = await flushOutbox(); if (r.sent.add + r.sent.edit + r.sent.delete) { noteSent(r.sent); await reload().catch(() => {}); } if (r.refused.length) alert(`Finny couldn't send ${r.refused.length} saved ${r.refused.length === 1 ? "entry" : "entries"}: ${r.refused.join("; ")}`); }
      finally { busy.current = false; }
    };
    send();
    // FINNY-178: the visible part of the screen (the on-screen keyboard shrinks it), so a sheet on a phone fits above it.
    const vv = window.visualViewport;
    const fit = () => { if (!vv) return; const r = document.documentElement.style; r.setProperty("--vvh", `${Math.round(vv.height)}px`); r.setProperty("--vvt", `${Math.round(vv.offsetTop)}px`); };
    fit(); vv?.addEventListener("resize", fit); vv?.addEventListener("scroll", fit);
    window.addEventListener("online", send);
    const t = setInterval(send, 30000);
    return () => { window.removeEventListener("online", send); clearInterval(t); vv?.removeEventListener("resize", fit); vv?.removeEventListener("scroll", fit); };
  }, [reload]);
  return null;
}

/** Home: offline with the time of the numbers shown, or "Back online · N entries sent". */
/** "Back online · 2 entries sent" for new entries only; "1 new, 1 change and 1 delete sent" once changes went too. */
export function sentText(s: Sent) {
  if (!s.edit && !s.delete) return `${s.add} ${s.add === 1 ? "entry" : "entries"} sent`;
  const parts = [s.add && `${s.add} new`, s.edit && `${s.edit} change${s.edit === 1 ? "" : "s"}`, s.delete && `${s.delete} delete${s.delete === 1 ? "" : "s"}`].filter(Boolean) as string[];
  return `${parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]} sent`;
}
export function OfflineBanner() {
  const { offline, asOf, sent } = useNet();
  const [shownSent, setShownSent] = useState<Sent | null>(null);
  useEffect(() => { if (!sent) return; setShownSent(sent); const t = setTimeout(() => { setShownSent(null); noteSent(null); }, 8000); return () => clearTimeout(t); }, [sent]); // eslint-disable-line react-hooks/set-state-in-effect
  if (offline) return <div className="fy-offline" role="status" data-testid="offline-banner"><WifiOff size={16} style={{ flex: "none" }} /><span>Offline{time(asOf) ? ` · numbers as of ${time(asOf)}` : ""}. Changes wait on this phone.</span></div>;
  if (shownSent) return <div className="fy-online" role="status" data-testid="online-banner"><Check size={16} style={{ flex: "none" }} /><span>Back online · {sentText(shownSent)}</span></div>;
  return null;
}

/** A waiting item as the edit dialog's transaction: what the phone will send (FINNY-194). */
type Body = { kind?: string; amount?: string; on?: string; description?: string; categoryId?: string | null; accountId?: string; toAccountId?: string | null; entity?: string | null; note?: string | null };
function asTxn(w: Waiting) {
  const b = w.body as Body, base = w.base;
  return { id: w.id ?? w.clientRef, waitingRef: w.clientRef, on: b.on ?? base?.on ?? "", kind: (b.kind ?? base?.kind ?? "spend") as "spend" | "income" | "transfer",
    amountSen: b.amount !== undefined ? parseRupiah(String(b.amount)) ?? 0 : base?.amountSen ?? 0, accountId: b.accountId ?? base?.accountId ?? "", toAccountId: b.toAccountId ?? base?.toAccountId ?? null,
    categoryId: (b.categoryId || null) ?? base?.categoryId ?? null, entity: b.entity ?? base?.entity ?? null, description: b.description ?? base?.description ?? "", note: b.note ?? base?.note ?? null };
}
const shortDay = (d: string) => (d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z")) : "");

/** Home: what this phone keeps to send: new entries, changes and deletes (FINNY-151, FINNY-194). Tap one to change it
 *  again; Keep it cancels a delete. */
export function WaitingList() {
  const items = useOutbox().filter((w) => !w.conflict);
  const { accounts, categories, openAdd } = useFinny();
  if (!items.length) return null;
  const sign = (k: string) => (k === "income" ? "+" : k === "spend" ? "−" : "");
  return (
    <>
      <div className="fy-section"><span>Waiting to send</span><span>{items.length}</span></div>
      <div className="fy-list" data-testid="waiting">{items.map((w) => {
        const t = asTxn(w), op = w.op ?? "add";
        const c = categories.find((x) => x.id === t.categoryId), a = accounts.find((x) => x.id === t.accountId)?.name ?? "";
        const name = t.description || c?.name || "Transfer";
        const sub = [op !== "add" && shortDay(t.on), c?.name, a].filter(Boolean).join(" · ") + (op === "edit" && w.base && w.base.amountSen !== t.amountSen ? ` · was ${formatRupiah(w.base.amountSen, { prefix: false })}` : "");
        const amt = <div className={`fy-amt ${t.kind === "income" ? "income" : t.kind === "spend" ? "spend" : ""}`}>{op === "delete" ? <s>{sign(t.kind)}{formatRupiah(t.amountSen, { prefix: false })}</s> : <>{sign(t.kind)}{formatRupiah(t.amountSen, { prefix: false })}</>}</div>;
        const tag = <div className="fy-waiting"><Clock size={12} /> {op === "add" ? "new, waiting" : op === "edit" ? "change waiting" : "delete waiting"}</div>;
        const tile = c ? <CatTile c={c} /> : <Tile icon="arrow-left-right" color="lavender" />;
        if (op === "delete") return (
          <div className="fy-row fy-faded" key={w.clientRef} data-op="delete">{tile}
            <div className="main"><div className="t"><s>{name}</s></div><div className="s">{sub}</div></div>
            <div style={{ textAlign: "right", flex: "none" }}>{amt}{tag}<button className="fy-chip" style={{ marginTop: 6 }} aria-label={`Keep ${name}`} onClick={() => outboxKeep(w)}>Keep it</button></div>
          </div>);
        return (
          <button className="fy-row" key={w.clientRef} data-op={op} aria-label={`Change ${name}, waiting`} onClick={() => openAdd(t)}>{tile}
            <div className="main"><div className="t">{name}</div><div className="s">{sub}</div></div>
            <div style={{ textAlign: "right", flex: "none" }}>{amt}{tag}</div>
          </button>);
      })}</div>
      <p className="fy-hint" style={{ marginTop: 8 }}>Tap one to change it again or cancel it before it&apos;s sent.</p>
    </>
  );
}
const outboxKeep = (w: Waiting) => resolveConflict(w, "finny");

/** Home: a change or delete Finny refused because the transaction changed, or went, on another device meanwhile
 *  (FINNY-195). Nothing is overwritten without asking. */
export function Conflicts() {
  const items = useOutbox().filter((w) => w.conflict);
  const { accounts, categories, reload } = useFinny();
  const [busy, setBusy] = useState(false);
  if (!items.length) return null;
  const decide = async (w: Waiting, keep: "finny" | "phone") => {
    setBusy(true);
    try { await resolveConflict(w, keep); if (keep === "phone") { const r = await flushOutbox(); if (r.sent.add + r.sent.edit + r.sent.delete) noteSent(r.sent); } await reload().catch(() => {}); } finally { setBusy(false); }
  };
  const side = (label: string, t: Seen | null, deleted = false) => {
    const c = t && categories.find((x) => x.id === t.categoryId), a = t && accounts.find((x) => x.id === t.accountId)?.name;
    return <div className="fy-card" style={{ padding: 12, boxShadow: "none", border: "1px solid var(--border)" }}><div className="fy-label">{label}</div>
      {deleted || !t ? <b style={{ fontSize: 17 }}>{deleted ? "Deleted" : "—"}</b> : <><b style={{ fontSize: 18 }}>{t.kind === "spend" ? "−" : t.kind === "income" ? "+" : ""}{formatRupiah(t.amountSen, { prefix: false })}</b>
        <div className="fy-hint" style={{ margin: "4px 0 0" }}>{shortDay(t.on)}{c ? ` · ${c.name}` : ""}{a ? ` · ${a}` : ""}{t.note ? <><br />“{t.note}”</> : null}</div></>}</div>;
  };
  return <>{items.map((w) => {
    const mine = w.op === "delete" ? null : (asTxn(w) as unknown as Seen), name = asTxn(w).description || "This transaction";
    const gone = w.conflict!.kind === "gone", current = w.conflict!.kind === "changed" ? w.conflict!.current : null;
    return (
      <div className="fy-card fy-pad fy-conflict" key={w.clientRef} role="region" aria-label={`${name} ${gone ? "was deleted" : "changed"} somewhere else`} data-testid="conflict">
        <div style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 800 }}><CircleAlert size={18} style={{ flex: "none" }} />{name} {gone ? "was deleted somewhere else" : "changed somewhere else"}</div>
        <p className="fy-hint" style={{ margin: "6px 0 12px" }}>{gone ? `While this phone was offline, ${name} was deleted on another device. Add your version back, or let it go?` : `While this phone was offline, ${name} was also changed on another device. Which one should stay?`}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{side("This phone", mine, w.op === "delete")}{side("In Finny now", current, gone)}</div>
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="fy-btn" style={{ flex: 1 }} disabled={busy} onClick={() => decide(w, "finny")}>{gone ? "Let it go" : "Keep Finny's"}</button>
          <button className="fy-btn primary" style={{ flex: 1 }} disabled={busy} onClick={() => decide(w, "phone")}>{gone ? "Add it back" : w.op === "delete" ? "Delete it anyway" : "Use this phone's"}</button>
        </div>
      </div>);
  })}</>;
}

/** Settings: the way into Finny on your phone. */
export function PhoneRow() {
  return (
    <Link className="fy-row" href="/settings/phone" aria-label="Finny on your phone"><span className="fy-tile" data-color="pink" style={{ width: 32, height: 32, borderRadius: 10 }}><Smartphone size={18} /></span>
      <div className="main"><div className="t">Finny on your phone</div><div className="s">Install it; works without a connection</div></div><ChevronRight className="chev" size={18} /></Link>
  );
}

export function PhonePage() {
  const can = useInstall();
  const waiting = useOutbox();
  const [installed, setInstalled] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setInstalled(window.matchMedia?.("(display-mode: standalone)").matches ?? false); }, []);
  return (
    <>
      <Link className="fy-back" href="/settings"><ChevronLeft size={20} />Settings</Link>
      <div className="fy-large"><div><div className="sub">Settings</div><h1>Finny on your phone</h1></div></div>
      <div className="fy-card fy-pad" style={{ textAlign: "center", marginBottom: 12 }} data-testid="install-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={72} height={72} style={{ borderRadius: 18, margin: "0 auto 8px", display: "block" }} />
        <div style={{ fontWeight: 800 }}>{installed ? "Finny is on your home screen" : "Put Finny on your home screen"}</div>
        <div className="fy-hint" style={{ margin: "4px 0 10px" }}>Its own icon, full screen, straight to Home. It opens without a connection, and what you add waits until you&apos;re online.</div>
        {!installed && (can ? <button className="fy-btn primary block" onClick={() => promptInstall()}><Download size={16} />Install Finny</button>
          : <div className="fy-hint" style={{ margin: 0 }}>On Android and in Chrome, use Install Finny or the browser&apos;s menu › Install app. On iPhone, follow the steps below.</div>)}
      </div>
      <div className="fy-section"><span>On iPhone (Safari)</span></div>
      <div className="fy-list">
        <div className="fy-row"><span className="fy-tile" data-color="sky" style={{ width: 32, height: 32, borderRadius: 10 }}><Share size={18} /></span><div className="main"><div className="t">1 · Tap Share</div><div className="s">the square with the arrow, at the bottom</div></div></div>
        <div className="fy-row"><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><SquarePlus size={18} /></span><div className="main"><div className="t">2 · Add to Home Screen</div><div className="s">scroll down the list to find it</div></div></div>
        <div className="fy-row"><span className="fy-tile" data-color="mint" style={{ width: 32, height: 32, borderRadius: 10 }}><Smartphone size={18} /></span><div className="main"><div className="t">3 · Open Finny from its icon</div><div className="s">sign in once; it remembers you</div></div></div>
      </div>
      <div className="fy-section"><span>On this phone</span></div>
      <div className="fy-list"><div className="fy-row"><div className="main"><div className="t">Waiting to send</div><div className="s">entries saved without a connection</div></div><span className="fy-amt" data-testid="waiting-count">{waiting.length}</span></div></div>
      <p className="fy-hint" style={{ marginTop: 10 }}>The last numbers Finny showed and anything waiting are kept only on this phone. Signing out clears them.</p>
    </>
  );
}

/** Settings: sign out, clearing what this phone keeps first (the kept numbers and anything waiting). */
export function SignOutButton({ action }: { action: () => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form ref={form} action={action} style={{ margin: 0 }}>
      <button type="button" className="fy-row fy-linkish" style={{ width: "100%" }} disabled={busy} data-testid="sign-out"
        onClick={async () => { setBusy(true); await clearDevice(); form.current?.requestSubmit(); }}>
        <span className="fy-tile" data-color="slate" style={{ width: 32, height: 32, borderRadius: 10 }}><LogOut size={18} /></span>
        <div className="main"><div className="t">Sign out</div></div><ChevronRight className="chev" size={18} /></button>
    </form>
  );
}
