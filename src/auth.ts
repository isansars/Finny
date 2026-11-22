// Sign-in (FINNY-23): Google only, for the addresses in FINNY_ALLOWED_EMAILS. Anyone else lands on /not-invited and no
// account is created. Database sessions (revocable), 30 days.
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { isAllowed } from "@/lib/allow-rule";

export const SESSION_DAYS = 30;
export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts, sessionsTable: sessions, verificationTokensTable: verificationTokens }),
  session: { strategy: "database", maxAge: SESSION_DAYS * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/login", error: "/not-invited" },
  callbacks: {
    // Runs before the adapter creates a user, so a refused address leaves nothing behind.
    signIn({ user, profile }) { return isAllowed(profile?.email ?? user?.email, process.env.FINNY_ALLOWED_EMAILS); },
  },
  providers: googleEnabled ? [Google] : [],
});
