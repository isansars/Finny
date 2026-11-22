export default async function NotInvited({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams).error;
  const denied = !error || error === "AccessDenied";
  return (
    <main className="fy-center">
      <div style={{ fontSize: 52 }}>{denied ? "🔒" : "😕"}</div>
      <h1>{denied ? "Not invited" : "Sign-in didn't work"}</h1>
      <p>{denied ? "This Finny belongs to one person, and this account isn't theirs." : "Something went wrong while signing in. Try again."}</p>
      <a className="fy-btn ghost" href="/login" style={{ marginTop: 12 }}>Back to sign-in</a>
    </main>
  );
}
