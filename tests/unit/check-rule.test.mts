// FINNY-171: Finny's guesses at mistakes, on made-up rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFlags, flagLabel, type CheckRow } from "../../src/lib/check-rule.ts";

let n = 0;
const row = (on: string, amountSen: number, o: Partial<CheckRow> = {}): CheckRow => ({ id: `t${++n}`, on, kind: "spend", amountSen, accountId: "bca", toAccountId: null, categoryId: "kopi", ...o });

test("the same spend twice on a day and account is flagged on both; a different day, account or amount isn't", () => {
  const a = row("2026-11-23", 667_000_00), b = row("2026-11-23", 667_000_00), c = row("2026-11-24", 667_000_00), d = row("2026-11-23", 667_000_00, { accountId: "cc" }), e = row("2026-11-23", 667_100_00);
  const f = checkFlags([a, b, c, d, e], []);
  assert.deepEqual(f.get(a.id), [{ kind: "twice" }]); assert.deepEqual(f.get(b.id), [{ kind: "twice" }]);
  for (const x of [c, d, e]) assert.equal(f.get(x.id), undefined, x.id);
});

test("a twin outside the rows shown still counts (it's in the history)", () => {
  const shown = row("2026-11-23", 50_000_00), hidden = row("2026-11-23", 50_000_00);
  assert.deepEqual(checkFlags([shown], [hidden]).get(shown.id), [{ kind: "twice" }]);
});

test("transfers are twins only between the same two accounts; spend and income of the same amount aren't twins", () => {
  const t1 = row("2026-11-01", 2_000_000_00, { kind: "transfer", toAccountId: "cc", categoryId: null }), t2 = row("2026-11-01", 2_000_000_00, { kind: "transfer", toAccountId: "cc", categoryId: null });
  const t3 = row("2026-11-01", 2_000_000_00, { kind: "transfer", toAccountId: "rdpu", categoryId: null });
  const inc = row("2026-11-01", 45_000_00, { kind: "income", categoryId: "gaji" }), sp = row("2026-11-01", 45_000_00);
  const f = checkFlags([t1, t2, t3, inc, sp], []);
  assert.ok(f.get(t1.id) && f.get(t2.id)); assert.equal(f.get(t3.id), undefined);
  assert.equal(f.get(inc.id), undefined); assert.equal(f.get(sp.id), undefined);
});

test("far above usual: 5× the median of the category's last 90 days, with at least 3 of them", () => {
  const hist = [row("2026-10-01", 40_000_00), row("2026-10-15", 50_000_00), row("2026-11-01", 60_000_00)]; // median 50.000
  const big = row("2026-11-20", 500_000_00), edge = row("2026-11-20", 250_000_00), under = row("2026-11-21", 249_900_00);
  const f = checkFlags([big, edge, under], hist);
  assert.deepEqual(f.get(big.id), [{ kind: "usual", times: 10 }]);
  assert.deepEqual(f.get(edge.id), [{ kind: "usual", times: 5 }], "exactly 5× is flagged");
  assert.equal(f.get(under.id), undefined);
  assert.equal(flagLabel({ kind: "usual", times: 10 }), "10× usual");
});

test("too little history, history older than 90 days, another category or income: no guess", () => {
  const two = [row("2026-10-01", 40_000_00), row("2026-10-15", 50_000_00)];
  assert.equal(checkFlags([row("2026-11-20", 900_000_00)], two).size, 0, "only 2 before it");
  const old = [row("2026-06-01", 40_000_00), row("2026-06-02", 40_000_00), row("2026-06-03", 40_000_00)];
  assert.equal(checkFlags([row("2026-11-20", 900_000_00)], old).size, 0, "older than 90 days");
  const other = [row("2026-11-01", 10_000_00, { categoryId: "x" }), row("2026-11-02", 10_000_00, { categoryId: "x" }), row("2026-11-03", 10_000_00, { categoryId: "x" })];
  assert.equal(checkFlags([row("2026-11-20", 900_000_00)], other).size, 0, "another category");
  const sal = [1, 2, 3].map((d) => row(`2026-10-0${d}`, 1_000_000_00, { kind: "income", categoryId: "gaji" }));
  assert.equal(checkFlags([row("2026-11-20", 15_000_000_00, { kind: "income", categoryId: "gaji" })], sal).size, 0, "income is never 'usual'");
});

test("a later day doesn't set the usual for an earlier one", () => {
  const later = [row("2026-12-01", 10_000_00), row("2026-12-02", 10_000_00), row("2026-12-03", 10_000_00)];
  assert.equal(checkFlags([row("2026-11-20", 900_000_00)], later).size, 0);
});

test("marked as looking fine: never flagged, though it still makes its twin a twin", () => {
  const a = row("2026-11-23", 99_000_00, { looksOk: true }), b = row("2026-11-23", 99_000_00);
  const f = checkFlags([a, b], []);
  assert.equal(f.get(a.id), undefined); assert.deepEqual(f.get(b.id), [{ kind: "twice" }]);
});

test("both guesses on one row", () => {
  const hist = [row("2026-10-01", 10_000_00), row("2026-10-02", 10_000_00), row("2026-10-03", 10_000_00)];
  const a = row("2026-11-01", 100_000_00), b = row("2026-11-01", 100_000_00);
  assert.deepEqual(checkFlags([a, b], hist).get(a.id), [{ kind: "twice" }, { kind: "usual", times: 10 }]);
});
