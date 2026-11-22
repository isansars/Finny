// Where to go after signing in: only a path on this site (never "//evil.example" or "https://…"). Pure; tests/unit/safe-from.test.mts.
export function safeFrom(from: string | null | undefined): string {
  const f = String(from ?? "");
  return f.startsWith("/") && !f.startsWith("//") && !f.startsWith("/\\") ? f : "/";
}
