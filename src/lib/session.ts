// Who is asking: every page and API route goes through here (FINNY-23, Shield: no data without a session).
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAllowed } from "@/lib/allow-rule";

export type Me = { id: string; email: string; name: string | null; image: string | null };

async function current(): Promise<Me | null> {
  const s = await auth();
  const u = s?.user as { id?: string; email?: string | null; name?: string | null; image?: string | null } | undefined;
  if (!u?.id || !u.email) return null;
  // Removing an address from the allow-list locks it out at once, even with a live session.
  if (!isAllowed(u.email, process.env.FINNY_ALLOWED_EMAILS)) return null;
  return { id: u.id, email: u.email, name: u.name ?? null, image: u.image ?? null };
}

/** For pages: the signed-in owner, or a redirect to /login (coming back to `from` afterwards). */
export async function requireMe(from = "/"): Promise<Me> {
  const me = await current();
  if (!me) redirect(`/login?from=${encodeURIComponent(from)}`);
  return me;
}

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

/** For API routes: runs `fn` with the signed-in owner; 401 without a session, the HttpError's status for refusals. */
export async function withMe(fn: (me: Me) => Promise<unknown>): Promise<NextResponse> {
  const me = await current();
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    const out = await fn(me);
    return out instanceof NextResponse ? out : NextResponse.json(out ?? { ok: true });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[api]", e);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
