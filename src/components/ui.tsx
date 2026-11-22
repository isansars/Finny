"use client";
import { useEffect } from "react";
import { formatRupiah, parseRupiah } from "@/lib/money";
import { flattenTree } from "@/lib/category-rule";
import type { Category } from "./store";

export function Money({ sen, kind, className = "" }: { sen: number; kind?: "spend" | "income" | "transfer"; className?: string }) {
  const text = kind === "spend" ? "−" + formatRupiah(sen, { prefix: false, sign: "never" }) : kind === "income" ? "+" + formatRupiah(sen, { prefix: false, sign: "never" }) : kind === "transfer" ? formatRupiah(sen, { prefix: false, sign: "never" }) : formatRupiah(sen);
  return <span className={`fy-amt ${kind ?? ""} ${className}`}>{text}</span>;
}

export function Sheet({ title, onClose, children, label }: { title: string; onClose: () => void; children: React.ReactNode; label?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fy-sheet-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fy-sheet" role="dialog" aria-modal="true" aria-label={label ?? title}>
        <div className="fy-sheet-h"><span>{title}</span><button className="fy-x" aria-label="Close" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

/** A rupiah input: type freely ("43890", "43.890"), shown grouped when you leave it. */
export function AmountInput({ value, onChange, big, label, autoFocus, id }: { value: string; onChange: (v: string) => void; big?: boolean; label: string; autoFocus?: boolean; id?: string }) {
  return (
    <input id={id} className={`fy-input ${big ? "fy-amount" : ""}`} inputMode="decimal" autoComplete="off" aria-label={label} placeholder="Rp 0" value={value} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => { const sen = parseRupiah(value); if (sen !== null && value.trim()) onChange(formatRupiah(sen)); }} />
  );
}

/** Category options as an indented tree. */
export function CategoryOptions({ cats, kinds, includeOff, exclude }: { cats: Category[]; kinds: string[]; includeOff?: boolean; exclude?: string }) {
  const kindName: Record<string, string> = { expense: "Expense", income: "Income", saving: "Saving", investment: "Investment" };
  return <>{kinds.map((k) => {
    const list = flattenTree(cats.filter((c) => (includeOff || c.active) && c.id !== exclude), k);
    if (!list.length) return null;
    return <optgroup key={k} label={kindName[k]}>{list.map((c) => <option key={c.id} value={c.id}>{"  ".repeat(c.depth)}{c.emoji ? c.emoji + " " : ""}{c.name}</option>)}</optgroup>;
  })}</>;
}

export const TYPE_LABEL: Record<string, string> = { cash: "Cash", bank: "Bank", ewallet: "E-wallet", card: "Credit card", loan: "Loan / paylater", investment: "Investment" };
export const TYPE_EMOJI: Record<string, string> = { cash: "💵", bank: "🏦", ewallet: "📱", card: "💳", loan: "🧾", investment: "📈" };
