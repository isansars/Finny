// Sprint 2 (v0.2.0) QA, 🐧 Bubbles: the new look (FINNY-36) and Home as the monthly dashboard (FINNY-12). Made-up numbers.
const { suite, ok, browser, shot } = require("./helpers.cjs");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint2");
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const json = async (path, opts = {}) => { const r = await page.request.fetch(`${base}/api/${path}`, { ...opts, headers: { "content-type": "application/json" }, data: opts.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const text = (sel) => page.locator(sel).first().innerText();
  const noSideScroll = async (label) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label} scrolls sideways`);

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } }); // a clean slate whatever ran before
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), month = now.slice(0, 7);
  const day = (d) => `${month}-${String(d).padStart(2, "0")}`;

  // A small made-up month.
  const bca = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "5.000.000" } })).body;
  const gopay = (await json("accounts", { method: "POST", data: { name: "GoPay", type: "ewallet" } })).body;
  await json("categories/starter", { method: "POST" });
  const cats = (await json("categories")).body; const C = (n) => cats.find((c) => c.name === n).id;
  const add = (d) => json("transactions", { method: "POST", data: d });
  await add({ kind: "spend", amount: "40.000", accountId: bca.id, categoryId: C("Beli Kopi"), description: "Ngopi di Le Tusa", entity: "Le Tusa", on: day(1) });
  await add({ kind: "spend", amount: "35.000", accountId: bca.id, categoryId: C("Beli Kopi"), description: "Ngopi di Le Tusa", entity: "Le Tusa", on: day(2) });
  await add({ kind: "spend", amount: "25.000", accountId: bca.id, categoryId: C("Biaya Bensin"), description: "Bensin", entity: "Pertamina", on: day(2) });
  await add({ kind: "spend", amount: "100.000", accountId: bca.id, categoryId: C("Belanja Dapur dan Rumah Tangga"), description: "Belanja mingguan", entity: "Superindo", on: day(1) });
  await add({ kind: "income", amount: "1.000.000", accountId: bca.id, categoryId: C("Gaji Bulanan"), description: "Gaji", on: day(1) });
  await add({ kind: "transfer", amount: "50.000", accountId: bca.id, toAccountId: gopay.id, description: "Top up GoPay", on: day(2) });
  await add({ kind: "spend", amount: "300.000", accountId: bca.id, categoryId: C("Dana Darurat"), description: "Nabung darurat", on: day(1) });
  // Spending = 40+35+25+100 = 200.000. Kebutuhan Pribadi 75.000 (37,5%), Kebutuhan Rumah Tangga 100.000 (50%), Transportasi 25.000 (12,5%).

  await s.check("FINNY-42.1 the dashboard API sums the month by hand: transfers and savings aren't spending", async () => {
    const d = (await json(`dashboard?month=${month}`)).body;
    ok(d.totals.spendSen === 20000000 && d.totals.incomeSen === 100000000 && d.totals.savedSen === 30000000, JSON.stringify(d.totals));
    const name = (id) => cats.find((c) => c.id === id)?.name;
    ok(JSON.stringify(d.byCategory.map((x) => [name(x.categoryId), x.sen])) === JSON.stringify([["Kebutuhan Rumah Tangga", 10000000], ["Kebutuhan Pribadi", 7500000], ["Transportasi", 2500000]]), JSON.stringify(d.byCategory));
    ok(d.byDay[0] === 14000000 && d.byDay[1] === 6000000, `byDay ${d.byDay.slice(0, 3)}`);
    ok(d.topPlaces[0].name === "Superindo" && d.topPlaces[1].name === "Le Tusa" && d.topPlaces[1].sen === 7500000, JSON.stringify(d.topPlaces));
    ok(d.topSpends[0].sen === 10000000, "top spend");
  });
  await s.check("FINNY-43.1 Home shows the balance card, income / spent / saved, the donut legend, top places and biggest spends", async () => {
    await page.goto(base + "/"); await page.getByTestId("by-category").waitFor();
    ok((await text('[data-testid="spent"]')) === "Rp 200.000" && (await text('[data-testid="income"]')) === "Rp 1.000.000" && (await text('[data-testid="saved"]')) === "Rp 300.000", "tiles");
    const legend = await text('[data-testid="by-category"]'); ok(legend.includes("Kebutuhan Rumah Tangga") && legend.includes("50%") && legend.includes("38%") && legend.includes("13%"), legend);
    ok((await text('[data-testid="top-places"]')).startsWith("1"), "top places"); ok((await text('[data-testid="top-spends"]')).includes("Belanja mingguan"), "biggest spends");
    await noSideScroll("Home"); await shot(page, shots, "s2-01-home-375");
  });
  await s.check("FINNY-43.2 tapping a day shows only that day's transactions", async () => {
    // FINNY-162: the chart is one slider for the keyboard: Home is day 1, → is day 2.
    const chart = page.getByTestId("day-chart"); await chart.focus(); await page.keyboard.press("Home"); await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300); const t = await text('[data-testid="txn-list"]');
    ok(t.includes("Bensin") && !t.includes("Belanja mingguan"), "day filter"); await page.getByRole("button", { name: "Show all days" }).click();
  });
  await s.check("FINNY-36.2 line icons in the navigation, no emoji in the chrome", async () => {
    const nav = page.getByRole("navigation", { name: "Main" }); ok(await nav.locator("svg").count() >= 4, "no icons");
    const chrome = await nav.innerText(); ok(!/\p{Extended_Pictographic}/u.test(chrome), `emoji in nav: ${chrome}`);
  });
  await s.check("FINNY-36.3 every category shows an icon tile guessed from its name", async () => {
    await page.goto(base + "/categories"); await page.getByTestId("cat-Beli Kopi").waitFor();
    ok(await page.getByTestId("cat-Beli Kopi").locator(".fy-tile svg").count() === 1, "no tile");
    await noSideScroll("Categories"); await shot(page, shots, "s2-02-categories-375");
  });
  await s.check("FINNY-36.3 the owner picks an icon and a colour, and it sticks", async () => {
    await page.getByRole("button", { name: "Change Beli Kopi" }).click(); const f = page.getByRole("dialog");
    await f.getByRole("radiogroup", { name: "Colour" }).getByRole("radio", { name: "mint" }).click();
    await f.getByRole("radiogroup", { name: "Icon" }).getByRole("radio", { name: "cookie" }).click();
    await shot(page, shots, "s2-03-category-sheet-375");
    await f.getByRole("button", { name: "Save", exact: true }).click(); await f.waitFor({ state: "detached" });
    const k = (await json("categories")).body.find((c) => c.name === "Beli Kopi"); ok(k.icon === "cookie" && k.color === "mint", JSON.stringify(k));
    ok(await page.getByTestId("cat-Beli Kopi").locator('.fy-tile[data-color="mint"]').count() === 1, "tile colour not shown");
  });
  await s.check("FINNY-36.4 quick add: big amount, category tiles with the most used first, account chips, Today / Yesterday", async () => {
    await page.goto(base + "/"); await page.getByRole("button", { name: "Add a transaction" }).first().click(); const f = page.getByRole("dialog");
    const first = await f.getByRole("radiogroup", { name: "Category" }).getByRole("radio").first().getAttribute("aria-label");
    ok(first === "Beli Kopi", `most used first, got ${first}`);
    ok(await f.getByRole("radiogroup", { name: "Account", exact: true }).getByRole("radio").count() === 2, "account chips");
    for (const n of ["Today", "Yesterday", "Pick a date"]) ok(await f.getByText(n, { exact: true }).isVisible(), `no ${n}`);
    await f.getByRole("button", { name: "Yesterday" }).click(); ok(await f.getByLabel("Date").inputValue() !== now, "Yesterday didn't change the date");
    await f.getByLabel("Amount").fill("12000"); await f.getByLabel("What for").fill("Ngopi pagi");
    await f.getByTestId("suggestion").waitFor();
    await noSideScroll("Quick add"); await shot(page, shots, "s2-04-quick-add-375");
    await f.getByRole("button", { name: "Close" }).click();
  });
  await s.check("FINNY-36.5 accounts: type tiles, slim rows, reorder only in Reorder mode", async () => {
    await json("accounts", { method: "POST", data: { name: "CC Mandiri", type: "card", openingSen: -20000000, limit: "10.000.000" } });
    await page.goto(base + "/accounts"); await page.getByTestId("account-CC Mandiri").waitFor();
    ok(!(await page.getByRole("button", { name: /Move .* up/ }).count()), "arrows outside Reorder");
    ok(await page.getByTestId("account-CC Mandiri").locator(".fy-usage").count() === 1, "no usage bar");
    await noSideScroll("Accounts"); await shot(page, shots, "s2-05-accounts-375");
  });
  await s.check("FINNY-36.6 dates read the human way (Today / Yesterday / Mon 3 Nov)", async () => {
    await page.goto(base + "/"); await page.getByTestId("txn-list").waitFor(); const t = await text('[data-testid="txn-list"]');
    ok(!/\d{1,2}\/\d{1,2}\/\d{4}/.test(t), "a numeric date"); ok(/(Today|Yesterday|\w{3},? \d{1,2} \w{3})/.test(t), t.slice(0, 120));
  });
  await s.check("Settings and sign-in in the new look", async () => {
    await page.goto(base + "/settings"); await noSideScroll("Settings"); await shot(page, shots, "s2-06-settings-375");
  });

  // Dark mode and desktop
  const dark = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: "dark" });
  await dark.addCookies(await ctx.cookies()); const dp = await dark.newPage();
  await s.check("Dark mode follows the phone", async () => {
    await dp.goto(base + "/"); await dp.getByTestId("by-category").waitFor();
    const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor); ok(bg === "rgb(27, 22, 34)", bg);
    await shot(dp, shots, "s2-07-home-dark-375");
    await dp.getByRole("button", { name: "Add a transaction" }).first().click(); await dp.waitForTimeout(300); await shot(dp, shots, "s2-08-quick-add-dark-375");
  });
  const desk = await b.newContext({ viewport: { width: 1280, height: 900 } }); await desk.addCookies(await ctx.cookies()); const kp = await desk.newPage();
  await s.check("Desktop: top bar, dashboard beside the quick-add form", async () => {
    await kp.goto(base + "/"); await kp.getByTestId("by-category").waitFor(); ok(await kp.locator(".fy-topbar").isVisible() && await kp.locator("aside form").isVisible(), "layout");
    await shot(kp, shots, "s2-09-home-desktop");
  });
  const out = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }); const op = await out.newPage();
  await op.goto(base + "/login"); await shot(op, shots, "s2-10-sign-in-375");

  await b.close(); s.done();
};
