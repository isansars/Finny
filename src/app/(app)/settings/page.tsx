import { requireMe } from "@/lib/session";
import { signOut } from "@/auth";
import { DeleteEverything } from "@/components/DeleteEverything";
export const dynamic = "force-dynamic";
export default async function Page() {
  const me = await requireMe("/settings");
  return (
    <>
      <div className="fy-h1"><span>Settings</span></div>
      <div className="fy-card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800 }}>Signed in as <span data-testid="me">{me.email}</span></div>
        <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }} style={{ marginTop: 10 }}>
          <button className="fy-btn ghost small">Sign out</button>
        </form>
      </div>
      <div className="fy-card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 4 }}>📦 Export everything</div>
        <p style={{ color: "var(--muted)", fontWeight: 700, margin: "0 0 10px", fontSize: 14 }}>A zip with one CSV per table (accounts, categories, places and people, transactions), amounts in rupiah.</p>
        <a className="fy-btn" href="/api/export" download>Download export</a>
      </div>
      <div className="fy-card"><DeleteEverything /></div>
    </>
  );
}
