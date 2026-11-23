// Sprint 7 (v0.7.0) QA, 🐧 Bubbles: debts and cards (FINNY-17), end to end in a browser, on a made-up card and paylater
// whose figures are worked out by hand below. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const shift = (m, by) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

module.exports = async ({ base, shots }) => {
  const s = suite("sprint7");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const month = today.slice(0, 7), prev = shift(month, -1);
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
  A.bca = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "20.000.000", openingOn: "2026-01-01" } })).body;
  A.card = (await json("accounts", { method: "POST", data: { name: "BRI Card", type: "card", opening: "0", openingOn: "2026-01-01", limit: "20.000.000" } })).body;
  A.pay = (await json("accounts", { method: "POST", data: { name: "PinjamDulu", type: "loan", opening: "-1.000.000", openingOn: "2026-01-01" } })).body;
  const C = { belanja: (await json("categories", { method: "POST", data: { name: "Belanja Online", kind: "expense" } })).body };
  // By hand: the card is charged 4.000.000 then paid 880.000 → owes 3.120.000, 22% paid off from its 4.000.000 peak.
  // The paylater started at 1.000.000 owed and was paid 250.000 → owes 750.000, 25% paid off. Owed in all: 3.870.000.
  await json("transactions", { method: "POST", data: { kind: "spend", amount: "4.000.000", accountId: A.card.id, categoryId: C.belanja.id, description: "Laptop", on: `${prev}-02` } });
  await json("transactions", { method: "POST", data: { kind: "transfer", amount: "880.000", accountId: A.bca.id, toAccountId: A.card.id, description: "Bayar kartu", on: `${prev}-06` } });
  await json("transactions", { method: "POST", data: { kind: "transfer", amount: "250.000", accountId: A.bca.id, toAccountId: A.pay.id, description: "Cicilan", on: `${prev}-01` } });
  // Due days placed a few days ahead so both bills fall in the next 14 days whatever day the suite runs.
  const cardDue = Number(addDays(today, 3).slice(8)), cardStmt = Number(addDays(today, -3).slice(8)), payDue = Number(addDays(today, 7).slice(8));

  await s.check("FINNY-17.1 a card's terms are saved in the sheet; refused for a bank and out of range", async () => {
    await page.goto(base + "/accounts"); await page.getByRole("link", { name: "Debts ›" }).click(); await page.waitForURL(base + "/debts");
    await page.getByTestId("debt-BRI Card").click(); await page.waitForURL(/\/debts\/[0-9a-f-]+$/);
    await page.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Interest percent").fill("1,75");
    await page.getByLabel("Minimum percent").fill("10"); await page.getByLabel("Minimum floor").fill("50.000");
    await page.getByLabel("Statement day").fill(String(cardStmt)); await page.getByLabel("Due day").fill(String(cardDue));
    await page.getByRole("radio", { name: "Consumptive" }).click(); await shot(page, shots, "s7-03-terms-375");
    await page.getByRole("button", { name: "Save terms" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="terms"]')?.textContent?.includes("1,75% a month"));
    const t = await text("terms"); ok(t.includes("10% of the balance, at least Rp 50.000") && t.includes("312.000") && t.includes("Consumptive"), t);
    ok((await json(`accounts/${A.pay.id}/terms`, { method: "PUT", data: { interest: "2,9", interestPer: "month", minFixed: "250.000", dueDay: payDue } })).status === 200, "paylater terms");
    ok((await json(`accounts/${A.bca.id}/terms`, { method: "PUT", data: { interest: "1" } })).status === 400, "terms on a bank");
    ok((await json(`accounts/${A.card.id}/terms`, { method: "PUT", data: { dueDay: 40 } })).status === 400, "due day 40");
    ok((await json(`accounts/${A.card.id}/terms`, { method: "PUT", data: { minPct: "150" } })).status === 400, "minimum over 100%");
  });

  await s.check("FINNY-17.3 one debt: progress from its peak and its history by month", async () => {
    await page.reload(); await page.getByTestId("debt-hero").waitFor();
    const h = await text("debt-hero"); ok(h.includes("3.120.000") && h.includes("22% paid off from its peak of Rp 4.000.000"), h);
    const r = await text(`dh-${prev}`); ok(r.includes("+880 rb") && r.includes("−4 jt") && r.includes("3,1 jt"), r);
    await noSideScroll("One debt"); await shot(page, shots, "s7-02-debt-375");
  });

  await s.check("FINNY-17.2 Debts: owed, paid off this year, minimums, the next bill, progress in plan order", async () => {
    await page.goto(base + "/debts"); await page.getByTestId("debts").waitFor();
    ok((await text("owed")).includes("3.870.000"), await text("owed"));
    if (month.slice(5) !== "01") ok((await text("paid-year")).includes("1.130.000"), await text("paid-year"));
    ok((await text("owed")).includes("562.000"), "minimums 312.000 + 250.000");
    ok((await text("next-bill")).startsWith("BRI Card bill · Rp 3.120.000"), await text("next-bill"));
    const order = await page.getByTestId("debts").locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    ok(JSON.stringify(order) === JSON.stringify(["debt-PinjamDulu", "debt-BRI Card"]), JSON.stringify(order)); // snowball: smallest first
    ok((await text("debt-PinjamDulu")).includes("25% paid off") && (await text("debt-PinjamDulu")).includes("min 250.000"), await text("debt-PinjamDulu"));
    await noSideScroll("Debts"); await shot(page, shots, "s7-01-debts-375");
  });

  await s.check("FINNY-17.4 the payoff plan: method and extra saved, figures from the rule, the order", async () => {
    await page.getByRole("link", { name: "See your payoff plan" }).click(); await page.waitForURL(base + "/debts/plan");
    await page.getByTestId("plan").waitFor();
    await page.getByLabel("Extra each month").fill("500.000"); await page.getByLabel("Extra each month").blur();
    await page.waitForResponse((r) => r.url().includes("/api/debts/plan") && r.request().method() === "GET");
    const plan = (await json("debts/plan")).body;
    ok(plan.method === "snowball" && plan.extraSen === 50_000_000, `${plan.method} ${plan.extraSen}`);
    const sb = plan.plans.snowball, mn = plan.plans.minimums, av = plan.plans.avalanche;
    ok(sb.debtFreeMonth && mn.debtFreeMonth && sb.debtFreeMonth < mn.debtFreeMonth, `${sb.debtFreeMonth} vs ${mn.debtFreeMonth}`);
    ok(sb.totalInterestSen < mn.totalInterestSen, "the extra saves interest");
    ok(sb.order[0].name === "PinjamDulu" && av.order[0].name === "PinjamDulu", "2,9% paylater first either way");
    ok(sb.totalPaidSen === 387_000_000 + sb.totalInterestSen, "everything owed plus interest is paid");
    await page.waitForFunction(() => (document.querySelector('[data-testid="plan-free"]')?.textContent?.length ?? 0) > 0);
    const order = await text("plan-order"); ok(order.indexOf("PinjamDulu") < order.indexOf("BRI Card") && order.includes("debt-free"), order);
    ok((await text("plan-saves")) !== "–", "no saving shown");
    await page.getByRole("radio", { name: "Avalanche" }).click(); await page.waitForTimeout(600);
    ok((await json("debts/plan")).body.method === "avalanche", "method not remembered");
    await page.reload(); await page.getByTestId("plan").waitFor();
    ok(await page.getByRole("radio", { name: "Avalanche" }).getAttribute("aria-checked") === "true", "not shown after reload");
    await noSideScroll("Plan"); await shot(page, shots, "s7-04-plan-375");
  });

  await s.check("FINNY-17.5 Home lists bills due in 14 days; Mark paid fills a transfer to the card", async () => {
    await page.goto(base + "/"); await page.getByTestId("bills-card").waitFor();
    const t = await text("bills-card"); ok(t.indexOf("BRI Card") < t.indexOf("PinjamDulu") && t.includes("3.120.000") && t.includes("750.000"), t);
    await shot(page, shots, "s7-05-home-bills-375");
    await page.getByRole("button", { name: "Mark BRI Card paid…" }).click();
    const sheet = page.getByRole("dialog", { name: "Add a transaction" }); await sheet.waitFor();
    ok(await sheet.getByRole("button", { name: "Delete" }).count() === 0, "a draft must not offer Delete");
    await shot(page, shots, "s7-06-mark-paid-375");
    await sheet.getByRole("button", { name: "Save" }).click(); await sheet.waitFor({ state: "detached" });
    const card = (await json("accounts")).body.find((a) => a.id === A.card.id); ok(card.balanceSen === 0, `card ${card.balanceSen}`);
    const bills = (await json("debts/bills?days=14")).body.bills; ok(bills.find((x) => x.id === A.card.id).leftSen === 0 && bills.find((x) => x.id === A.pay.id).leftSen === 75_000_000, JSON.stringify(bills));
    await page.waitForFunction(() => !document.querySelector('[data-testid="bills-card"]')?.textContent?.includes("BRI Card"));
  });

  await s.check("desktop and accessibility", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    for (const p of ["/debts", "/debts/plan", `/debts/${A.card.id}`]) { await page.goto(base + p); await page.waitForLoadState("networkidle"); await scan(p); }
    await page.getByRole("button", { name: "Edit" }).click(); await page.getByLabel("Interest percent").waitFor(); await scan("terms sheet"); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(base + "/debts/plan"); await page.getByTestId("plan").waitFor(); await noSideScroll("Desktop"); await shot(page, shots, "s7-07-plan-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
