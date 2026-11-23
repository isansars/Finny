// Sprint 6 (v0.6.0) QA, 🐧 Bubbles: the reports (FINNY-16), end to end in a browser, on six made-up months whose totals are
// worked out by hand below, plus 2,400 older made-up rows to time the reports. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const shift = (m, by) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const daysIn = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(Date.UTC(y, mo, 0)).getUTCDate(); };

module.exports = async ({ base, shots }) => {
  const s = suite("sprint6");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const month = today.slice(0, 7);
  const months = [5, 4, 3, 2, 1, 0].map((n) => shift(month, -n));
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const noSideScroll = async (l) => { const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map((e) => `${e.tagName}.${e.className?.baseVal ?? e.className}:${Math.round(e.getBoundingClientRect().right)}`)); ok(!wide.length, `${l} scrolls sideways: ${wide.join(" ")}`); };
  const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  const A = {};
  A.bca = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "10.000.000", openingOn: "2025-01-01" } })).body;
  A.card = (await json("accounts", { method: "POST", data: { name: "BRI Card", type: "card", opening: "0", openingOn: "2025-01-01", limit: "20.000.000" } })).body;
  const C = {};
  C.gaji = (await json("categories", { method: "POST", data: { name: "Gaji", kind: "income" } })).body;
  C.rt = (await json("categories", { method: "POST", data: { name: "Rumah Tangga", kind: "expense" } })).body;
  C.makan = (await json("categories", { method: "POST", data: { name: "Makan di Luar", kind: "expense", parentId: C.rt.id } })).body;
  C.listrik = (await json("categories", { method: "POST", data: { name: "Biaya Listrik", kind: "expense", parentId: C.rt.id } })).body;
  C.kopi = (await json("categories", { method: "POST", data: { name: "Beli Kopi", kind: "expense" } })).body;
  // Every month, all on the 1st: salary 15.000.000 in; 1.000.000 + 400.000 out of BCA; 100.000 coffee on the card; 100.000 BCA → card.
  for (const m of months) {
    const on = `${m}-01`;
    await json("transactions", { method: "POST", data: { kind: "income", amount: "15.000.000", accountId: A.bca.id, categoryId: C.gaji.id, description: "Gaji", on } });
    await json("transactions", { method: "POST", data: { kind: "spend", amount: "1.000.000", accountId: A.bca.id, categoryId: C.makan.id, description: "Makan", on } });
    await json("transactions", { method: "POST", data: { kind: "spend", amount: "400.000", accountId: A.bca.id, categoryId: C.listrik.id, description: "Token listrik", on } });
    await json("transactions", { method: "POST", data: { kind: "spend", amount: "100.000", accountId: A.card.id, categoryId: C.kopi.id, description: "Kopi", on } });
    await json("transactions", { method: "POST", data: { kind: "transfer", amount: "100.000", accountId: A.bca.id, toAccountId: A.card.id, description: "Bayar kartu", on } });
  }
  // By hand: each month in 15.000.000, out 1.500.000, kept 13.500.000 (the 100.000 transfer is neither).
  // BCA at this month's end: 10.000.000 + 6 × (15.000.000 − 1.400.000 − 100.000) = 91.000.000. The card owes 0. Net worth 91.000.000.

  await s.check("FINNY-16.6 Reports open from Home and from Settings", async () => {
    await page.goto(base + "/"); await page.getByRole("link", { name: "Reports ›" }).click(); await page.waitForURL(/\/reports\?view=balance/);
    await page.goto(base + "/settings"); await page.getByRole("link", { name: "Reports" }).click(); await page.waitForURL(base + "/reports");
    ok(await page.locator(".fy-tabbar a.on").innerText() === "Home", "Home tab not lit on Reports");
  });

  await s.check("FINNY-16.1 Cashflow: in, out and kept for 6 months; transfers not counted", async () => {
    await page.getByTestId("cashflow-tree").waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="flow-in"]')?.textContent !== "…");
    ok((await text("flow-in")).includes("90"), await text("flow-in"));
    ok((await text("flow-out")).includes("9"), await text("flow-out"));
    ok((await text("flow-kept")).includes("81"), await text("flow-kept"));
    const api = (await json(`reports/cashflow?to=${month}&months=6`)).body;
    ok(api.months.every((m) => m.inSen === 1_500_000_000 && m.outSen === 150_000_000 && m.keptSen === 1_350_000_000), JSON.stringify(api.months[0]));
    await noSideScroll("Cashflow"); await shot(page, shots, "s6-01-cashflow-375");
  });

  await s.check("FINNY-16.1 the month's category tree rolls up, with the 3-month average, and folds", async () => {
    ok((await text("node-Rumah Tangga")).includes("1.400.000"), await text("node-Rumah Tangga"));
    ok((await text("node-Makan di Luar")).includes("1.000.000") && (await text("node-Makan di Luar")).includes("1 jt"), await text("node-Makan di Luar"));
    ok((await text("section-expense")).includes("1.500.000"), await text("section-expense"));
    ok((await text("kept-month")).includes("13.500.000"), await text("kept-month"));
    await page.getByRole("button", { name: "Fold Rumah Tangga" }).click();
    ok(await page.getByTestId("node-Makan di Luar").count() === 0, "didn't fold");
    await page.getByRole("button", { name: "Open Rumah Tangga" }).click();
    await page.getByRole("radio", { name: "12 months" }).click();
    await page.waitForFunction(() => /162|81/.test(document.querySelector('[data-testid="flow-kept"]')?.textContent ?? ""));
  });

  await s.check("FINNY-16.2 Balance sheet: net worth, what you have and owe, the change", async () => {
    await page.getByRole("tab", { name: "Balance sheet" }).click(); await page.getByTestId("net-worth").waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="net-worth"]')?.textContent?.includes("91.000.000"));
    ok((await text("net-worth")).includes("13.500.000 since"), await text("net-worth"));
    ok((await text("acc-BCA")).includes("91.000.000"), await text("acc-BCA"));
    ok((await text("acc-BRI Card")).includes("0"), await text("acc-BRI Card"));
    const api = (await json(`reports/balance?month=${month}`)).body;
    ok(api.netSen === 9_100_000_000 && api.oweSen === 0 && api.series.length === 12, `${api.netSen} ${api.oweSen} ${api.series.length}`);
    ok(api.series[11].netSen - api.series[10].netSen === 1_350_000_000, "change");
    await noSideScroll("Balance"); await shot(page, shots, "s6-02-balance-375");
  });

  await s.check("FINNY-16.4 one account, month by month", async () => {
    await page.getByTestId("acc-BCA").click(); await page.waitForURL(/\/reports\/account\//);
    await page.getByTestId(`am-${month}`).waitFor();
    ok((await text("account-hero")).includes("91.000.000"), await text("account-hero"));
    const r = await text(`am-${month}`); ok(r.includes("+15 jt") && r.includes("−1,5 jt") && r.includes("+13,5 jt"), r);
    await noSideScroll("Account"); await shot(page, shots, "s6-03-account-375");
  });

  await s.check("FINNY-16.3 Spending pace: so far, the projection, the biggest spends", async () => {
    await page.goto(base + "/reports?view=pace"); await page.getByTestId("pace").waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="pace-spent"]')?.textContent?.includes("1.500.000"));
    const day = Number(today.slice(8, 10)), n = daysIn(month), proj = day < n ? Math.round((150_000_000 / day) * n / 100_000) * 100_000 : 150_000_000;
    const api = (await json(`reports/pace?month=${month}`)).body;
    ok(api.spentSen === 150_000_000 && api.projectedSen === proj && api.daysGone === day, `${api.spentSen} ${api.projectedSen} ${proj}`);
    if (day < n) ok((await text("pace-projection")).includes("At this pace"), await text("pace-projection"));
    ok((await text("biggest")).includes("Makan") && (await text("biggest")).includes("Kebutuhan") === false, await text("biggest"));
    await noSideScroll("Pace"); await shot(page, shots, "s6-04-pace-375");
  });

  await s.check("FINNY-16.5 each report downloads as CSV, in rupiah", async () => {
    const get = async (p) => { const r = await page.request.get(`${base}/api/${p}`); return { type: r.headers()["content-type"], disp: r.headers()["content-disposition"] ?? "", body: await r.text() }; };
    const cf = await get(`reports/cashflow?to=${month}&months=6&format=csv`);
    ok(cf.type.startsWith("text/csv") && cf.disp.includes("attachment") && cf.body.startsWith("section,name,in_rupiah") && cf.body.includes(`month,${month},15000000,1500000,13500000`), cf.body.slice(0, 200));
    ok((await get(`reports/balance?month=${month}&format=csv`)).body.includes("have,BCA,bank,91000000,13500000"), "balance csv");
    ok((await get(`reports/pace?month=${month}&format=csv`)).body.split("\n").length >= 29, "pace csv");
    ok((await get(`reports/account/${A.bca.id}?to=${month}&months=6&format=csv`)).body.includes(`${month},15000000,1500000,13500000,91000000`), "account csv");
    ok((await json(`reports/account/00000000-0000-0000-0000-000000000000`)).status === 404, "unknown account");
    ok((await json(`reports/balance?month=2026-13`)).status === 400, "bad month");
  });

  await s.check("speed: each report answers in under 500 ms with 2,400 more rows", async () => {
    const start = (await json("imports", { method: "POST", data: { source: "qa-speed", accounts: [{ key: "old", name: "Old", type: "bank", openingSen: 0, openingOn: "2023-01-01", limitSen: null }], categories: [{ key: "lama", kind: "expense", path: ["Lama"] }] } })).body;
    for (let c = 0; c < 5; c++) {
      const rows = Array.from({ length: 480 }, (_, i) => { const k = c * 480 + i; return { on: `2024-${String((k % 12) + 1).padStart(2, "0")}-${String((k % 28) + 1).padStart(2, "0")}`, kind: "spend", sen: 1000 + k, accountId: start.accounts.old, categoryId: start.categories.lama, description: `row ${k}` }; });
      await json(`imports/${start.batchId}/rows`, { method: "POST", data: { rows } });
    }
    await json(`imports/${start.batchId}/finish`, { method: "POST", data: {} });
    const time = async (p) => { await json(p); const t0 = Date.now(); await json(p); return Date.now() - t0; };
    const t = { cashflow: await time(`reports/cashflow?to=${month}&months=12`), balance: await time(`reports/balance?month=${month}`), pace: await time(`reports/pace?month=${month}`), account: await time(`reports/account/${A.bca.id}?to=${month}&months=12`) };
    console.log(`      ${JSON.stringify(t)} ms`);
    ok(Object.values(t).every((ms) => ms < 500), JSON.stringify(t));
    ok((await json(`reports/balance?month=${month}`)).body.netSen < 9_100_000_000, "the old rows count in net worth");
  });

  await s.check("desktop and accessibility", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    for (const v of ["cashflow", "balance", "pace"]) { await page.goto(base + `/reports?view=${v}`); await page.waitForLoadState("networkidle"); await scan(v); }
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(base + "/reports?view=cashflow"); await page.getByTestId("cashflow-tree").waitFor(); await page.waitForLoadState("networkidle");
    await noSideScroll("Desktop"); await shot(page, shots, "s6-05-cashflow-desktop");
    await page.goto(base + "/reports?view=balance"); await page.getByTestId("net-worth").waitFor(); await page.waitForLoadState("networkidle"); await shot(page, shots, "s6-06-balance-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
