// Sprint 9 (v0.9.0) QA, 🐧 Bubbles: the emergency fund (FINNY-19), end to end in a browser, on made-up accounts and
// spending whose figures are worked out by hand below. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const addDays = (day, n) => new Date(Date.parse(day + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const shiftMonth = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

module.exports = async ({ base, shots }) => {
  const s = suite("sprint9");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), month = today.slice(0, 7);
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
  const A = {}, C = {};
  A.bca = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "80.000.000", openingOn: "2024-01-01" } })).body;
  A.jago = (await json("accounts", { method: "POST", data: { name: "Jago Kantong", type: "bank", opening: "20.000.000", openingOn: "2024-01-01" } })).body;
  A.rdpu = (await json("accounts", { method: "POST", data: { name: "Reksadana Pasar Uang", type: "investment", opening: "0", openingOn: "2024-01-01" } })).body;
  A.card = (await json("accounts", { method: "POST", data: { name: "Kartu Kredit", type: "card", opening: "0", openingOn: "2024-01-01" } })).body;
  C.rt = (await json("categories", { method: "POST", data: { name: "Rumah Tangga", kind: "expense" } })).body;
  await json("transactions", { method: "POST", data: { kind: "transfer", amount: "15.000.000", accountId: A.bca.id, toAccountId: A.rdpu.id, description: "Beli RDPU", on: addDays(today, -100) } });
  for (const [by, amt] of [[-3, "9.000.000"], [-2, "12.000.000"], [-1, "9.000.000"], [0, "5.000.000"]])
    await json("transactions", { method: "POST", data: { kind: "spend", amount: amt, accountId: A.bca.id, categoryId: C.rt.id, description: "Belanja", on: `${shiftMonth(month, by)}-0${by === 0 ? 1 : 5}` } });
  // By hand: spending over the last three full months 9 + 12 + 9 = 30.000.000, so 10.000.000 a month (this month's 5.000.000
  // isn't counted). Fairly stable with one dependent: 6–9 + 1 = 7–10 months, so 70.000.000 to 100.000.000; the low end is the target.
  // Where it sits: Jago all 20.000.000 + RDPU all 15.000.000 + 5.000.000 of BCA = 40.000.000, 57% (40 ÷ 70 = 0,571), 4 months
  // covered, 30.000.000 to go. At 3.000.000 a month: 30 ÷ 3 = 10 months after this month.
  const reached = shiftMonth(month, 10);

  await s.check("FINNY-19.1 a suggested target from how steady the income is, dependents and spending", async () => {
    await page.goto(base + "/assets"); await page.getByTestId("ef-row").waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="ef-row"]')?.textContent?.includes("Set your target"));
    await page.getByTestId("ef-row").click(); await page.waitForURL(base + "/assets/emergency");
    await page.getByRole("button", { name: "Set your target" }).click();
    ok(await page.getByLabel("Monthly spending").inputValue() === "10.000.000", `3-month average: ${await page.getByLabel("Monthly spending").inputValue()}`);
    await page.getByRole("radiogroup", { name: "People who rely on you" }).getByRole("radio", { name: "1" }).click();
    const low = page.getByRole("radio", { name: /7 months · Rp 70\.000\.000/ }), high = page.getByRole("radio", { name: /10 months · Rp 100\.000\.000/ });
    ok(await low.isVisible() && await high.isVisible(), "7–10 months for fairly stable with one dependent");
    await page.getByRole("radiogroup", { name: "How steady is your income" }).getByRole("radio", { name: "Very stable" }).click();
    ok(await page.getByRole("radio", { name: /4 months · Rp 40\.000\.000/ }).isVisible(), "very stable + 1: 4–7 months");
    await page.getByRole("radiogroup", { name: "How steady is your income" }).getByRole("radio", { name: "Fairly stable" }).click();
    await low.click(); await shot(page, shots, "s9-02-target-375");
    await page.getByRole("button", { name: "Save target" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="ef-target"]')?.textContent?.includes("70.000.000"));
    ok((await text("ef-target")).includes("of Rp 70.000.000 · 7 months"), await text("ef-target"));
    ok((await text("ef-why")).includes("10.000.000") && (await text("ef-why")).includes("Fairly stable · 1 rely on you") && (await text("ef-why")).includes("7–10 months"), await text("ef-why"));
  });

  await s.check("FINNY-19.2 where it sits: whole accounts or a part; cards and loans refused", async () => {
    await page.getByRole("button", { name: "Edit" }).click();
    ok(!(await page.getByRole("checkbox", { name: "Use Kartu Kredit" }).count()), "a card isn't offered");
    await page.getByRole("checkbox", { name: "Use Jago Kantong" }).click();
    await page.getByRole("checkbox", { name: "Use Reksadana Pasar Uang" }).click();
    await page.getByRole("checkbox", { name: "Use BCA" }).click();
    await page.getByRole("radiogroup", { name: "How much of BCA" }).getByRole("radio", { name: "Part" }).click();
    await page.getByLabel("Part of BCA").fill("5.000.000"); await shot(page, shots, "s9-03-where-375");
    await page.getByRole("button", { name: "Save · Rp 40.000.000" }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="ef-set"]')?.textContent?.includes("40.000.000"));
    ok((await text("ef-sources")).includes("Rp 5.000.000 of 30.000.000") && (await text("ef-sources")).includes("all of it"), await text("ef-sources"));
    ok((await json("emergency/sources", { method: "PUT", data: { sources: [{ accountId: A.card.id }] } })).status === 400, "a card as a source");
    ok((await json("emergency/sources", { method: "PUT", data: { sources: [{ accountId: A.jago.id }, { accountId: A.jago.id }] } })).status === 400, "the same account twice");
  });

  await s.check("FINNY-19.3 the fund page: % of target, months covered, still to go", async () => {
    const f = (await json("emergency")).body;
    ok(f.setAsideSen === 40_000_000_00 && f.targetSen === 70_000_000_00 && f.pct === 57 && f.coveredMonths === 4 && f.toGoSen === 30_000_000_00, JSON.stringify({ s: f.setAsideSen, t: f.targetSen, p: f.pct, c: f.coveredMonths, g: f.toGoSen }));
    ok((await page.getByRole("img", { name: "57% of target" }).count()) === 1, "the ring says 57%");
    ok((await text("ef-covered")) === "4 months" && (await text("ef-togo")).includes("Rp 30.000.000"), `${await text("ef-covered")} / ${await text("ef-togo")}`);
    ok((await text("ef-reach")).includes("Plan a monthly amount"), await text("ef-reach"));
    await noSideScroll("Emergency fund");
    await page.goto(base + "/assets"); await page.waitForFunction(() => document.querySelector('[data-testid="ef-row"]')?.textContent?.includes("57%"));
    ok((await text("ef-row")).includes("57% of Rp 70.000.000") && (await text("ef-row")).includes("40.000.000"), await text("ef-row"));
  });

  await s.check("FINNY-19.4 getting there: a monthly amount, the month it's reached, into this month's budget", async () => {
    await page.goto(base + "/assets/emergency"); await page.getByRole("link", { name: "Getting there" }).click(); await page.waitForURL(base + "/assets/emergency/plan");
    await page.getByLabel("Put aside each month").fill("3.000.000"); await page.getByLabel("Put aside each month").blur();
    await page.waitForFunction(() => document.querySelector('[data-testid="ef-plan-months"]')?.textContent === "10");
    ok((await page.getByRole("img", { name: "Your emergency fund growing to its target" }).count()) === 1, "the line to the target");
    await page.waitForFunction(async () => (await (await fetch("/api/emergency")).json()).settings.monthlySen === 300000000);
    ok((await json("emergency")).body.reached === reached, `reached ${(await json("emergency")).body.reached} vs ${reached}`);
    await noSideScroll("Getting there"); await shot(page, shots, "s9-04-plan-375");
    await page.getByRole("button", { name: "Add it to this month's budget" }).click();
    await page.getByRole("status").filter({ hasText: "Dana Darurat" }).waitFor();
    const bud = (await json(`budgets?month=${month}`)).body;
    const cat = (await json("categories")).body; const list = Array.isArray(cat) ? cat : cat.categories;
    const dd = list.find((c) => c.name === "Dana Darurat");
    ok(dd && dd.kind === "saving", "a saving category Dana Darurat");
    ok(bud.lines.find((l) => l.categoryId === dd.id)?.plannedSen === 3_000_000_00, "this month's budget line");
    await page.getByRole("button", { name: "Add it to this month's budget" }).click(); await page.waitForTimeout(500);
    ok((await json("categories")).body && ((a) => (Array.isArray(a) ? a : a.categories).filter((c) => c.name === "Dana Darurat").length === 1)((await json("categories")).body), "added twice, still one category");
    await page.goto(base + "/assets/emergency"); await page.getByTestId("ef-reach").waitFor();
    ok((await text("ef-reach")).includes("At Rp 3.000.000 a month you get there by"), await text("ef-reach"));
    await shot(page, shots, "s9-01-fund-375");
  });

  await s.check("FINNY-19.5 your own target, and the rules are checked", async () => {
    ok((await json("emergency", { method: "PUT", data: { target: "own", ownTarget: "" } })).status === 400, "own target without an amount");
    ok((await json("emergency", { method: "PUT", data: { dependents: 5 } })).status === 400, "5 dependents");
    ok((await json("emergency", { method: "PUT", data: { stability: "maybe" } })).status === 400, "an unknown stability");
    const own = (await json("emergency", { method: "PUT", data: { target: "own", ownTarget: "60.000.000" } })).body;
    ok(own.targetSen === 60_000_000_00 && own.pct === 67 && own.targetMonths === 6, `own: ${own.targetSen} ${own.pct} ${own.targetMonths}`);
    const done = (await json("emergency", { method: "PUT", data: { ownTarget: "40.000.000" } })).body;
    ok(done.toGoSen === 0 && done.pct === 100 && done.reached === month, "reached when set aside meets the target");
    await page.reload(); await page.waitForFunction(() => !document.querySelector('[data-testid="ef-togo"]')?.textContent?.includes("…"));
    ok((await text("ef-togo")).includes("Reached"), await text("ef-togo"));
    await json("emergency", { method: "PUT", data: { target: "low" } });
    const r = await page.request.get(base + "/api/export"); ok(r.status() === 200, "export still works");
  });

  await s.check("desktop and accessibility", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    for (const p of ["/assets/emergency", "/assets/emergency/plan", "/assets"]) { await page.goto(base + p); await page.waitForLoadState("networkidle"); await scan(p); }
    await page.goto(base + "/assets/emergency"); await page.getByTestId("ef-target").waitFor();
    await page.getByRole("button", { name: "Change" }).click(); await page.getByLabel("Monthly spending").waitFor(); await scan("target sheet"); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Edit" }).click(); await page.getByRole("checkbox", { name: "Use BCA" }).waitFor(); await scan("where sheet"); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(base + "/assets/emergency"); await page.getByTestId("ef-sources").waitFor(); await noSideScroll("Desktop"); await shot(page, shots, "s9-05-fund-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
