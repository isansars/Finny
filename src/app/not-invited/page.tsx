import { Lock, CircleAlert } from "lucide-react";
export const metadata = { title: "Not invited" };
export default async function NotInvited({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams).error;
  const denied = !error || error === "AccessDenied";
  return (
    <main className="fy-center">
      <span className="fy-logo" style={{ background: "var(--surface-3)", color: "var(--text-2)", boxShadow: "none" }}>{denied ? <Lock size={30} /> : <CircleAlert size={30} />}</span>
      <h1>{denied ? "Not invited" : "Sign-in didn't work"}</h1>
      <p>{denied ? "This Finny belongs to one person, and this account isn't theirs." : "Something went wrong while signing in. Try again."}</p>
      <a className="fy-btn" href="/login">Back to sign-in</a>
    </main>
  );
}
