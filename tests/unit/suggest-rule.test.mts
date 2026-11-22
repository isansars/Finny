import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestCategory, keywords } from "../../src/lib/suggest-rule.ts";
const H = [
  { description: "Ngopi di Cold n Brew", categoryId: "kopi", on: "2026-11-01" },
  { description: "Ngopi di Le Tusa", categoryId: "kopi", on: "2026-11-03" },
  { description: "Ngopi sambil kerja", categoryId: "makan", on: "2026-10-01" },
  { description: "Bensin", categoryId: "bensin", on: "2026-11-04" },
  { description: "Makan siang di warteg", categoryId: "makan", on: "2026-11-05" },
  { description: "Transfer ke Akhsal", categoryId: null, on: "2026-11-05" },
];
test("keywords drop filler and digits", () => { assert.deepEqual(keywords("Ngopi di Le Tusa #2"), ["ngopi", "le", "tusa"]); });
test("the first keyword decides, most used wins", () => {
  assert.equal(suggestCategory("Ngopi di Janji Jiwa", H), "kopi");
  assert.equal(suggestCategory("bensin pertamina", H), "bensin");
});
test("an exact match beats the first keyword", () => { assert.equal(suggestCategory("Ngopi sambil kerja", H), "makan"); });
test("falls back to any shared word, then nothing", () => {
  assert.equal(suggestCategory("Siang ini makan bakso", H), "makan");
  assert.equal(suggestCategory("Beli pulsa", H), null);
  assert.equal(suggestCategory("", H), null);
});
