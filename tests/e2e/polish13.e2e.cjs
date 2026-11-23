// Sprint 13 (v0.13.0) QA, 🐧 Bubbles: the polish pass (FINNY-131). The v0.12.0 audit as a check that runs on every
// release: four months of made-up data across every feature, all 23 screens at 390 px light and dark and 1280 px,
// then each of the audit's 8 findings directly. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const sm = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

module.exports = async ({ base, shots }) => {
  const s = suite("polish13");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), N = today.slice(0, 7), M = sm(N, -1);
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
  const j = async (method, u, data) => { const r = await page.request.fetch(`${base}/api/${u}`, { method, data, headers: { "content-type": "application/json" } }); return r.json().catch(() => ({})); };
  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await j("DELETE", "me/data", { confirm: "DELETE" });

  // ---- made-up data across every feature (the audit's set)
  const A = {};
  for (const [k, n, t, o, extra] of [["bca", "BCA", "bank", "62.000.000"], ["mandiri", "Mandiri", "bank", "18.000.000"], ["cash", "Tunai", "cash", "1.500.000"], ["gopay", "GoPay", "ewallet", "800.000"],
    ["cc", "CC Mandiri", "card", "0", { limit: "36.000.000", statementDay: 21, dueDay: 5 }], ["loan", "ShopeePinjam", "loan", "0", { limit: "10.000.000" }],
    ["rdpu", "Reksadana Pasar Uang", "investment", "20.000.000"], ["saham", "Saham BBCA", "investment", "15.000.000"]])
    A[k] = await j("POST", "accounts", { name: n, type: t, opening: o, openingOn: "2025-01-01", ...(extra || {}) });
  await j("POST", "categories/starter", {});
  const cats = await j("GET", "categories"); const list = Array.isArray(cats) ? cats : cats.categories;
  const C = (n) => list.find((c) => c.name === n)?.id ?? list.find((c) => c.kind === "expense").id;
  const income = list.find((c) => c.kind === "income").id;
  const sp = [["Beli Kopi", 45000, "bca", "Kopi"], ["Makan di Luar", 120000, "gopay", "Makan malam"], ["Belanja Dapur dan Rumah Tangga", 650000, "cc", "Belanja mingguan"], ["Biaya Listrik", 400000, "mandiri", "Token listrik"], ["Biaya Bensin", 150000, "cash", "Bensin"]];
  for (let i = 3; i >= 0; i--) {
    const m = sm(N, -i), last = i === 0 ? Number(today.slice(8)) : 28;
    await j("POST", "transactions", { kind: "income", amount: "15.000.000", accountId: A.bca.id, categoryId: income, description: "Gaji", on: `${m}-01` });
    for (let d = 2; d <= last; d += 3) { const [c, a, acc, desc] = sp[d % sp.length]; await j("POST", "transactions", { kind: "spend", amount: String(a + d * 1000), accountId: A[acc].id, categoryId: C(c), description: desc, on: `${m}-${String(d).padStart(2, "0")}` }); }
    await j("POST", "transactions", { kind: "transfer", amount: "2.000.000", accountId: A.bca.id, toAccountId: A.cc.id, description: "Bayar kartu", on: `${m}-01` });
    await j("POST", "transactions", { kind: "transfer", amount: "1.500.000", accountId: A.bca.id, toAccountId: A.rdpu.id, description: "Nabung RDPU", on: `${m}-01` });
  }
  // The card is paid 5.000.000 more than it owes: a card in credit (audit finding 4).
  await j("POST", "transactions", { kind: "transfer", amount: "5.000.000", accountId: A.bca.id, toAccountId: A.cc.id, description: "Lebih bayar", on: `${N}-01` });
  await j("PUT", `accounts/${A.cc.id}/terms`, { interest: "1,75", interestPer: "month", minPct: "5", minFloor: "50.000" });
  await j("PUT", `accounts/${A.loan.id}/terms`, { interest: "2,5", interestPer: "month", minFixed: "850.000" });
  await j("PUT", `accounts/${A.rdpu.id}/holding`, { kind: "fund" }); await j("PUT", `accounts/${A.saham.id}/holding`, { kind: "stock" });
  await j("POST", "assets/values", { on: today, values: [{ accountId: A.rdpu.id, value: "26.400.000" }, { accountId: A.saham.id, value: "13.800.000" }] });
  await j("POST", "things", { name: "Motor Vario", kind: "vehicle", boughtOn: "2024-03-01", cost: "24.000.000" });
  await j("PUT", "emergency", { stability: "fair", dependents: 1 }); await j("PUT", "emergency/sources", { sources: [{ accountId: A.mandiri.id }, { accountId: A.rdpu.id, part: "10.000.000" }] }); await j("PUT", "emergency", { monthly: "2.000.000" });
  const g = await j("POST", "goals", { name: "DP rumah", kind: "save", target: "150.000.000", byMonth: sm(N, 20), sources: [{ accountId: A.bca.id, part: "30.000.000" }] });
  await j("POST", "goals", { name: "Net worth Rp 500 jt", kind: "networth", target: "500.000.000", byMonth: sm(N, 36) });

  const routes = [["home", "/"], ["budget", "/budget"], ["accounts", "/accounts"], ["reports", "/reports"], ["reports-balance", "/reports?view=balance"], ["reports-pace", "/reports?view=pace"],
    ["debts", "/debts"], ["assets", "/assets"], ["investments", "/assets/investments"], ["things", "/assets/things"], ["emergency", "/assets/emergency"], ["emergency-plan", "/assets/emergency/plan"],
    ["goals", "/assets/goals"], ["goal", `/assets/goals/${g.id}`], ["reviews", "/review"], ["review", `/review/${M}`], ["review-budget", `/review/${M}/budget`], ["review-close", `/review/${M}/close`],
    ["match", `/review/${M}/match`], ["import", "/import"], ["statements", "/import/statements"], ["settings", "/settings"], ["categories", "/categories"]];
  const narrow = new Set(["debts", "emergency", "emergency-plan", "goals", "goal", "reviews", "review", "review-budget", "review-close", "match"]);
  const axe = async (p, tags) => (await new AxeBuilder({ page: p }).withTags(tags).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`);
  // Small text links and buttons: their tap area (the element or what's drawn over it) must reach 22 px out from the centre each way.
  const smallTaps = (p) => p.evaluate(() => [...document.querySelectorAll(".fy-more, .fy-linkish:not(.fy-row):not(.fy-card):not(.fy-btn), .fy-rv-line a, .fy-tap")].filter((e) => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === "hidden" || r.top < 0 || r.bottom > innerHeight - 90) return false;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return [[cx, cy - 21], [cx, cy + 21], [cx - 21, cy], [cx + 21, cy]].some(([x, y]) => { const hit = document.elementFromPoint(x, y); return !hit || !(hit === e || e.contains(hit)); });
  }).map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)));

  await s.check("every screen at 390 px, light: axe clean, nothing sideways, 44 px taps", async () => {
    const bad = [];
    for (const [name, path] of routes) {
      await page.goto(base + path); await page.waitForLoadState("networkidle"); await page.waitForTimeout(250);
      const a = await axe(page, ["wcag2a", "wcag2aa", "wcag21aa"]); if (a.length) bad.push(`${name}: axe ${a.join(", ")}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) bad.push(`${name}: scrolls sideways`);
      // Scroll through the page so every small control is checked where it's visible.
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      const small = new Set();
      for (let y = 0; y < h; y += 500) { await page.evaluate((v) => scrollTo(0, v), y); await page.waitForTimeout(60); for (const t of await smallTaps(page)) small.add(t); }
      if (small.size) bad.push(`${name}: small taps ${[...small].join(" | ")}`);
    }
    ok(!bad.length, bad.join(" ; "));
  });

  await s.check("every screen at 390 px, dark: contrast", async () => {
    const dark = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", storageState: await ctx.storageState() });
    const pd = await dark.newPage(); const bad = [];
    for (const [name, path] of routes) { await pd.goto(base + path); await pd.waitForLoadState("networkidle"); await pd.waitForTimeout(250);
      const v = (await new AxeBuilder({ page: pd }).withRules(["color-contrast"]).analyze()).violations.map((x) => `${x.id} ${x.nodes[0]?.target.join(" ")}`); if (v.length) bad.push(`${name}: ${v.join(", ")}`); }
    await pd.goto(`${base}/assets/goals`); await pd.getByTestId("goal-DP rumah").waitFor(); await shot(pd, shots, "p13-02-goals-dark");
    await dark.close(); ok(!bad.length, bad.join(" ; "));
  });

  await s.check("every screen at 1280 px: nothing sideways; single-column pages at most 720 px (finding 6)", async () => {
    const desk = await b.newContext({ viewport: { width: 1280, height: 860 }, storageState: await ctx.storageState() });
    const pk = await desk.newPage(); const bad = [];
    for (const [name, path] of routes) { await pk.goto(base + path); await pk.waitForLoadState("networkidle");
      if (await pk.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) bad.push(`${name}: sideways`);
      if (narrow.has(name)) { const w = await pk.evaluate(() => document.querySelector(".fy-narrow")?.getBoundingClientRect().width ?? 9999); if (w > 720) bad.push(`${name}: ${Math.round(w)} px wide`); } }
    await pk.goto(`${base}/review/${M}`); await pk.waitForLoadState("networkidle"); await shot(pk, shots, "p13-06-review-desktop");
    await desk.close(); ok(!bad.length, bad.join(" ; "));
  });

  await s.check("finding 1: Plan <month> is a button-style link, not a link inside a sentence", async () => {
    await page.goto(`${base}/review/${M}/budget`); await page.waitForLoadState("networkidle");
    const link = page.getByRole("link", { name: `Plan ${NAMES[Number(N.slice(5)) - 1]}` });
    ok((await link.getAttribute("class")).includes("fy-btn"), "not a button-style link");
    await shot(page, shots, "p13-01-plan-link");
  });

  await s.check("finding 4: a card in credit is under What you have, labelled; net worth unchanged", async () => {
    const accs = await j("GET", "accounts"); const cc = (Array.isArray(accs) ? accs : accs.accounts).find((a) => a.name === "CC Mandiri");
    ok(cc.balanceSen > 0, `the card isn't in credit: ${cc.balanceSen}`);
    const bal = await j("GET", `reports/balance?month=${N}`);
    const have = bal.have.find((a) => a.name === "CC Mandiri");
    ok(have?.inCredit === true && have.sen === cc.balanceSen && !bal.owe.some((a) => a.name === "CC Mandiri"), JSON.stringify(have));
    ok(bal.netSen === bal.haveSen - bal.oweSen, "net worth");
    await page.goto(`${base}/reports?view=balance`); await page.waitForLoadState("networkidle");
    const row = page.locator(".fy-row", { hasText: "CC Mandiri" }).first();
    ok((await row.innerText()).includes("in credit"), await row.innerText());
    await row.scrollIntoViewIfNeeded(); await page.screenshot({ path: require("node:path").join(shots, "p13-04-balance-in-credit.png") });
  });

  await s.check("finding 5: the Statements step with nothing to read says so", async () => {
    await page.goto(`${base}/review/${M}`); await page.getByTestId("rv-statements").waitFor();
    ok((await page.getByTestId("rv-statements").innerText()).includes("Nothing to check: no account is read by statement"), await page.getByTestId("rv-statements").innerText());
  });

  await s.check("finding 7: no cut-off text where it matters", async () => {
    const cut = async (path, sel) => { await page.goto(base + path); await page.waitForLoadState("networkidle"); return page.evaluate((q) => [...document.querySelectorAll(q)].filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 40)), sel); };
    const a = await cut("/reports?view=balance", ".fy-row .main .s"), b2 = await cut("/import", '[data-testid="import-match"] .t'), c = await cut("/settings", ".fy-row .main .s");
    ok(!a.length && !b2.length && !c.some((t) => t.startsWith("Every table")), `cut: ${[...a, ...b2, ...c].join(" | ")}`);
    await page.goto(base + "/import"); ok((await page.getByTestId("import-match").innerText()).includes("Check against your workbook"), "import title");
  });

  await s.check("finding 8: a reached emergency fund stops asking for a budget line", async () => {
    ok((await j("GET", "emergency")).toGoSen === 0, "the made-up fund isn't reached");
    await page.goto(base + "/assets/emergency/plan"); await page.getByTestId("ef-topped").waitFor();
    ok(!(await page.getByRole("button", { name: "Add it to this month's budget" }).count()), "still asks for a budget line");
    await shot(page, shots, "p13-08-reached");
  });

  await s.check("findings 2 and 3 on the screens they were found", async () => {
    await page.goto(`${base}/assets/emergency`); await page.waitForLoadState("networkidle");
    const edit = page.getByRole("button", { name: "Edit" }); const r = await edit.boundingBox();
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent?.trim(), [r.x + r.width / 2, r.y + r.height / 2 + 20]);
    ok(hit === "Edit", `20 px below Edit's centre hits "${hit}"`);
    await shot(page, shots, "p13-03-emergency-taps");
    const warn = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--warn-text").trim());
    ok(warn === "#92400e", `--warn-text ${warn}`);
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await j("DELETE", "me/data", { confirm: "DELETE" });
  await b.close();
  s.done();
};
