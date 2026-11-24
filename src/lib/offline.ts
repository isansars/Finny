"use client";
// FINNY-150/151: what the phone knows about its connection, and the entries waiting to be sent. Everything here lives
// only on this device: the waiting entries in IndexedDB (falling back to nothing if it's unavailable), and the
// service worker's caches. Signing out clears both (clearDevice).
import { useEffect, useState, useSyncExternalStore } from "react";

// ---------------------------------------------------------------- connection state
export type Sent = { add: number; edit: number; delete: number };
type Net = { offline: boolean; asOf: string | null; sent: Sent | null };
let net: Net = { offline: false, asOf: null, sent: null };
const listeners = new Set<() => void>();
const emit = (next: Partial<Net>) => { net = { ...net, ...next }; listeners.forEach((l) => l()); };
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
/** The service worker answered from its kept copy (asOf = when that copy was fetched), or a request failed. */
export function markOffline(asOf: string | null) { if (!net.offline || (asOf && asOf !== "none" && asOf !== net.asOf)) emit({ offline: true, asOf: asOf && asOf !== "none" ? asOf : net.asOf }); }
export function markOnline() { if (net.offline) emit({ offline: false }); }
export const useNet = () => useSyncExternalStore(subscribe, () => net, () => net);
export const noteSent = (n: Sent | null) => emit({ sent: n && n.add + n.edit + n.delete ? n : null });

export class OfflineError extends Error { constructor() { super("You're offline."); this.name = "OfflineError"; } }

// ---------------------------------------------------------------- waiting entries
/** One item per new entry (op "add", keyed by its clientRef) or per transaction changed or deleted offline (FINNY-194,
 *  keyed "txn:<id>", with `base`: the transaction as the phone last saw it). A refused change keeps a `conflict`. */
export type Seen = { on: string; kind: string; amountSen: number; accountId: string; toAccountId: string | null; categoryId: string | null; description: string; note: string | null; entity: string | null };
export type Conflict = { kind: "changed"; current: Seen & { id: string } } | { kind: "gone" };
export type Waiting = { clientRef: string; op?: "add" | "edit" | "delete"; id?: string; base?: Seen; body: Record<string, unknown>; savedAt: string; force?: boolean; conflict?: Conflict };
export const seenOf = (t: Seen): Seen => ({ on: t.on, kind: t.kind, amountSen: t.amountSen, accountId: t.accountId, toAccountId: t.toAccountId ?? null, categoryId: t.categoryId ?? null, description: t.description ?? "", note: t.note ?? null, entity: t.entity ?? null });
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
  async get(ref: string): Promise<Waiting | null> { return (await tx("readonly", (s) => s.get(ref) as IDBRequest<Waiting | undefined>)) ?? null; },
  async list(): Promise<Waiting[]> { return ((await tx("readonly", (s) => s.getAll() as IDBRequest<Waiting[]>)) ?? []).sort((a, b) => a.savedAt.localeCompare(b.savedAt)); },
  async remove(ref: string) { await tx("readwrite", (s) => s.delete(ref)); changed(); },
  async clear() { await tx("readwrite", (s) => s.clear()); changed(); },
};
export function useOutbox() {
  const [items, setItems] = useState<Waiting[]>([]);
  useEffect(() => { let live = true; const load = () => outbox.list().then((x) => { if (live) setItems(x); }); load(); outboxListeners.add(load); return () => { live = false; outboxListeners.delete(load); }; }, []);
  return items;
}

/** FINNY-194: a change made without a connection. A waiting new entry is simply rewritten; a transaction already in
 *  Finny keeps the base it was first changed from (so a second change still checks against Finny's version). */
