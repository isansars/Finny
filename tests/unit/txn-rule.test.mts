import { test } from "node:test";
import assert from "node:assert/strict";
import { txnProblem } from "../../src/lib/txn-rule.ts";
const A = [{ id: "bca", archived: false }, { id: "gopay", archived: false }, { id: "old", archived: true }];
const C = [{ id: "kopi", kind: "expense", active: true }, { id: "gaji", kind: "income", active: true }, { id: "rokok", kind: "expense", active: false }, { id: "ef", kind: "saving", active: true }];
const base = { on: "2026-11-22", amountSen: 4389000, accountId: "bca" };
test("valid ones", () => {
  assert.equal(txnProblem({ ...base, kind: "spend", categoryId: "kopi" }, A, C), null);
  assert.equal(txnProblem({ ...base, kind: "spend", categoryId: "ef" }, A, C), null);
  assert.equal(txnProblem({ ...base, kind: "income", categoryId: "gaji" }, A, C), null);
  assert.equal(txnProblem({ ...base, kind: "transfer", toAccountId: "gopay" }, A, C), null);
});
test("refusals", () => {
  assert.match(txnProblem({ ...base, kind: "transfer", toAccountId: "bca" }, A, C)!, /two different/);
  assert.match(txnProblem({ ...base, kind: "transfer", toAccountId: "gopay", categoryId: "kopi" }, A, C)!, /no category/);
  assert.match(txnProblem({ ...base, kind: "spend", categoryId: "gaji" }, A, C)!, /spending/);
  assert.match(txnProblem({ ...base, kind: "income", categoryId: "kopi" }, A, C)!, /income category/);
  assert.match(txnProblem({ ...base, kind: "spend", categoryId: "rokok" }, A, C)!, /switched off/);
  assert.match(txnProblem({ ...base, kind: "spend", categoryId: "kopi", amountSen: 0 }, A, C)!, /above zero/);
  assert.match(txnProblem({ ...base, kind: "spend", categoryId: "kopi", on: "22/11/2026" }, A, C)!, /date/);
  assert.match(txnProblem({ ...base, kind: "spend", categoryId: "kopi", accountId: "old" }, A, C)!, /closed/);
  assert.match(txnProblem({ ...base, kind: "spend", categoryId: "kopi", toAccountId: "gopay" }, A, C)!, /Only a transfer/);
  assert.match(txnProblem({ ...base, kind: "gift" }, A, C)!, /Spend, Income or Transfer/);
});
test("editing keeps history on a closed account or switched-off category", () => {
  assert.equal(txnProblem({ ...base, kind: "spend", categoryId: "rokok", accountId: "old" }, A, C, true), null);
});
