"use client";
// The frame (Apple-style): a tab bar on phones (Home · Budget · ＋ · Accounts · Settings; owner, 23 Nov 2026: Categories
// moved into Settings), a top bar on desktop.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartColumn, ChartPie, Gem, House, Landmark, List, Plus, Settings } from "lucide-react";
import { Lockup } from "./Logo";
import { FinnyProvider, useFinny } from "./store";
import { PhoneSync } from "./Phone";
import { QuickAddForm } from "./QuickAdd";
import { Sheet } from "./ui";

const NAV = [
  { href: "/", label: "Home", Icon: House },
  { href: "/budget", label: "Budget", Icon: ChartPie },
  { href: "/accounts", label: "Accounts", Icon: Landmark },
  { href: "/settings", label: "Settings", Icon: Settings },
];
// FINNY-163: a laptop has room for Reports and Assets (Debts, goals and the emergency fund live under Assets).
const NAV_WIDE = [NAV[0], { href: "/transactions", label: "Transactions", Icon: List }, NAV[1], NAV[2], { href: "/reports", label: "Reports", Icon: ChartColumn }, { href: "/assets", label: "Assets", Icon: Gem }, NAV[3]];

function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { editing, openAdd, closeAdd } = useFinny();
  const settings = (h: string) => h === "/settings" && (path.startsWith("/categories") || path.startsWith("/import"));
  // Phones: four tabs, Home also for reports and reviews. Laptops: Reports and Assets have their own.
  const on = (h: string) => (h === "/" ? path === "/" || path.startsWith("/reports") || path.startsWith("/review") : path.startsWith(h) || settings(h));
  const onWide = (h: string) => (h === "/" ? path === "/" || path.startsWith("/review") : h === "/assets" ? path.startsWith("/assets") || path.startsWith("/debts") : path.startsWith(h) || settings(h));
  const tab = (n: (typeof NAV)[number]) => <Link key={n.href} href={n.href} className={on(n.href) ? "on" : ""} aria-current={on(n.href) ? "page" : undefined}><n.Icon size={22} strokeWidth={on(n.href) ? 2.3 : 1.9} />{n.label}</Link>;
  // FINNY-164: on Home, a laptop already shows the add form beside the month; the bar's Add goes to it instead of opening a copy.
  const addWide = () => {
    const field = path === "/" ? document.querySelector<HTMLElement>("aside.side form input:not([type=hidden])") : null;
    if (field && field.getClientRects().length) { field.closest("aside")?.scrollIntoView({ block: "nearest" }); field.focus(); }
    else openAdd();
  };
  return (
    <>
      <a className="fy-skip" href="#main">Skip to content</a>
      <header className="fy-topbar"><div className="in">
        <Link href="/" className="brand" aria-label="Finny, home"><Lockup size={30} /></Link>
        <nav aria-label="Main" className="links">{NAV_WIDE.map((n) => <Link key={n.href} href={n.href} className={`nav ${onWide(n.href) ? "on" : ""}`} aria-current={onWide(n.href) ? "page" : undefined} aria-label={n.label} title={n.label}><n.Icon size={18} /><span className="lbl">{n.label}</span></Link>)}</nav>
        <span className="grow" />
        <button className="fy-btn primary small" aria-label="Add a transaction" onClick={addWide}><Plus size={17} />Add</button>
      </div></header>
      <main className="fy-wrap" id="main" tabIndex={-1}>{children}</main>
      <nav className="fy-tabbar" aria-label="Main">
        {NAV.slice(0, 2).map(tab)}
        <button className="add" aria-label="Add a transaction" onClick={() => openAdd()}><span><Plus size={24} strokeWidth={2.4} /></span></button>
        {NAV.slice(2).map(tab)}
      </nav>
      {editing !== undefined && (
        <Sheet title={editing?.id ? "Edit" : "New transaction"} label={editing?.id ? "Edit transaction" : "Add a transaction"} onClose={closeAdd}>
          <QuickAddForm key={editing?.id || (editing ? `draft-${editing.toAccountId}` : "new")} existing={editing} onDone={closeAdd} />
        </Sheet>
      )}
    </>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return <FinnyProvider><PhoneSync /><Frame>{children}</Frame></FinnyProvider>;
}
