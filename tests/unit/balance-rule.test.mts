import { test } from "node:test";
import assert from "node:assert/strict";
import { balanceOf, cardView, addFlow, type Flows } from "../../src/lib/balance-rule.ts";

test("spends, incomes and transfers both ways", () => {
  const m = new Map<string, Flows>();
  addFlow(m, { kind: "income", amountSen: 1_500_000_00, accountId: "bca" });
  addFlow(m, { kind: "spend", amountSen: 43_890_00, accountId: "bca" });
  addFlow(m, { kind: "transfer", amountSen: 100_000_00, accountId: "bca", toAccountId: "gopay" });
  addFlow(m, { kind: "spend", amountSen: 25_000_00, accountId: "gopay" });
  assert.equal(balanceOf(305_354_18, m.get("bca")), 305_354_18 + 1_500_000_00 - 43_890_00 - 100_000_00);
  assert.equal(balanceOf(0, m.get("gopay")), 75_000_00);
  assert.equal(balanceOf(10_00), 10_00);
});
test("a transfer is neither income nor spending", () => {
  const m = addFlow(new Map(), { kind: "transfer", amountSen: 500_00, accountId: "a", toAccountId: "b" });
  assert.equal(m.get("a")!.spend, 0); assert.equal(m.get("b")!.income, 0);
  assert.equal(balanceOf(0, m.get("a")) + balanceOf(0, m.get("b")), 0);
});
test("a card: spending raises what's used, paying it lowers it", () => {
  const m = new Map<string, Flows>();
  addFlow(m, { kind: "spend", amountSen: 200_000_00, accountId: "cc" });
  addFlow(m, { kind: "transfer", amountSen: 150_000_00, accountId: "bank", toAccountId: "cc" });
  const bal = balanceOf(0, m.get("cc"));
  assert.equal(bal, -50_000_00);
  assert.deepEqual(cardView(bal, 36_000_000_00), { used: 50_000_00, limit: 36_000_000_00, available: 35_950_000_00 });
  assert.deepEqual(cardView(10_00, null), { used: 0, limit: null, available: null });
});
