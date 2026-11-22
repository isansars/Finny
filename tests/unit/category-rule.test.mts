import { test } from "node:test";
import assert from "node:assert/strict";
import { placeProblem, mergeProblem, flattenTree, depthOf } from "../../src/lib/category-rule.ts";
const C = [
  { id: "kp", kind: "expense", parentId: null, name: "Kebutuhan Pribadi" },
  { id: "kopi", kind: "expense", parentId: "kp", name: "Beli Kopi" },
  { id: "rt", kind: "expense", parentId: null, name: "Kebutuhan Rumah Tangga" },
  { id: "pokok", kind: "expense", parentId: "rt", name: "Kebutuhan Pokok" },
  { id: "makan", kind: "expense", parentId: "pokok", name: "Makan di Luar" },
  { id: "gaji", kind: "income", parentId: null, name: "Gaji Bulanan" },
];
test("depth and the three-level limit", () => {
  assert.equal(depthOf("makan", C), 3);
  assert.equal(placeProblem("", "expense", "pokok", C), null); // a new third-level category
  assert.match(placeProblem("", "expense", "makan", C)!, /3 levels/);
  assert.match(placeProblem("rt", "expense", "kp", C)!, /3 levels/); // rt spans 3 levels itself
  assert.equal(placeProblem("kopi", "expense", "pokok", C), null);
});
test("no cycles, same kind only", () => {
  assert.match(placeProblem("rt", "expense", "makan", C)!, /itself/);
  assert.match(placeProblem("kopi", "expense", "gaji", C)!, /same kind/);
  assert.match(placeProblem("kopi", "expense", "nope", C)!, /doesn't exist/);
});
test("merge rules", () => {
  assert.equal(mergeProblem("kopi", "makan", C), null);
  assert.match(mergeProblem("kopi", "gaji", C)!, /same kind/);
  assert.match(mergeProblem("rt", "makan", C)!, /own sub-categories/);
  assert.match(mergeProblem("kopi", "kopi", C)!, /different/);
});
test("the tree in order with depths", () => {
  const t = flattenTree(C, "expense").map((c) => `${c.depth}:${c.id}`);
  assert.deepEqual(t, ["0:kp", "1:kopi", "0:rt", "1:pokok", "2:makan"]);
});
