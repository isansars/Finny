// Who may sign in: only the addresses in FINNY_ALLOWED_EMAILS (comma or space separated, case-insensitive).
// An empty list lets nobody in. Pure; tests/unit/allow-rule.test.mts.
export function allowedEmails(raw: string | undefined): string[] {
  return String(raw ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@"));
}
export function isAllowed(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return allowedEmails(raw).includes(email.trim().toLowerCase());
}
/** The dev sign-in (local development and the e2e suite) exists only when asked for and never on Vercel's production. */
export function devLoginEnabled(env: Record<string, string | undefined>): boolean {
  return env.FINNY_DEV_LOGIN === "1" && env.VERCEL_ENV !== "production";
}
