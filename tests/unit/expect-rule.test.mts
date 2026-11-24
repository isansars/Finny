// FINNY-193: refusing a change made offline when the transaction changed elsewhere since.
import { test } from "node:test";
import assert from "node:assert/strict";
import { changedSince, expectFrom } from "../../src/lib/expect-rule.ts";

const row = { on: "2026-11-20", kind: "spend", amountSen: 45_000_00, accountId: "bca", toAccountId: null, categoryId: "kopi", description: "Kopi", note: "with Dina", entity: null };

test("unchanged: nothing differs, whatever the empty values look like", () => {
  assert.deepEqual(changedSince(row, { ...row }), []);
  assert.deepEqual(changedSince({ ...row, toAccountId: undefined, entity: "" }, { ...row, toAccountId: null, entity: null }), []);
  assert.deepEqual(changedSince({ ...row, amountSen: "4500000" }, row), [], "an amount sent as text");
  assert.deepEqual(changedSince({ ...row, description: "Kopi " }, row), [], "spaces around a text");
});

test("each field that changed elsewhere is named", () => {
  assert.deepEqual(changedSince(row, { ...row, amountSen: 55_000_00 }), ["amountSen"]);
  assert.deepEqual(changedSince(row, { ...row, note: "with Dina, cake", categoryId: "jajan" }), ["categoryId", "note"]);
  assert.deepEqual(changedSince(row, { ...row, on: "2026-11-21", entity: "Kopi Kenangan" }), ["on", "entity"]);
  assert.deepEqual(changedSince(row, { ...row, note: null }), ["note"], "a note removed");
});

test("expect is read only when it's an object", () => {
  assert.equal(expectFrom({}), null); assert.equal(expectFrom(null), null);
  assert.equal(expectFrom({ expect: "x" }), null); assert.equal(expectFrom({ expect: [1] }), null);
  assert.deepEqual(expectFrom({ expect: { on: "2026-11-20" } }), { on: "2026-11-20" });
});
