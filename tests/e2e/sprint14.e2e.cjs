// Sprint 14 (v0.14.0) QA, 🐧 Bubbles: recurring transactions (FINNY-138), end to end in a browser, on made-up accounts
// and three months of made-up history. Days are worked by hand in tests/unit/recurring-rule.test.mts. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const sm = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };

module.exports = async ({ base, shots }) => {
  const s = suite("sprint14");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), N = today.slice(0, 7);
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const noSideScroll = async (l) => { const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((e) => `${e.tagName}.${e.className?.baseVal ?? e.className}`)); ok(!wide.length, `${l} scrolls sideways: ${wide.join(" ")}`); };
  const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");
  const waitText = (id, t) => page.waitForFunction(([i, x]) => document.querySelector(`[data-testid="${i}"]`)?.textContent?.includes(x), [id, t]);
  const txns = async () => (await json("transactions?limit=500")).body.items;

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  const A = {}, C = {};
  A.bca = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "30.000.000", openingOn: "2025-01-01" } })).body;
  A.mandiri = (await json("accounts", { method: "POST", data: { name: "Mandiri", type: "bank", opening: "0", openingOn: "2025-01-01" } })).body;
  A.cc = (await json("accounts", { method: "POST", data: { name: "CC Mandiri", type: "card", opening: "0", openingOn: "2025-01-01", limit: "20.000.000" } })).body;
  for (const [k, n, kind] of [["gaji", "Gaji", "income"], ["nonton", "Nonton Film", "expense"], ["sewa", "Sewa Rumah", "expense"], ["listrik", "Biaya Listrik", "expense"], ["olahraga", "Olahraga", "expense"]])
    C[k] = (await json("categories", { method: "POST", data: { name: n, kind } })).body;
  // History: Netflix 54.900 on the card around the 2nd, and Gaji 15.000.000 into BCA on the 1st, in each of the last three months.
  for (let i = 3; i >= 1; i--) {
    const m = sm(N, -i);
    await json("transactions", { method: "POST", data: { kind: "spend", amount: "54.900", accountId: A.cc.id, categoryId: C.nonton.id, description: "Netflix", on: `${m}-0${i === 2 ? 3 : 2}` } });
    await json("transactions", { method: "POST", data: { kind: "income", amount: "15.000.000", accountId: A.bca.id, categoryId: C.gaji.id, description: "Gaji", on: `${m}-01` } });
  }
  const R = async (data) => (await json("recurring", { method: "POST", data })).body;

  await s.check("FINNY-138.6 suggestions from the history: Make recurring fills the sheet", async () => {
    await page.goto(base + "/settings"); await page.getByRole("link", { name: "Recurring" }).click(); await page.waitForURL(base + "/settings/recurring");
    await page.getByTestId("rc-suggestions").waitFor();
    const sg = await text("rc-suggestions");
    ok(/Netflix −54\.900 around the 2nd · 3 months · CC Mandiri/.test(sg) && /Gaji \+15\.000\.000 around the 1st · 3 months · BCA/.test(sg), sg);
    await noSideScroll("Recurring"); await shot(page, shots, "s14-04-suggestions-375");
    await page.getByRole("button", { name: "Make Netflix recurring" }).click();
    ok(await page.getByLabel("Name").inputValue() === "Netflix" && await page.getByLabel("Amount (Rp)").inputValue() === "54.900", "filled in");
    ok(await page.getByLabel("First day").inputValue() === `${N}-02`, await page.getByLabel("First day").inputValue());
    await page.waitForTimeout(400); await page.screenshot({ path: require("node:path").join(shots, "s14-03-sheet-375.png") }); // the phone screen, once the sheet has slid in
    await page.getByRole("button", { name: /^Save/ }).click();
    await page.getByTestId("rc-spend").waitFor();
    ok(/Netflix every month on the 2nd · CC Mandiri −54\.900/.test(await text("rc-spend")), await text("rc-spend"));
    ok(!(await text("rc-suggestions")).includes("Netflix"), "a recurring item isn't suggested again");
    await page.getByRole("button", { name: "Not recurring: Gaji" }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="rc-suggestions"]'));
    await page.reload(); await page.getByTestId("rc-spend").waitFor();
    ok(!(await page.getByTestId("rc-suggestions").count()), "a dismissed suggestion stays gone");
  });

  // Items due today, one with a changing amount, one to skip, one to add twice, and a transfer in three days.
  const sewa = await R({ name: "Sewa kos", kind: "spend", amount: "2.500.000", accountId: A.bca.id, categoryId: C.sewa.id, every: "month", anchorOn: today });
  const token = await R({ name: "Token listrik", kind: "spend", amount: null, accountId: A.bca.id, categoryId: C.listrik.id, every: "month", anchorOn: today });
  const gym = await R({ name: "Gym", kind: "spend", amount: "300.000", accountId: A.bca.id, categoryId: C.olahraga.id, every: "week", anchorOn: today });
  const dd = await R({ name: "Dana Darurat", kind: "transfer", amount: "2.000.000", accountId: A.bca.id, toAccountId: A.mandiri.id, every: "month", anchorOn: addDays(today, 3) });

  await s.check("FINNY-138.2/3 Home: due today with Add and Skip; a changing amount asks; coming up", async () => {
    await page.goto(base + "/"); await page.getByTestId("rc-due").waitFor();
    ok((await text("rc-due")).includes("Due today · 3"), await text("rc-due"));
    // The card can draw before the account list has loaded (no account name for a moment): wait for the name.
    await waitText("rc-due-Sewa kos", "BCA");
    ok(/Sewa kos BCA −2\.500\.000/.test(await text("rc-due-Sewa kos")), await text("rc-due-Sewa kos"));
    ok(await page.getByRole("button", { name: "Add Token listrik" }).isDisabled(), "a changing amount needs the amount first");
    await waitText("rc-coming", "Mandiri");
    ok(/Dana Darurat .*BCA → Mandiri 2\.000\.000/.test(await text("rc-coming")), await text("rc-coming"));
    await noSideScroll("Home"); await page.screenshot({ path: require("node:path").join(shots, "s14-01-home-375.png") });
    await page.getByRole("button", { name: "Add Sewa kos" }).click(); await page.waitForFunction(() => !document.querySelector('[data-testid="rc-due-Sewa kos"]'));
    await page.getByLabel("Amount for Token listrik").fill("612.500"); await page.getByRole("button", { name: "Add Token listrik" }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="rc-due-Token listrik"]'));
    await page.getByRole("button", { name: "Skip Gym" }).click(); await page.waitForFunction(() => !document.querySelector('[data-testid="rc-due"]'));
    const t = await txns();
    const s1 = t.find((x) => x.description === "Sewa kos"), t1 = t.find((x) => x.description === "Token listrik");
    ok(s1 && s1.on === today && s1.amountSen === 250_000_000 && s1.accountId === A.bca.id && s1.categoryId === C.sewa.id, JSON.stringify(s1));
    ok(t1 && t1.amountSen === 61_250_000, "the amount typed");
    ok(!t.some((x) => x.description === "Gym"), "a skipped day adds nothing");
    ok((await json("recurring/due")).body.due.length === 0, "nothing due now");
  });

  await s.check("FINNY-138.3 a day is added once only, even from two tabs at once", async () => {
    ok((await json(`recurring/${sewa.id}/add`, { method: "POST", data: { dueOn: today } })).status === 409, "already added");
    ok((await json(`recurring/${gym.id}/skip`, { method: "POST", data: { dueOn: today } })).status === 409, "already skipped");
    const parkir = await R({ name: "Parkir bulanan", kind: "spend", amount: "150.000", accountId: A.bca.id, categoryId: C.olahraga.id, every: "month", anchorOn: today });
    const other = await ctx.newPage();
    const [a, b2] = await Promise.all([page.request.post(`${base}/api/recurring/${parkir.id}/add`, { data: { dueOn: today } }), other.request.post(`${base}/api/recurring/${parkir.id}/add`, { data: { dueOn: today } })]);
    ok([a.status(), b2.status()].sort().join() === "200,409", `${a.status()} ${b2.status()}`);
    ok((await txns()).filter((x) => x.description === "Parkir bulanan").length === 1, "one transaction");
    await other.close();
    ok((await json(`recurring/${token.id}/add`, { method: "POST", data: { dueOn: addDays(today, 1) } })).status === 409, "a day that isn't due");
    const noAmount = await R({ name: "Air PAM", kind: "spend", amount: null, accountId: A.bca.id, categoryId: C.listrik.id, every: "month", anchorOn: today });
    ok((await json(`recurring/${noAmount.id}/add`, { method: "POST", data: { dueOn: today } })).status === 400, "no amount for a changing one");
    ok((await json("recurring/due")).body.due.some((x) => x.name === "Air PAM"), "still due after the refusal");
    await json(`recurring/${noAmount.id}`, { method: "DELETE" });
  });

  await s.check("FINNY-138.4 Settings › Recurring: groups, next dates, a month in and out", async () => {
    await page.goto(base + "/settings/recurring"); await page.getByTestId("rc-month").waitFor();
    // By hand, out a month: Netflix 54.900 + Sewa kos 2.500.000 + Token listrik (its last amount) 612.500 + Gym weekly
    // 300.000 × 52 ÷ 12 = 1.300.000 + Parkir 150.000 = 4.617.400; the transfer counts neither way; nothing in.
    ok((await text("rc-month")).includes("+0") && (await text("rc-month")).includes("−4.617.400"), await text("rc-month"));
    const sp = await text("rc-spend");
    ok(sp.includes("Token listrik") && sp.includes("about −612.500") && /Gym every \w+day · BCA −300\.000/.test(sp), sp);
    ok(/Dana Darurat every month on the \d+\w\w · BCA → Mandiri 2\.000\.000/.test(await text("rc-transfer")), await text("rc-transfer"));
    await noSideScroll("Recurring list"); await shot(page, shots, "s14-02-recurring-375");
    await page.getByRole("button", { name: "Change Netflix" }).click(); await page.getByLabel("Amount (Rp)").fill("59.900");
    await page.getByRole("button", { name: /^Save/ }).click(); await waitText("rc-spend", "−59.900");
    await page.getByRole("button", { name: "Change Gym" }).click(); await page.getByRole("button", { name: "Delete recurring" }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="rc-spend"]')?.textContent?.includes("Gym"));
  });

  await s.check("FINNY-138.5 Make it recurring from a transaction's edit sheet", async () => {
    const t = (await txns()).find((x) => x.description === "Sewa kos");
    await page.goto(base + "/"); await page.getByText("Sewa kos").last().click();
    const link = page.getByTestId("make-recurring"); await link.waitFor();
    const href = await link.getAttribute("href");
    ok(href.includes("new=1") && href.includes("name=Sewa+kos") && href.includes(`amount=${t.amountSen}`), href);
    await link.click(); await page.waitForURL(/\/settings\/recurring/);
    ok(await page.getByLabel("Name").inputValue() === "Sewa kos" && await page.getByLabel("Amount (Rp)").inputValue() === "2.500.000", "filled in");
    await page.keyboard.press("Escape");
  });

  await s.check("the rules are checked; export has the items", async () => {
    const bad = async (data, label) => ok((await json("recurring", { method: "POST", data })).status === 400, label);
    // Like a transaction, a transfer sent with a category is saved without it (the database refuses one that has it).
    const tr = (await json("recurring", { method: "POST", data: { name: "Ke Mandiri", kind: "transfer", amount: "1", accountId: A.bca.id, toAccountId: A.mandiri.id, categoryId: C.sewa.id, every: "month", anchorOn: today } })).body;
    ok(tr.id && tr.categoryId === null, `a transfer kept a category: ${JSON.stringify(tr)}`); await json(`recurring/${tr.id}`, { method: "DELETE" });
    await bad({ name: "x", kind: "transfer", amount: "1", accountId: A.bca.id, toAccountId: A.bca.id, every: "month", anchorOn: today }, "a transfer to the same account");
    await bad({ name: "", kind: "spend", amount: "1", accountId: A.bca.id, categoryId: C.sewa.id, every: "month", anchorOn: today }, "no name");
    await bad({ name: "x", kind: "spend", amount: "1", accountId: A.bca.id, categoryId: C.sewa.id, every: "day", anchorOn: today }, "daily");
    await bad({ name: "x", kind: "spend", amount: "1", accountId: A.bca.id, categoryId: C.sewa.id, every: "month", anchorOn: today, endOn: addDays(today, -1) }, "an end before the start");
    await bad({ name: "x", kind: "income", amount: "1", accountId: A.bca.id, categoryId: C.sewa.id, every: "month", anchorOn: today }, "income into a spending category");
    ok((await json("recurring/00000000-0000-0000-0000-000000000000", { method: "PATCH", data: { name: "x" } })).status === 404, "unknown");
    await json(`recurring/${dd.id}`, { method: "DELETE" });
    ok((await txns()).some((x) => x.description === "Sewa kos"), "deleting an item keeps its transactions");
    const r = await page.request.get(base + "/api/export"); ok((await r.body()).toString("latin1").includes("recurring.csv"), "export");
  });

  await s.check("desktop and accessibility", async () => {
    await R({ name: "Kopi langganan", kind: "spend", amount: "45.000", accountId: A.bca.id, categoryId: C.nonton.id, every: "month", anchorOn: today });
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    await page.goto(base + "/"); await page.getByTestId("rc-due").waitFor(); await scan("home with due");
    await page.goto(base + "/settings/recurring"); await page.waitForLoadState("networkidle"); await scan("recurring");
    await page.getByRole("button", { name: "Add recurring" }).click(); await page.getByLabel("Name").waitFor(); await scan("sheet"); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(base + "/settings/recurring"); await page.waitForLoadState("networkidle"); await noSideScroll("Desktop");
    ok((await page.evaluate(() => document.querySelector(".fy-narrow")?.getBoundingClientRect().width ?? 9999)) <= 720, "720 px");
    await shot(page, shots, "s14-05-recurring-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
