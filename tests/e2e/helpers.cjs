const { chromium } = require("playwright");
const { mkdirSync } = require("node:fs");
const path = require("node:path");

/** A tiny check runner: each check prints ✓/✗, the suite throws at the end if any failed. */
function suite(name) {
  const results = [];
  return {
    async check(label, fn) {
      try { await fn(); results.push([true, label]); console.log(`  ✓ ${label}`); }
      catch (e) { results.push([false, label]); console.log(`  ✗ ${label}\n      ${String(e && e.message || e).split("\n")[0]}`); }
    },
    done() { const bad = results.filter((r) => !r[0]); console.log(`  ${name}: ${results.length - bad.length}/${results.length}`); if (bad.length) throw new Error(`${bad.length} check(s) failed`); },
  };
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
async function browser() { return chromium.launch(); }
async function shot(page, shots, name) { mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true }); }
module.exports = { suite, ok, browser, shot };