export async function queueEdit(t: Seen & { id: string; waitingRef?: string }, body: Record<string, unknown>) {
  if (t.waitingRef) { const w = await outbox.get(t.waitingRef); if (w) { await outbox.add({ ...w, body, conflict: undefined }); return; } }
  const ref = `txn:${t.id}`, prev = await outbox.get(ref);
  await outbox.add({ clientRef: ref, op: "edit", id: t.id, base: prev?.base ?? seenOf(t), body, savedAt: prev?.savedAt ?? new Date().toISOString() });
}
/** A delete made without a connection. A waiting new entry is just dropped; a waiting change becomes a delete. */
export async function queueDelete(t: Seen & { id: string; waitingRef?: string }) {
  if (t.waitingRef) { const w = await outbox.get(t.waitingRef); if (w?.op === "edit") { await outbox.add({ ...w, op: "delete", body: {}, conflict: undefined }); return; } if (w) { await outbox.remove(w.clientRef); return; } }
  const ref = `txn:${t.id}`, prev = await outbox.get(ref);
  await outbox.add({ clientRef: ref, op: "delete", id: t.id, base: prev?.base ?? seenOf(t), body: {}, savedAt: prev?.savedAt ?? new Date().toISOString() });
}

/** Sends waiting items oldest first. A 2xx removes one; a refusal (4xx) removes a new entry, while a change or delete that
 *  Finny refuses because the transaction changed or went elsewhere stays as a conflict for the owner to decide; a delete
 *  of something already gone just goes; a network failure stops and keeps the rest. */
export async function flushOutbox(): Promise<{ sent: Sent; refused: string[] }> {
  const items = await outbox.list(); const sent: Sent = { add: 0, edit: 0, delete: 0 }; const refused: string[] = []; let answered = false;
  for (const w of items) {
    if (w.conflict) continue;
    const op = w.op ?? "add", expect = w.force ? undefined : w.base;
    const req: [string, RequestInit] = op === "add" ? ["/api/transactions", { method: "POST", body: JSON.stringify({ ...w.body, clientRef: w.clientRef }) }]
      : op === "edit" ? [`/api/transactions/${w.id}`, { method: "PATCH", body: JSON.stringify({ ...w.body, expect }) }]
      : [`/api/transactions/${w.id}?undo=1`, { method: "DELETE", body: JSON.stringify({ expect }) }];
    let res: Response;
    try { res = await fetch(req[0], { ...req[1], headers: { "content-type": "application/json" } }); }
    catch { markOffline(null); break; }
    if (res.headers.get("x-finny-offline")) { markOffline(res.headers.get("x-finny-offline")); break; }
    if (res.status === 401 || res.status >= 500) break; // try again later
    answered = true;
    const out = (await res.json().catch(() => ({}))) as { error?: string; current?: Seen & { id: string } };
    if (res.ok) { sent[op]++; await outbox.remove(w.clientRef); continue; }
    if (op === "delete" && res.status === 404) { await outbox.remove(w.clientRef); continue; } // already gone elsewhere
    if (op !== "add" && res.status === 409 && out.current) { await outbox.add({ ...w, force: false, conflict: { kind: "changed", current: out.current } }); continue; }
    if (op === "edit" && res.status === 404) { await outbox.add({ ...w, force: false, conflict: { kind: "gone" } }); continue; }
    refused.push(out.error ?? `refused (${res.status})`);
    await outbox.remove(w.clientRef);
  }
  if (answered) markOnline();
  return { sent, refused };
}
/** The owner's answer to a conflict: keep Finny's version (drop this phone's), or send this phone's anyway. "Add it
 *  back" turns a change to a transaction deleted elsewhere into a new entry. */
export async function resolveConflict(w: Waiting, keep: "finny" | "phone") {
  if (keep === "finny") { await outbox.remove(w.clientRef); return; }
  if (w.conflict?.kind === "gone") { await outbox.remove(w.clientRef); const ref = crypto.randomUUID(); await outbox.add({ clientRef: ref, op: "add", body: w.body, savedAt: new Date().toISOString() }); return; }
  await outbox.add({ ...w, force: true, conflict: undefined });
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
