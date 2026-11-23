// Renders Finny's icons from docs/diagrams/finny/logo/finny-mark.svg (run after changing the mark):
//   node scripts/make-icons.mjs
// → src/app/apple-icon.png (180, square: iOS rounds it), public/icons/icon-192.png, icon-512.png (rounded tile),
//   public/icons/maskable-512.png (full-bleed, the F inside the 80% safe zone so Android can crop it to any shape).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const svg = readFileSync("docs/diagrams/finny/logo/finny-mark.svg", "utf8");
const square = svg.replace('rx="22.5"', 'rx="0"');
const maskable = square.replace('<g id="f">', '<g id="f" transform="translate(10 10) scale(.8)">');
const jobs = [["src/app/apple-icon.png", square, 180], ["public/icons/icon-192.png", svg, 192], ["public/icons/icon-512.png", svg, 512], ["public/icons/maskable-512.png", maskable, 512]];
const b = await chromium.launch();
for (const [out, s, size] of jobs) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${s.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await p.screenshot({ path: out, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("wrote", out);
}
await b.close();
