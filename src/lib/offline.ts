"use client";
// FINNY-150/151: what the phone knows about its connection, and the entries waiting to be sent. Everything here lives
// only on this device: the waiting entries in IndexedDB (falling back to nothing if it's unavailable), and the
// service worker's caches. Signing out clears both (clearDevice).
import { useEffect, useState, useSyncExternalStore } from "react";

// ---------------------------------------------------------------- connection state
type Net = { offline: boolean; asOf: string | null; sent: number };
let net: Net = { offline: false, asOf: null, sent: 0 };
const listeners = new Set<() => void>();
const emit = (next: Partial<Net>) => { net = { ...net, ...next }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
/** The service worker answered from its kept copy (asOf = when that copy was fetched), or a request failed. */
export function markOffline(asOf: string | null) { if (!net.offline || (asOf && asOf !== "none" && asOf !== net.asOf)) emit({ offline: true, asOf: asOf && asOf !== "none" ? asOf : net.asOf }); }
export function markOnline() { if (net.offline) emit({ offline: false }); }
export const useNet = () => useSyncExternalStore(subscribe, () => net, () => net);
export const noteSent = (n: number) => emit({ sent: n });

export class OfflineError extends Error { constructor() { super("You're offline."); this.name = "OfflineError"; } }

// ---------------------------------------------------------------- waiting entries
export type Waiting = { clientRef: string; body: Record<string, unknown>; savedAt: string };
const DB = "finny", STORE = "outbox";
function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "clientRef" });
      r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open(); if (!db) return null;
  return new Promise((resolve) => {
    const t = db.transaction(STORE, mode), r = fn(t.objectStore(STORE));
    t.oncomplete = () => { resolve(r.result); db.close(); }; t.onerror = () => { resolve(null); db.close(); };
  });
}
const outboxListeners = new Set<() => void>();
const changed = () => outboxListeners.forEach((l) => l());
export const outbox = {
  async add(w: Waiting) { await tx("readwrite", (s) => s.put(w)); changed(); },
  async list(): Promise<Waiting[]> { return ((await tx("readonly", (s) => s.getAll() as IDBRequest<Waiting[]>)) ?? []).sort((a, b) => a.savedAt.localeCompare(b.savedAt)); },
  async remove(ref: string) { await tx("readwrite", (s) => s.delete(ref)); changed(); },
  async clear() { await tx("readwrite", (s) => s.clear()); changed(); },
};
export function useOutbox() {
  const [items, setItems] = useState<Waiting[]>([]);
  useEffect(() => { let live = true; const load = () => outbox.list().then((x) => { if (live) setItems(x); }); load(); outboxListeners.add(load); return () => { live = false; outboxListeners.delete(load); }; }, []);
  return items;
}

/** Sends waiting entries oldest first. A 2xx or a refusal (4xx) removes one; a network failure stops and keeps the rest. */
export async function flushOutbox(): Promise<{ sent: number; refused: string[] }> {
  const items = await outbox.list(); let sent = 0; const refused: string[] = [];
  for (const w of items) {
    let res: Response;
    try { res = await fetch("/api/transactions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...w.body, clientRef: w.clientRef }) }); }
    catch { markOffline(null); break; }
    if (res.headers.get("x-finny-offline")) { markOffline(res.headers.get("x-finny-offline")); break; }
    if (res.status === 401 || res.status >= 500) break; // try again later
    if (res.ok) sent++; else refused.push(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `refused (${res.status})`);
    await outbox.remove(w.clientRef);
  }
  if (sent || refused.length) markOnline();
  return { sent, refused };
}

/** Sign out: empty the service worker's caches and the waiting entries on this phone. */
export async function clearDevice() {
  try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* no caches */ }
  await outbox.clear();
}

// ---------------------------------------------------------------- install
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: BIP | null = null;
const installListeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIP; installListeners.forEach((l) => l()); });
  window.addEventListener("online", () => markOnline());
}
export const useInstall = () => useSyncExternalStore((l) => { installListeners.add(l); return () => installListeners.delete(l); }, () => deferred, () => null);
export async function promptInstall() { if (!deferred) return false; await deferred.prompt(); const c = await deferred.userChoice; deferred = null; installListeners.forEach((l) => l()); return c.outcome === "accepted"; }
