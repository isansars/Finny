// Dev-only sign-in (FINNY-23, AC 5): local development and the e2e suite sign in without Google. It exists only when
// FINNY_DEV_LOGIN=1 and never on Vercel's production; the address must still be on the allow-list.
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { devLoginEnabled, isAllowed } from "@/lib/allow-rule";
import { SESSION_DAYS } from "@/auth";
import { safeFrom } from "@/lib/safe-from";

export async function POST(req: NextRequest) {
  if (!devLoginEnabled(process.env)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const from = safeFrom(String(form.get("from") ?? "/"));
  const origin = req.nextUrl.origin;
  if (!isAllowed(email, process.env.FINNY_ALLOWED_EMAILS)) return NextResponse.redirect(new URL("/not-invited?error=AccessDenied", origin), 303);
  let [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u) [u] = await db.insert(users).values({ email, name: email.split("@")[0] }).returning();
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(sessions).values({ sessionToken: token, userId: u.id, expires });
  const res = NextResponse.redirect(new URL(from, origin), 303);
  const secure = req.nextUrl.protocol === "https:";
  res.cookies.set(secure ? "__Secure-authjs.session-token" : "authjs.session-token", token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires });
  return res;
}
