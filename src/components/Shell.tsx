"use client";
// The frame: a top bar (nav on desktop), the bottom nav on phones, and the ＋ that opens quick add from every screen.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FinnyProvider, useFinny } from "./store";
import { QuickAddForm } from "./QuickAdd";
import { Sheet } from "./ui";

const NAV = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/accounts", label: "Accounts", icon: "🏦" },
  { href: "/categories", label: "Categories", icon: "🗂️" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { editing, openAdd, closeAdd } = useFinny();
  const on = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <header className="fy-top"><div className="fy-top-in">
        <Link href="/" className="fy-logo">💰 Finny</Link>
        <nav className="fy-nav-top" aria-label="Main">{NAV.map((n) => <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}>{n.icon} {n.label}</Link>)}</nav>
      </div></header>
      <main className="fy-wrap">{children}</main>
      <nav className="fy-nav" aria-label="Main (phone)">{NAV.map((n) => <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}><span aria-hidden>{n.icon}</span>{n.label}</Link>)}</nav>
      <button className="fy-fab" aria-label="Add a transaction" onClick={() => openAdd()}>＋</button>
      {editing !== undefined && (
        <Sheet title={editing ? "Edit transaction" : "Add"} label={editing ? "Edit transaction" : "Add a transaction"} onClose={closeAdd}>
          <QuickAddForm key={editing?.id ?? "new"} existing={editing} onDone={closeAdd} />
        </Sheet>
      )}
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <FinnyProvider><Frame>{children}</Frame></FinnyProvider>;
}
