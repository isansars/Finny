import { test } from "node:test";
import assert from "node:assert/strict";
import { toCsv, senToPlain } from "../../src/lib/csv.ts";
test("quotes, escapes and defuses formulas", () => {
  const csv = toCsv(["a", "b"], [{ a: 'Kopi, "enak"', b: "=HYPERLINK()" }, { a: "-25000", b: null }]);
  assert.equal(csv, 'a,b\n"Kopi, ""enak""",\'=HYPERLINK()\n-25000,\n');
});
test("sen to plain rupiah", () => { assert.equal(senToPlain(2499391), "24993.91"); assert.equal(senToPlain(4389000), "43890"); assert.equal(senToPlain(null), ""); });
