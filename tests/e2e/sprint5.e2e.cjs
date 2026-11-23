// Sprint 5 (v0.5.0) QA, 🐧 Bubbles: the monthly budget (FINNY-15), end to end in a browser, with made-up numbers and the
// made-up wealth workbook (tests/fixtures/books-fixture.mjs). Never real data.
const path = require("node:path");
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const shift = (m, by) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

module.exports = async ({ base, shots }) => {
  const s = suite("sprint5");
  const { makeWorkbooks } = await import(path.join(__dirname, "..", "fixtures", "make-workbooks.mjs"));
  const files = await makeWorkbooks(path.join(__dirname, "..", "..", ".data", "qa-fixtures"));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const month = today.slice(0, 7), prev = shift(month, -1), next = shift(month, 1), mName = MONTHS[Number(month.slice(5)) - 1];
  const day = (m, d) => `${m}-${String(d).padStart(2, "0")}`;
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const noSideScroll = async (l) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${l} scrolls sideways`);
  const row = (n) => page.getByTestId(`budget-${n}`);
  const budget = async (m = month) => (await json(`budgets?month=${m}`)).body;
  const planned = async (catId, m = month) => (await budget(m)).lines.find((l) => l.categoryId === catId)?.plannedSen ?? null;

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  const acc = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "20.000.000", openingOn: "2024-01-01" } })).body;
  const C = {};
  C.pribadi = (await json("categories", { method: "POST", data: { name: "Kebutuhan Pribadi", kind: "expense" } })).body;
  C.kopi = (await json("categories", { method: "POST", data: { name: "Beli Kopi", kind: "expense", parentId: C.pribadi.id } })).body;
  C.rokok = (await json("categories", { method: "POST", data: { name: "Beli Rokok", kind: "expense", parentId: C.pribadi.id } })).body;
  C.makan = (await json("categories", { method: "POST", data: { name: "Makan di Luar", kind: "expense" } })).body;
  C.transport = (await json("categories", { method: "POST", data: { name: "Transportasi", kind: "expense" } })).body;
  C.gaji = (await json("categories", { method: "POST", data: { name: "Gaji", kind: "income" } })).body;
  const spend = (amount, cat, on, description = "x") => json("transactions", { method: "POST", data: { kind: "spend", amount, accountId: acc.id, categoryId: cat.id, description, on } });
  await spend("450.000", C.kopi, day(month, 1)); await spend("120.000", C.rokok, day(month, 1)); await spend("600.000", C.makan, day(month, 1));
  await spend("480.000", C.kopi, day(prev, 10)); await spend("510.000", C.kopi, day(shift(month, -2), 10)); await spend("540.000", C.kopi, day(shift(month, -3), 10));
  await json("transactions", { method: "POST", data: { kind: "income", amount: "15.000.000", accountId: acc.id, categoryId: C.gaji.id, description: "Gaji", on: day(month, 1) } });
  await spend("43.890", C.kopi, "2024-06-02", "Ngopi di Kedai"); // the wealth log's Coffee row, so "Coffee" is learned as Beli Kopi

  await s.check("FINNY-15.7 the tab bar: Home · Budget · ＋ · Accounts · Settings; Categories from Settings", async () => {
    const tabs = await page.locator(".fy-tabbar").evaluate((n) => [...n.children].map((c) => c.getAttribute("aria-label") || c.textContent.trim()));
    ok(JSON.stringify(tabs) === JSON.stringify(["Home", "Budget", "Add a transaction", "Accounts", "Settings"]), JSON.stringify(tabs));
    await page.goto(base + "/settings"); await page.getByRole("link", { name: "Categories" }).click(); await page.waitForURL(base + "/categories");
    ok(await page.locator(".fy-tabbar a.on").innerText() === "Settings", "Settings tab not lit on Categories");
    await page.getByRole("link", { name: "Settings" }).first().click(); await page.waitForURL(base + "/settings");
    await shot(page, shots, "s5-01-settings-375");
  });

  await s.check("FINNY-15.4 an empty month invites a plan", async () => {
    await page.getByRole("link", { name: "Budget" }).click(); await page.waitForURL(base + "/budget");
    await page.getByTestId("budget-empty").waitFor();
    ok((await page.getByTestId("budget-empty").innerText()).includes(`Plan ${mName}`), "no invite");
    await noSideScroll("Empty budget"); await shot(page, shots, "s5-02-empty-375");
  });

  await s.check("FINNY-15.2 set a budget with quick fill (last month, 3-month average), this month only", async () => {
    await page.getByRole("button", { name: "Budget a category" }).click();
    await page.getByLabel("Category", { exact: true }).selectOption(C.kopi.id);
    await page.getByRole("button", { name: "Last month · 480.000" }).waitFor();
    ok(await page.getByRole("button", { name: "3-month average · 510.000" }).count() === 1, "3-month average");
    ok((await page.locator(".fy-sheet").innerText()).includes("spent Rp 450.000 this month"), "this month's spending in the sheet");
    await page.getByRole("button", { name: "Last month · 480.000" }).click();
    ok(await page.getByLabel("Budget amount").inputValue() === "480.000", "quick fill didn't fill");
    await shot(page, shots, "s5-03-sheet-375");
    await page.getByRole("radio", { name: `Only ${mName}` }).click(); await page.getByRole("button", { name: "Save budget" }).click();
    await row("Beli Kopi").waitFor();
    ok(await row("Beli Kopi").getAttribute("data-state") === "close", "450 of 480 isn't amber");
    ok((await row("Beli Kopi").innerText()).includes("Rp 30.000 left"), await row("Beli Kopi").innerText());
    ok(await planned(C.kopi.id, next) === null, "only this month");
  });

  await s.check("FINNY-15.4 over budget goes red; a group covers sub-categories without their own budget", async () => {
    await row("Beli Kopi").click(); await page.getByLabel("Budget amount").fill("400.000"); await page.getByRole("button", { name: "Save budget" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="budget-Beli Kopi"]')?.getAttribute("data-state") === "over");
    ok((await row("Beli Kopi").innerText()).includes("Rp 50.000 over"), "over text");
    await page.getByRole("button", { name: "Budget another category" }).click(); await page.getByLabel("Category", { exact: true }).selectOption(C.pribadi.id);
    await page.getByLabel("Budget amount").fill("1.000.000"); await page.getByRole("radio", { name: "Every month" }).click(); await page.getByRole("button", { name: "Save budget" }).click();
    await row("Kebutuhan Pribadi").waitFor();
    const t = await row("Kebutuhan Pribadi").innerText();
    ok(t.includes("120.000") && t.includes("1 inside"), `group: ${t}`); // Beli Rokok only: Beli Kopi has its own budget
    ok(await planned(C.pribadi.id, next) === 100_000_000 && await planned(C.pribadi.id, shift(month, 14)) === 100_000_000, "every month");
  });

  await s.check("FINNY-15.2/3 rest of the year; expected income and left to plan", async () => {
    await page.getByRole("button", { name: "Budget another category" }).click(); await page.getByLabel("Category", { exact: true }).selectOption(C.makan.id);
    await page.getByLabel("Budget amount").fill("1.500.000"); await page.getByRole("radio", { name: `Rest of ${month.slice(0, 4)}` }).click(); await page.getByRole("button", { name: "Save budget" }).click();
    await row("Makan di Luar").waitFor(); ok(await row("Makan di Luar").getAttribute("data-state") === "ok", "not green");
    if (month.slice(5) !== "12") ok(await planned(C.makan.id, next) === 150_000_000, "rest of the year");
    ok(await planned(C.makan.id, `${Number(month.slice(0, 4)) + 1}-01`) === null, "past the year");
    await page.getByTestId("expected-income").click(); await page.getByRole("textbox", { name: "Expected income" }).fill("15.000.000");
    await page.getByRole("radio", { name: "Every month" }).click(); await page.getByRole("button", { name: "Save expected income" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="left-to-plan"]')?.textContent?.includes("12.100.000"));
    ok((await page.getByTestId("planned").innerText()) === "Rp 2.900.000", await page.getByTestId("planned").innerText());
    ok((await page.getByTestId("budget-sub").innerText()).includes("left"), "days left");
    ok((await page.getByTestId("budget-status").innerText()) === "1 over", await page.getByTestId("budget-status").innerText());
    await noSideScroll("Budget"); await shot(page, shots, "s5-04-budget-375");
  });

  await s.check("FINNY-15.5 Home shows the Budget card with % used, linking to Budget", async () => {
    await page.getByRole("link", { name: "Home" }).click(); await page.getByTestId("budget-card").waitFor();
    const t = await page.getByTestId("budget-card").innerText();
    ok(t.includes("% used") && t.includes("Beli Kopi") && t.includes("113%"), t);
    await shot(page, shots, "s5-05-home-card-375");
    await page.getByRole("link", { name: "See the whole budget ›" }).click(); await page.waitForURL(/\/budget\?month=/);
  });

  await s.check("remove a budget for this month only; the API refuses bad input", async () => {
    await row("Makan di Luar").click(); await page.getByRole("button", { name: "Remove budget" }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="budget-Makan di Luar"]'));
    if (month.slice(5) !== "12") ok(await planned(C.makan.id, next) === 150_000_000, "removed from next month too");
    ok((await json("budgets", { method: "PUT", data: { categoryId: C.gaji.id, month, amountSen: 100 } })).status === 400, "an income category got a budget");
    ok((await json("budgets", { method: "PUT", data: { categoryId: C.kopi.id, month, amountSen: -5 } })).status === 400, "a negative budget");
    ok((await json("budgets", { method: "PUT", data: { categoryId: C.kopi.id, month: "2026-13", amountSen: 5 } })).status === 400, "a bad month");
  });

  await s.check("FINNY-15.6 the 2025 budget from the wealth workbook: matched, changeable, copied into 2026", async () => {
    await page.goto(base + "/import"); await page.getByLabel("Choose a workbook").setInputFiles(files.wealth);
    await page.getByRole("button", { name: "Next: your 2025 budget" }).click();
    await page.getByTestId("budget-map").waitFor();
    ok(await page.getByLabel("Category for Coffee").inputValue() === C.kopi.id, "Coffee not learned as Beli Kopi");
    ok(await page.getByLabel("Category for Food").inputValue() === C.makan.id, "Food → Makan di Luar");
    ok(await page.getByLabel("Category for Transportation").inputValue() === C.transport.id, "Transportation → Transportasi");
    ok(await page.getByLabel("Category for Housing").inputValue() === "", "Housing guessed with nothing that fits");
    await page.getByLabel("Category for Bills").selectOption(C.pribadi.id); // the owner changes one
    await noSideScroll("Budget mapping"); await shot(page, shots, "s5-06-workbook-375");
    await page.getByRole("button", { name: "Bring in the 2025 budget" }).click();
    await page.getByTestId("budget-done").waitFor();
    const dec = await budget("2025-12");
    ok(dec.lines.find((l) => l.categoryId === C.kopi.id)?.plannedSen === 75_000_000, "December coffee");
    ok(dec.lines.find((l) => l.categoryId === C.pribadi.id)?.plannedSen === 40_000_000, "Bills into Kebutuhan Pribadi");
    ok(dec.totals.incomePlanSen === 1_500_000_000, "expected income");
    ok((await budget("2026-03")).lines.find((l) => l.categoryId === C.transport.id)?.plannedSen === 60_000_000, "copied into 2026");
    await shot(page, shots, "s5-07-workbook-done-375");
  });

  await s.check("export includes budgets and expected income", async () => {
    const r = await page.request.get(base + "/api/export"); const body = (await r.body()).toString("latin1");
    ok(r.status() === 200 && body.includes("budgets.csv") && body.includes("income_plans.csv"), "missing files");
  });

  await s.check("desktop and accessibility: the Budget page and its sheet", async () => {
    await page.goto(base + `/budget?month=${month}`); await row("Beli Kopi").waitFor();
    const scan = async (l) => { const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes.slice(0, 3).map((n) => n.target.join(" ") + " " + (n.any[0]?.message || "").slice(0, 90)).join(" | ")}`).join(", ")}`); };
    await scan("budget 375");
    await row("Beli Kopi").click(); await page.getByLabel("Budget amount").waitFor(); await page.waitForTimeout(500); await scan("sheet 375"); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 860 }); await page.reload(); await row("Beli Kopi").waitFor();
    await noSideScroll("Desktop"); await shot(page, shots, "s5-08-budget-desktop");
    await page.goto(base + "/"); await page.getByTestId("budget-card").waitFor(); await shot(page, shots, "s5-09-home-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
