import { ChartColumn, Download, FileSpreadsheet, FileText, Shapes, UserRound, ChevronRight, TableProperties } from "lucide-react";
import { RecurringRow } from "@/components/Recurring";
import { PhoneRow, SignOutButton } from "@/components/Phone";
import { requireMe } from "@/lib/session";
import { signOut } from "@/auth";
import { DeleteEverything } from "@/components/DeleteEverything";
export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };
export default async function Page() {
  const me = await requireMe("/settings");
  return (
    <div className="fy-narrow">
      <div className="fy-large"><div><div className="sub">Finny</div><h1>Settings</h1></div></div>
      <div className="fy-section"><span>Account</span></div>
      <div className="fy-list">
        <div className="fy-row"><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><UserRound size={18} /></span>
          <div className="main"><div className="t">Signed in</div><div className="s" data-testid="me">{me.email}</div></div></div>
        <SignOutButton action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }} />
      </div>
      <div className="fy-section"><span>Your data</span></div>
      <div className="fy-list">
        <a className="fy-row" href="/transactions" aria-label="Every transaction"><span className="fy-tile" data-color="peach" style={{ width: 32, height: 32, borderRadius: 10 }}><TableProperties size={18} /></span>
          <div className="main"><div className="t">Every transaction</div><div className="s">A table to check, fix or delete records, one or many</div></div><ChevronRight className="chev" size={18} /></a>
        <a className="fy-row" href="/reports" aria-label="Reports"><span className="fy-tile" data-color="sky" style={{ width: 32, height: 32, borderRadius: 10 }}><ChartColumn size={18} /></span>
          <div className="main"><div className="t">Reports</div><div className="s">Cashflow, balance sheet and net worth, spending pace</div></div><ChevronRight className="chev" size={18} /></a>
        <RecurringRow />
        <PhoneRow />
        <a className="fy-row" href="/categories" aria-label="Categories"><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><Shapes size={18} /></span>
          <div className="main"><div className="t">Categories</div><div className="s">Your groups and categories: icons, colours, merge, switch off</div></div><ChevronRight className="chev" size={18} /></a>
        <a className="fy-row" href="/import" aria-label="Import a workbook"><span className="fy-tile" data-color="mint" style={{ width: 32, height: 32, borderRadius: 10 }}><FileSpreadsheet size={18} /></span>
          <div className="main"><div className="t">Import a workbook</div><div className="s">Bring in your Excel books; undo any import</div></div><ChevronRight className="chev" size={18} /></a>
        <a className="fy-row" href="/import/statements" aria-label="Read a bank statement"><span className="fy-tile" data-color="pink" style={{ width: 32, height: 32, borderRadius: 10 }}><FileText size={18} /></span>
          <div className="main"><div className="t">Bank statements</div><div className="s">Read a month&apos;s e-statement: BCA, BCA credit card, Mandiri, Krom, BRI card</div></div><ChevronRight className="chev" size={18} /></a>
        <div className="fy-row"><span className="fy-tile" data-color="sky" style={{ width: 32, height: 32, borderRadius: 10 }}><Download size={18} /></span>
          <div className="main"><div className="t">Export everything</div><div className="s" style={{ whiteSpace: "normal" }}>Every table as a spreadsheet, in one zip</div></div>
          <a className="fy-btn small" href="/api/export" download>Download export</a></div>
      </div>
      <div className="fy-section"><span>Danger zone</span></div>
      <div className="fy-card fy-pad"><DeleteEverything /></div>
    </div>
  );
}
