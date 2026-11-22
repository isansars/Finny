import { test } from "node:test";
import assert from "node:assert/strict";
import { safeFrom } from "../../src/lib/safe-from.ts";
test("only paths on this site", () => {
  assert.equal(safeFrom("/accounts"), "/accounts");
  assert.equal(safeFrom("/?m=2026-11"), "/?m=2026-11");
  for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "", null, "accounts"]) assert.equal(safeFrom(bad as string), "/");
});
