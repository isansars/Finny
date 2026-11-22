import { test } from "node:test";
import assert from "node:assert/strict";
import { guessIcon, guessColor, lookOf, PALETTE } from "../../src/lib/category-look.ts";
test("icons guessed from the owner's category names", () => {
  const cases: [string, string, string][] = [["Beli Kopi", "expense", "coffee"], ["Makan di Luar", "expense", "utensils"], ["Biaya Bensin", "expense", "fuel"],
    ["Gaji Bulanan", "income", "wallet"], ["Biaya Listrik", "expense", "zap"], ["Biaya Bank", "expense", "landmark"], ["Biaya Transportasi Publik", "expense", "bus"],
    ["Nonton Film atau Musik", "expense", "clapperboard"], ["Belanja Dapur dan Rumah Tangga", "expense", "shopping-cart"], ["Dana Darurat", "saving", "shield-check"],
    ["Emas", "investment", "gem"], ["THR", "income", "gift"], ["Something new", "expense", "receipt"], ["Something new", "saving", "piggy-bank"]];
  for (const [n, k, want] of cases) assert.equal(guessIcon(n, k), want, n);
});
test("colours are stable and from the palette", () => {
  assert.equal(guessColor("Beli Kopi"), guessColor("beli kopi"));
  assert.ok(PALETTE[guessColor("Anything")]);
});
test("the owner's choice wins; an unknown colour falls back", () => {
  assert.deepEqual(lookOf({ name: "Beli Kopi", kind: "expense", icon: "cookie", color: "teal" }), { icon: "cookie", color: "teal", hex: PALETTE.teal });
  assert.equal(lookOf({ name: "Beli Kopi", kind: "expense", color: "nope" }).color, guessColor("Beli Kopi"));
});
