"use client";
// Finny on your home screen (FINNY-150/151), as approved in "Sprint 15 · Design notes (Finny on your home screen,
// approved)": the service worker, sending what waits on this phone, the offline banner, Settings › Finny on your
// phone, and signing out that clears the phone first.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Clock, Download, LogOut, Share, SquarePlus, Smartphone, WifiOff } from "lucide-react";
import { useFinny } from "./store";
import { CatTile, Tile } from "./icons";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { clearDevice, flushOutbox, noteSent, promptInstall, useInstall, useNet, useOutbox } from "@/lib/offline";

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
      try { const r = await flushOutbox(); if (r.sent) { noteSent(r.sent); await reload().catch(() => {}); } if (r.refused.length) alert(`Finny couldn't send ${r.refused.length} saved ${r.refused.length === 1 ? "entry" : "entries"}: ${r.refused.join("; ")}`); }
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
export function OfflineBanner() {
  const { offline, asOf, sent } = useNet();
  const [shownSent, setShownSent] = useState(0);
  useEffect(() => { if (!sent) return; setShownSent(sent); const t = setTimeout(() => { setShownSent(0); noteSent(0); }, 8000); return () => clearTimeout(t); }, [sent]); // eslint-disable-line react-hooks/set-state-in-effect
  if (offline) return <div className="fy-offline" role="status" data-testid="offline-banner"><WifiOff size={16} style={{ flex: "none" }} /><span>Offline{time(asOf) ? ` · numbers as of ${time(asOf)}` : ""}. New entries wait on this phone.</span></div>;
  if (shownSent) return <div className="fy-online" role="status" data-testid="online-banner"><Check size={16} style={{ flex: "none" }} /><span>Back online · {shownSent} {shownSent === 1 ? "entry" : "entries"} sent</span></div>;
  return null;
}

/** Home: entries saved on this phone, not sent yet. */
export function WaitingList() {
  const items = useOutbox();
  const { accounts, categories } = useFinny();
  if (!items.length) return null;
  return (
    <>
      <div className="fy-section"><span>Waiting to send</span><span>{items.length}</span></div>
      <div className="fy-list" data-testid="waiting">{items.map((w) => {
        const b = w.body as { kind: string; amount: string; description?: string; categoryId?: string; accountId: string; toAccountId?: string };
        const c = categories.find((x) => x.id === b.categoryId), a = accounts.find((x) => x.id === b.accountId)?.name ?? "";
        const sen = parseRupiah(String(b.amount)) ?? 0;
        return (
          <div className="fy-row" key={w.clientRef}>{c ? <CatTile c={c} /> : <Tile icon="arrow-left-right" color="lavender" />}
            <div className="main"><div className="t">{b.description || c?.name || "Transfer"}</div><div className="s">{c ? `${c.name} · ` : ""}{a}</div></div>
            <div style={{ textAlign: "right", flex: "none" }}><div className={`fy-amt ${b.kind === "income" ? "income" : b.kind === "spend" ? "spend" : ""}`}>{b.kind === "income" ? "+" : b.kind === "spend" ? "−" : ""}{formatRupiah(sen, { prefix: false })}</div>
              <div className="fy-waiting"><Clock size={12} /> waiting to send</div></div>
          </div>);
      })}</div>
    </>
  );
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
