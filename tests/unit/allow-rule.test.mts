import { test } from "node:test";
import assert from "node:assert/strict";
import { isAllowed, allowedEmails, devLoginEnabled } from "../../src/lib/allow-rule.ts";

test("only listed addresses, case-insensitive", () => {
  const list = "Owner@Example.com, second@example.com";
  assert.equal(isAllowed("owner@example.com", list), true);
  assert.equal(isAllowed("OWNER@EXAMPLE.COM ", list), true);
  assert.equal(isAllowed("someone@example.com", list), false);
  assert.equal(isAllowed(null, list), false);
  assert.deepEqual(allowedEmails("a@x.id b@y.id;c@z.id"), ["a@x.id", "b@y.id", "c@z.id"]);
});
test("an empty list lets nobody in", () => {
  assert.equal(isAllowed("owner@example.com", ""), false);
  assert.equal(isAllowed("owner@example.com", undefined), false);
});
test("dev sign-in only when asked for and never in Vercel production", () => {
  assert.equal(devLoginEnabled({ FINNY_DEV_LOGIN: "1" }), true);
  assert.equal(devLoginEnabled({ FINNY_DEV_LOGIN: "1", VERCEL_ENV: "production" }), false);
  assert.equal(devLoginEnabled({ FINNY_DEV_LOGIN: "1", VERCEL_ENV: "preview" }), true);
  assert.equal(devLoginEnabled({}), false);
});
