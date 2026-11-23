"use client";
// The frame (Apple-style): a tab bar on phones (Home · Budget · ＋ · Accounts · Settings; owner, 23 Nov 2026: Categories
// moved into Settings), a top bar on desktop.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartPie, House, Landmark, Plus, Settings } from "lucide-react";
import { Lockup } from "./Logo";
import { FinnyProvider, useFinny } from "./store";
import { QuickAddForm } from "./QuickAdd";
import { Sheet } from "./ui";

const NAV = [
  { href: "/", label: "Home", Icon: House },
  { href: "/budget", label: "Budget", Icon: ChartPie },
  { href: "/accounts", label: "Accounts", Icon: Landmark },
  { href: "/settings", label: "Settings", Icon: Settings },
];

function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { editing, openAdd, closeAdd } = useFinny();
  const on = (h: string) => (h === "/" ? path === "/" || path.startsWith("/reports") : path.startsWith(h) || (h === "/settings" && (path.startsWith("/categories") || path.startsWith("/import"))));
  const tab = (n: (typeof NAV)[number]) => <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}><n.Icon size={22} strokeWidth={on(n.href) ? 2.3 : 1.9} />{n.label}</Link>;
  return (
    <>
      <header className="fy-topbar"><div className="in">
        <Link href="/" className="brand" aria-label="Finny, home"><Lockup size={30} /></Link>
        {NAV.map((n) => <Link key={n.href} href={n.href} className={`nav ${on(n.href) ? "on" : ""}`} aria-current={on(n.href) ? "page" : undefined}><n.Icon size={18} />{n.label}</Link>)}
        <span className="grow" />
        <button className="fy-btn primary small" aria-label="Add a transaction" onClick={() => openAdd()}><Plus size={17} />Add</button>
      </div></header>
      <main className="fy-wrap">{children}</main>
      <nav className="fy-tabbar" aria-label="Main">
        {NAV.slice(0, 2).map(tab)}
        <button className="add" aria-label="Add a transaction" onClick={() => openAdd()}><span><Plus size={24} strokeWidth={2.4} /></span></button>
        {NAV.slice(2).map(tab)}
      </nav>
      {editing !== undefined && (
        <Sheet title={editing ? "Edit" : "New transaction"} label={editing ? "Edit transaction" : "Add a transaction"} onClose={closeAdd}>
          <QuickAddForm key={editing?.id ?? "new"} existing={editing} onDone={closeAdd} />
        </Sheet>
      )}
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <FinnyProvider><Frame>{children}</Frame></FinnyProvider>;
}
