// Sprint 8 (v0.8.0) QA, 🐧 Bubbles: assets and investments (FINNY-18), end to end in a browser, on made-up holdings, a
// deposit, a motorbike and a business stake whose figures are worked out by hand below. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const fmt = (sen) => (sen / 100).toLocaleString("de-DE"); // 1.234.000

module.exports = async ({ base, shots }) => {
  const s = suite("sprint8");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const noSideScroll = async (l) => { const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((e) => `${e.tagName}.${e.className?.baseVal ?? e.className}`)); ok(!wide.length, `${l} scrolls sideways: ${wide.join(" ")}`); };
  const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  const A = {};
  A.bca = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "100.000.000", openingOn: "2024-01-01" } })).body;
  A.fund = (await json("accounts", { method: "POST", data: { name: "Reksadana Saham", type: "investment", opening: "0", openingOn: "2024-01-01" } })).body;
  A.dep = (await json("accounts", { method: "POST", data: { name: "Deposito Krom", type: "investment", opening: "0", openingOn: "2024-01-01" } })).body;
  const depStart = addDays(today, -184);
  await json("transactions", { method: "POST", data: { kind: "transfer", amount: "10.000.000", accountId: A.bca.id, toAccountId: A.fund.id, description: "Beli reksadana", on: addDays(today, -40) } });
  await json("transactions", { method: "POST", data: { kind: "transfer", amount: "3.650.000", accountId: A.bca.id, toAccountId: A.dep.id, description: "Deposito", on: depStart } });
  // By hand: BCA 100.000.000 − 10.000.000 − 3.650.000 = 86.350.000. The fund, valued at 11.240.000, is up 1.240.000 (+12,4%).
  // The deposit at 6,5% for 184 days: 3.650.000 × 0,065 × 184 ÷ 365 = 119.600. The motorbike: 24.000.000 × 0,88^(years held).
  // The business stake: 20% of 35.000.000 = 7.000.000.
  const motorOn = addDays(today, -730), motor = Math.round((24_000_000_00 * Math.pow(0.88, daysBetween(motorOn, today) / 365.25)) / 100_000) * 100_000;
  const net = 86_350_000_00 + 11_240_000_00 + 3_650_000_00 + 119_600_00 + motor + 7_000_000_00;

  await s.check("FINNY-18.1/2 a holding says what it holds; fixed income takes a rate and a maturity", async () => {
    await page.goto(base + "/accounts"); await page.getByRole("link", { name: "Assets ›" }).click(); await page.waitForURL(base + "/assets");
    await page.goto(base + "/assets/investments"); await page.getByTestId("holding-Deposito Krom").click();
    await page.getByLabel("What it holds").selectOption("deposit"); await page.getByLabel("Rate a year").fill("6,5");
    await page.getByLabel("Matures").fill(addDays(today, 100)); await shot(page, shots, "s8-03-holding-375");
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByTestId("fixed").waitFor();
    ok((await text("fixed")).includes("6,5% a year") && (await text("fixed")).includes("+119.600"), await text("fixed"));
    await page.getByTestId("holding-Reksadana Saham").click(); await page.getByLabel("What it holds").selectOption("fund"); await page.getByRole("button", { name: "Save" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="holdings"]')?.textContent?.includes("Mutual fund · not valued yet"));
    ok(!(await text("holdings")).includes("+0%"), "a holding not valued yet shows no P/L");
  });

  await s.check("FINNY-18.1 update values in one sheet; P/L in rupiah and %", async () => {
    await page.getByRole("button", { name: "Update values" }).click();
    await page.getByLabel("Value of Reksadana Saham").fill("11.240.000"); await shot(page, shots, "s8-04-update-375");
    await page.screenshot({ path: require("node:path").join(shots, "s8-04b-update-viewport-375.png") }); // what a phone shows, not the full page
    await page.getByRole("button", { name: "Save 1 value" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="inv-pl"]')?.textContent?.includes("1.240.000"));
    ok((await text("holdings")).includes("11.240.000") && (await text("holdings")).includes("+12,4%"), await text("holdings"));
    await noSideScroll("Investments"); await shot(page, shots, "s8-02-investments-375");
    ok((await json("assets/values", { method: "POST", data: { values: [{ accountId: A.bca.id, value: "1" }] } })).status === 400, "a value for a bank");
    ok((await json("assets/values", { method: "POST", data: { on: addDays(today, 3), values: [{ accountId: A.fund.id, value: "1" }] } })).status === 400, "a future value");
  });

  await s.check("FINNY-18.3 a motorbike and a business stake: worth over time, a share", async () => {
    await page.goto(base + "/assets/things"); await page.getByRole("button", { name: "Add a thing" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Motor (Vario 160)"); await page.getByLabel("Kind").selectOption("vehicle");
    await page.getByLabel("Bought for").fill("24.000.000"); await page.getByLabel("Bought on").fill(motorOn);
    ok(await page.getByLabel("Yearly change").inputValue() === "-12", "the typical -12% for a vehicle");
    await shot(page, shots, "s8-05-add-thing-375");
    await page.getByRole("button", { name: "Add", exact: true }).click(); await page.getByTestId("things").waitFor();
    ok((await text("thing-Motor (Vario 160)")).includes(fmt(motor)), `${await text("thing-Motor (Vario 160)")} vs ${fmt(motor)}`);
    ok((await json("things", { method: "POST", data: { name: "Kedai Kopi", kind: "business", boughtOn: "2025-01-01", cost: "50.000.000", share: "20", value: "35.000.000" } })).status === 200, "business stake");
    ok((await json("things", { method: "POST", data: { name: "X", kind: "business", boughtOn: "2025-01-01", cost: "1", share: "150" } })).status === 400, "a share of 150%");
    await page.reload(); await page.getByTestId("thing-Kedai Kopi").waitFor();
    ok((await text("thing-Kedai Kopi")).includes("7.000.000") && (await text("thing-Kedai Kopi")).includes("your 20%"), await text("thing-Kedai Kopi"));
    await page.getByTestId("thing-Motor (Vario 160)").click(); await page.getByTestId("thing-hero").waitFor();
    ok((await text("thing-hero")).includes("estimated") && (await text("thing-hero")).includes("since bought"), await text("thing-hero"));
    await noSideScroll("Thing"); await shot(page, shots, "s8-06-thing-375");
  });

  await s.check("FINNY-18.4 Assets: net worth with everything, the groups, the allocation", async () => {
    await page.goto(base + "/assets"); await page.getByTestId("groups").waitFor();
    const api = (await json("assets")).body;
    ok(api.netSen === net, `net ${api.netSen} vs ${net}`);
    ok((await text("worth")).includes(fmt(net)), await text("worth"));
    ok((await text("group-investments")).includes("+Rp 1.240.000 (+12,4%)"), await text("group-investments"));
    ok((await text("group-fixed")).includes("+Rp 119.600 interest"), await text("group-fixed"));
    ok((await text("group-cash")).includes("86.350.000"), await text("group-cash"));
    ok((await text("group-business")).includes("Kedai Kopi (20%)"), await text("group-business"));
    ok((await text("worth")).includes("Cash & bank"), "allocation legend");
    await noSideScroll("Assets"); await shot(page, shots, "s8-01-assets-375");
  });

  await s.check("FINNY-18.5 Reports › Balance sheet counts values and things", async () => {
    const month = today.slice(0, 7);
    const bal = (await json(`reports/balance?month=${month}`)).body;
    ok(bal.have.find((r) => r.name === "Reksadana Saham")?.sen === 11_240_000_00, "the fund at its market value");
    ok(bal.have.some((r) => r.name === "Motor (Vario 160)" && r.type === "thing:vehicle") && bal.have.some((r) => r.name === "Kedai Kopi"), "things in the balance sheet");
    ok(bal.netSen > net - 1_000_000_00 && bal.netSen < net + 1_000_000_00, `month-end ${bal.netSen} near today's ${net}`);
    await page.goto(base + "/reports?view=balance"); await page.getByTestId("acc-Motor (Vario 160)").waitFor();
    await page.getByTestId("acc-Motor (Vario 160)").click(); await page.waitForURL(/\/assets\/things\//);
  });

  await s.check("FINNY-18.3/6 sold things leave net worth; export has values and things", async () => {
    const id = (await json("assets")).body.things.find((t) => t.name === "Kedai Kopi").id;
    await json(`things/${id}`, { method: "PATCH", data: { soldOn: today } });
    ok((await json("assets")).body.netSen === net - 7_000_000_00, "sold stake still counted");
    const r = await page.request.get(base + "/api/export"); const body = (await r.body()).toString("latin1");
    ok(body.includes("market_values.csv") && body.includes("things.csv"), "export files");
  });

  await s.check("desktop and accessibility", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    for (const p of ["/assets", "/assets/investments", "/assets/things"]) { await page.goto(base + p); await page.waitForLoadState("networkidle"); await scan(p); }
    await page.getByRole("button", { name: "Add a thing" }).click(); await page.getByLabel("Kind").waitFor(); await scan("thing sheet"); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(base + "/assets"); await page.getByTestId("groups").waitFor(); await noSideScroll("Desktop"); await shot(page, shots, "s8-07-assets-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
