import { Download, LogOut, UserRound } from "lucide-react";
import { requireMe } from "@/lib/session";
import { signOut } from "@/auth";
import { DeleteEverything } from "@/components/DeleteEverything";
export const dynamic = "force-dynamic";
export default async function Page() {
  const me = await requireMe("/settings");
  return (
    <>
      <div className="fy-large"><div><div className="sub">Finny</div><h1>Settings</h1></div></div>
      <div className="fy-section"><span>Account</span></div>
      <div className="fy-list">
        <div className="fy-row"><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><UserRound size={18} /></span>
          <div className="main"><div className="t">Signed in</div><div className="s" data-testid="me">{me.email}</div></div></div>
        <form className="fy-row" action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }} style={{ margin: 0 }}>
          <span className="fy-tile" data-color="slate" style={{ width: 32, height: 32, borderRadius: 10 }}><LogOut size={18} /></span>
          <div className="main"><div className="t">Sign out</div></div><button className="fy-btn small">Sign out</button>
        </form>
      </div>
      <div className="fy-section"><span>Your data</span></div>
      <div className="fy-list">
        <div className="fy-row"><span className="fy-tile" data-color="sky" style={{ width: 32, height: 32, borderRadius: 10 }}><Download size={18} /></span>
          <div className="main"><div className="t">Export everything</div><div className="s">A zip of spreadsheets: accounts, categories, places, transactions</div></div>
          <a className="fy-btn small" href="/api/export" download>Download export</a></div>
      </div>
      <div className="fy-section"><span>Danger zone</span></div>
      <div className="fy-card fy-pad"><DeleteEverything /></div>
    </>
  );
}
