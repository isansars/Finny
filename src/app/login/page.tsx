import { redirect } from "next/navigation";
import { Mark } from "@/components/Logo";
import { signIn, googleEnabled } from "@/auth";
import { getMe } from "@/lib/session";
import { devLoginEnabled } from "@/lib/allow-rule";
import { safeFrom } from "@/lib/safe-from";
export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const from = safeFrom((await searchParams).from);
  if (await getMe()) redirect(from);
  const dev = devLoginEnabled(process.env);
  return (
    <main className="fy-center">
      <span style={{ display: "inline-block", filter: "drop-shadow(0 10px 24px rgba(236,72,153,.35))" }}><Mark size={72} title="Finny" /></span>
      <h1>Finny</h1>
      <p>Your money, in one place. Private: only you can sign in.</p>
      {googleEnabled ? (
        <form action={async () => { "use server"; await signIn("google", { redirectTo: from }); }}>
          <button className="fy-btn block" style={{ minHeight: 50 }}><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button>
        </form>
      ) : !dev && <p className="fy-note">Google sign-in isn&apos;t set up yet: add AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.</p>}
      {dev && (
        <form method="post" action="/api/dev-login" style={{ marginTop: 18, textAlign: "left" }} className="fy-card fy-pad">
          <div className="fy-label">Dev sign-in (not in production)</div>
          <input type="hidden" name="from" value={from} />
          <label className="fy-field"><span className="fy-label">Email</span><input className="fy-input" name="email" type="email" required defaultValue="" placeholder="owner@finny.test" /></label>
          <button className="fy-btn block">Dev sign-in</button>
        </form>
      )}
    </main>
  );
}
