"use client";
// The app's shared data: accounts (with balances) and categories, reloaded after any change. A `version` counter tells
// lists to fetch again (the transaction list, the month totals).
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Account = { id: string; name: string; type: string; emoji: string | null; openingSen: number; openingOn: string; limitSen: number | null; statementDay: number | null; archived: boolean; position: number; balanceSen: number; card?: { used: number; limit: number | null; available: number | null } };
export type Category = { id: string; kind: string; name: string; emoji: string | null; parentId: string | null; active: boolean; position: number };
export type Txn = { id: string; on: string; kind: "spend" | "income" | "transfer"; amountSen: number; accountId: string; toAccountId: string | null; categoryId: string | null; entity: string | null; description: string; note: string | null };

type Ctx = { accounts: Account[]; categories: Category[]; loaded: boolean; version: number; reload: () => Promise<void>; openAdd: (t?: Txn) => void; editing: Txn | null | undefined; closeAdd: () => void };
const C = createContext<Ctx | null>(null);
export const useFinny = () => { const c = useContext(C); if (!c) throw new Error("useFinny outside FinnyProvider"); return c; };

export async function api<T = unknown>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(`/api/${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) }, body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body });
  // A full page load on purpose: the session is gone, the server decides where to go.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  if (res.status === 401) { location.href = `/login?from=${encodeURIComponent(location.pathname + location.search)}`; throw new Error("Sign in first."); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
  return data as T;
}

export function FinnyProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<Txn | null | undefined>(undefined); // undefined = closed, null = new
  const reload = useCallback(async () => {
    const [a, c] = await Promise.all([api<Account[]>("accounts"), api<Category[]>("categories")]);
    setAccounts(a); setCategories(c); setLoaded(true); setVersion((v) => v + 1);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload().catch(() => setLoaded(true)); }, [reload]);
  return <C.Provider value={{ accounts, categories, loaded, version, reload, editing, openAdd: (t) => setEditing(t ?? null), closeAdd: () => setEditing(undefined) }}>{children}</C.Provider>;
}

/** Remembered per browser; storage can be unavailable (private mode), so every access is guarded. */
export const remember = {
  get(k: string) { try { return localStorage.getItem(`finny.${k}`); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(`finny.${k}`, v); } catch { /* not available */ } },
};
