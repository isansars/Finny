// FINNY-212: statement checkpoints and possible doubles.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkpoints, balancesOn, asBalance, dayBefore, type CpTxn } from "../../src/lib/checkpoint-rule.ts";
import { findDoubles, type DTxn } from "../../src/lib/doubles-rule.ts";

const bca = { id: "bca", type: "bank", openingSen: 1_000_000_00, openingOn: "2025-08-01" };
const T = (on: string, kind: CpTxn["kind"], amountSen: number, accountId = "bca", toAccountId: string | null = null): CpTxn => ({ on, kind, amountSen, accountId, toAccountId });

test("Finny's balance at the end of each day; the day before a statement starts", () => {
  const b = balancesOn(bca, [T("2025-08-05", "spend", 100_000_00), T("2025-09-02", "transfer", 50_000_00, "krom", "bca")], ["2025-08-04", "2025-08-31", "2025-09-30"]);
  assert.deepEqual([...b.values()], [1_000_000_00, 900_000_00, 950_000_00]);
  assert.equal(balancesOn(bca, [], ["2025-07-31"]).get("2025-07-31"), 1_000_000_00, "an opening balance on 1 Aug is the balance at the end of 31 Jul");
  assert.equal(balancesOn(bca, [], ["2025-07-30"]).get("2025-07-30"), 0);
  assert.equal(dayBefore("2025-10-01"), "2025-09-30"); assert.equal(dayBefore("2026-03-01"), "2026-02-28");
  assert.equal(asBalance("card", 318_000_000), -318_000_000); assert.equal(asBalance("bank", 5), 5);
});

test("checkpoints: every statement date, where Finny first parted, and whether the gap stayed the same", () => {
  const txns = [T("2025-08-05", "spend", 100_000_00), T("2025-09-10", "spend", 21_000_00), T("2025-10-03", "income", 200_000_00)];
  const batches = [ // the bank's own figures; Finny is missing a Rp 21.000 refund in September
    { id: "b1", periodFrom: "2025-08-01", periodTo: "2025-08-31", openingSen: 1_000_000_00, closingSen: 900_000_00 },
    { id: "b2", periodFrom: "2025-09-01", periodTo: "2025-09-30", openingSen: 900_000_00, closingSen: 900_000_00 },
    { id: "b3", periodFrom: "2025-10-01", periodTo: "2025-10-31", openingSen: 900_000_00, closingSen: 1_100_000_00 },
    { id: "old", periodFrom: "2025-07-01", periodTo: "2025-07-31", openingSen: null, closingSen: null }, // saved before v0.23.0
  ];
  const c = checkpoints(bca, txns, batches);
  assert.deepEqual(c.points.map((p) => p.on), ["2025-07-31", "2025-08-31", "2025-09-30", "2025-10-31"], "shared days counted once; a statement without figures gives none");
  assert.equal(c.matched, 2);
  assert.deepEqual(c.parted, { on: "2025-09-30", apartSen: -21_000_00, steady: true, from: "2025-09-01" });
  const ok = checkpoints(bca, [T("2025-08-05", "spend", 100_000_00)], batches.slice(0, 1));
  assert.equal(ok.parted, null); assert.equal(ok.matched, 2);
});

const D = (id: string, on: string, kind: DTxn["kind"], amountSen: number, accountId: string, toAccountId: string | null, more: Partial<DTxn> = {}): DTxn =>
  ({ id, on, kind, amountSen, accountId, toAccountId, description: "", looksOk: false, createdAt: `2026-11-01T00:00:0${id.length % 10}Z`, ...more });
const types: Record<string, string> = { bca: "bank", krom: "bank", bri: "card", gopay: "ewallet" };

test("doubles: a card payment typed twice (a fee apart), the one from the card bill ticked", () => {
  const r = findDoubles([D("a", "2026-03-14", "transfer", 1_250_000_00, "krom", "bri"), D("bb", "2026-03-15", "transfer", 1_252_500_00, "bca", "bri", { fromCardBill: true })], (id) => types[id]);
  assert.deepEqual(r, [{ reason: "card", sure: true, removeId: "bb", keepId: "a", daysApart: 1, apartSen: 2_500_00 }]);
  assert.deepEqual(findDoubles([D("a", "2026-03-14", "transfer", 1_250_000_00, "krom", "bri"), D("bb", "2026-03-18", "transfer", 1_250_000_00, "krom", "bri")], (id) => types[id]), [], "4 days apart");
});

test("doubles: a transfer seen by both banks; money sent back is not a double; look-alikes never ticked; Looks fine stays off", () => {
  const r = findDoubles([D("a", "2026-06-06", "transfer", 2_000_000_00, "krom", "bca"), D("bb", "2026-06-08", "transfer", 2_000_000_00, "krom", "bca")], (id) => types[id]);
  assert.deepEqual(r.map((x) => [x.reason, x.sure, x.removeId, x.daysApart]), [["transfer", true, "bb", 2]]);
  assert.deepEqual(findDoubles([D("a", "2026-06-06", "transfer", 2_000_000_00, "krom", "bca"), D("bb", "2026-06-07", "transfer", 2_000_000_00, "bca", "krom")], (id) => types[id]), []);
  const same = findDoubles([D("a", "2026-07-02", "spend", 100_000_00, "gopay", null, { description: "GOPAY TOPUP" }), D("bb", "2026-07-02", "spend", 100_000_00, "gopay", null, { description: "gopay topup" })], (id) => types[id]);
  assert.deepEqual(same.map((x) => [x.reason, x.sure]), [["same-day", false]]);
  assert.deepEqual(findDoubles([D("a", "2026-06-06", "transfer", 2_000_000_00, "krom", "bca"), D("bb", "2026-06-08", "transfer", 2_000_000_00, "krom", "bca", { looksOk: true })], (id) => types[id]), []);
});
