import { test } from "node:test";
import assert from "node:assert/strict";
import { dashboard, rootOf } from "../../src/lib/dashboard-rule.ts";
const C = [
  { id: "kp", kind: "expense", parentId: null, name: "Kebutuhan Pribadi" }, { id: "kopi", kind: "expense", parentId: "kp", name: "Beli Kopi" },
  { id: "tr", kind: "expense", parentId: null, name: "Transportasi" }, { id: "gaji", kind: "income", parentId: null, name: "Gaji" },
  { id: "dd", kind: "saving", parentId: null, name: "Dana Darurat" },
];
const t = (id: string, on: string, kind: string, amountSen: number, categoryId: string | null, entity: string | null = null) => ({ id, on, kind, amountSen, categoryId, entity, description: id, accountId: "a" });
const T = [
  t("k1", "2026-11-03", "spend", 4389000, "kopi", "Le Tusa"), t("k2", "2026-11-03", "spend", 3800000, "kopi", "Janji Jiwa"),
  t("b1", "2026-11-04", "spend", 2500000, "tr", "Pertamina"), t("g", "2026-11-25", "income", 1500000000, "gaji"),
  t("x", "2026-11-05", "transfer", 10000000, null), t("s", "2026-11-26", "spend", 30000000, "dd"), t("k3", "2026-11-30", "spend", 1000000, "kopi", "Le Tusa"),
];
test("a sub-category rolls up to its top level", () => { assert.equal(rootOf("kopi", C), "kp"); assert.equal(rootOf("tr", C), "tr"); });
test("totals match a hand sum; transfers and savings aren't spending", () => {
  const d = dashboard(T, C, 30);
  assert.deepEqual(d.totals, { incomeSen: 1500000000, spendSen: 4389000 + 3800000 + 2500000 + 1000000, savedSen: 30000000, investedSen: 0 });
  assert.deepEqual(d.byCategory, [{ categoryId: "kp", sen: 9189000 }, { categoryId: "tr", sen: 2500000 }]);
  assert.equal(d.byDay[2], 8189000); assert.equal(d.byDay[29], 1000000); assert.equal(d.byDay.reduce((a, b) => a + b, 0), d.totals.spendSen);
  assert.deepEqual(d.topSpends.map((x) => x.id), ["k1", "k2", "b1", "k3"]);
  assert.deepEqual(d.topPlaces, [{ name: "Le Tusa", sen: 5389000 }, { name: "Janji Jiwa", sen: 3800000 }, { name: "Pertamina", sen: 2500000 }]);
});
