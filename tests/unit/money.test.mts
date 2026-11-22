import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRupiah, formatRupiah } from "../../src/lib/money.ts";

test("parses the ways people type rupiah", () => {
  assert.equal(parseRupiah("43890"), 4389000);
  assert.equal(parseRupiah("43.890"), 4389000);
  assert.equal(parseRupiah("Rp 43.890"), 4389000);
  assert.equal(parseRupiah("rp43.890"), 4389000);
  assert.equal(parseRupiah("1.250.000"), 125000000);
  assert.equal(parseRupiah("24.993,91"), 2499391);
  assert.equal(parseRupiah("43,890.50"), 4389050);
  assert.equal(parseRupiah("305354.18"), 30535418);
  assert.equal(parseRupiah("-25.000"), -2500000);
  assert.equal(parseRupiah("0"), 0);
});

test("refuses what isn't a number", () => {
  for (const s of ["", "abc", "12a", "1,2,3.4.5x", " "]) assert.equal(parseRupiah(s), null, s);
});

test("formats the Indonesian way", () => {
  assert.equal(formatRupiah(4389000), "Rp 43.890");
  assert.equal(formatRupiah(2499391), "Rp 24.993,91");
  assert.equal(formatRupiah(-2500000), "−Rp 25.000");
  assert.equal(formatRupiah(1500000000, { sign: "always" }), "+Rp 15.000.000");
  assert.equal(formatRupiah(-10000000, { sign: "never" }), "Rp 100.000");
  assert.equal(formatRupiah(0), "Rp 0");
  assert.equal(formatRupiah(4389000, { prefix: false }), "43.890");
});

test("round-trips", () => {
  for (const sen of [0, 100, 4389000, 2499391, 3600000000000]) assert.equal(parseRupiah(formatRupiah(sen)), sen);
});
