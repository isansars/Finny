"use client";
import { useEffect, useRef, useState } from "react";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { flattenTree } from "@/lib/category-rule";
import type { Category } from "./store";

/** Spending shows without colour (Apple Wallet style), income in green with a plus, transfers in grey. */
export function Money({ sen, kind, className = "" }: { sen: number; kind?: "spend" | "income" | "transfer"; className?: string }) {
  const body = formatRupiah(sen, { prefix: false, sign: "never" });
  const text = kind === "spend" ? "−" + body : kind === "income" ? "+" + body : kind === "transfer" ? body : formatRupiah(sen);
  return <span className={`fy-amt ${kind ?? ""} ${className}`}>{text}</span>;
}

/** A bottom sheet with a grabber and a centred title on phones; a centred dialog on wider screens (FINNY-164). Escape or a tap
 *  outside closes it. FINNY-162: the keyboard stays inside while it's open (Tab and Shift+Tab wrap), and focus goes back
 *  to whatever opened it when it closes. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
export function Sheet({ title, onClose, children, label }: { title: string; onClose: () => void; children: React.ReactNode; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  // What opened the sheet, read while it first renders: a field inside may take focus (autoFocus) before effects run.
  const [opener] = useState(() => (typeof document !== "undefined" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null));
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const inside = () => [...(box.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((e) => e.getClientRects().length > 0);
    // A field may focus itself (autoFocus); otherwise the first thing in the sheet takes focus.
    const t = setTimeout(() => { if (!box.current?.contains(document.activeElement)) (inside().find((e) => e.matches("input, select, textarea")) ?? inside()[0] ?? box.current)?.focus(); }, 30);
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab") return;
      const f = inside(); if (!f.length) return;
      const first = f[0], last = f[f.length - 1], at = document.activeElement;
      if (!box.current?.contains(at)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && at === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
    };
    addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); removeEventListener("keydown", k); document.body.style.overflow = prev; if (opener?.isConnected) opener.focus(); };
  }, [opener]);
  return (
    <div className="fy-sheet-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) close.current(); }}>
      <div className="fy-sheet" role="dialog" aria-modal="true" aria-label={label ?? title} ref={box} tabIndex={-1}>
        <div className="fy-grab" />
        <div className="fy-sheet-h"><button className="x" aria-label="Close" onClick={() => close.current()}>Cancel</button><b>{title}</b><span /></div>
        {children}
      </div>
    </div>
  );
}

/** A rupiah input: type freely ("43890", "43.890"), shown grouped when you leave it. */
export function AmountInput({ value, onChange, label, autoFocus, className = "fy-input" }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean; className?: string }) {
  return (
    <input className={className} inputMode="decimal" autoComplete="off" aria-label={label} placeholder="0" value={value} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => { const sen = parseRupiah(value); if (sen !== null && value.trim()) onChange(formatRupiah(sen, { prefix: false })); }} />
  );
}

/** Category options as an indented tree (for selects: filters, parent, merge). */
export function CategoryOptions({ cats, kinds, includeOff, exclude }: { cats: Category[]; kinds: string[]; includeOff?: boolean; exclude?: string }) {
  const kindName: Record<string, string> = { expense: "Expense", income: "Income", saving: "Saving", investment: "Investment" };
  return <>{kinds.map((k) => {
    const list = flattenTree(cats.filter((c) => (includeOff || c.active) && c.id !== exclude), k);
    if (!list.length) return null;
    return <optgroup key={k} label={kindName[k]}>{list.map((c) => <option key={c.id} value={c.id}>{"  ".repeat(c.depth)}{c.name}</option>)}</optgroup>;
  })}</>;
}

export const TYPE_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank", ewallet: "E-wallet", card: "Credit card", loan: "Loan / paylater", investment: "Investment" };
export const TYPE_LOOK: Record<string, { icon: string; color: string }> = {
  cash: { icon: "banknote", color: "mint" }, bank: { icon: "landmark", color: "sky" }, ewallet: { icon: "smartphone", color: "lavender" },
  card: { icon: "credit-card", color: "peach" }, loan: { icon: "hand-coins", color: "rose" }, investment: { icon: "trending-up", color: "lemon" },
};

/** A date that reads "23 Nov 2026" (not the browser's 11/23/2026); tapping it opens the phone's own date picker. */
export function DateField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const shown = value ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(value + "T00:00:00Z")) : "Pick a date";
  return (
    <span className="fy-input fy-datefield"><span>{shown}</span><span aria-hidden style={{ color: "var(--text-3)" }}>▾</span>
      <input type="date" aria-label={label} value={value} required onChange={(e) => e.target.value && onChange(e.target.value)} />
    </span>
  );
}
