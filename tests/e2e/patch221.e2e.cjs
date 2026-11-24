// v0.22.1 QA, 🐧 Bubbles: jump to any month (FINNY-206) on Home, Budget and Reports, on a production build, as a phone
// (390 × 844) and a laptop. Made-up records in three months: today's month, 14 months back and 26 months back.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

module.exports = async ({ base, shots }) => {
  const s = suite("patch221");
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const j = async (method, u, data) => { const r = await page.request.fetch(`${base}/api/${u}`, { method, data, headers: { "content-type": "application/json" } }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const axe = async (p) => (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const shift = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const N = today.slice(0, 7), A = shift(N, -14), B = shift(N, -26);
  const label = (m) => `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await j("DELETE", "me/data", { confirm: "DELETE" });
  const bca = (await j("POST", "accounts", { name: "BCA", type: "bank", opening: "5.000.000", openingOn: "2023-01-01" })).body;
  const kopi = (await j("POST", "categories", { name: "Beli Kopi", kind: "expense" })).body;
  for (const [m, d] of [[N, "Kopi hari ini"], [A, "Kopi tahun lalu"], [B, "Kopi dua tahun lalu"]])
    await j("POST", "transactions", { kind: "spend", amount: "45.000", accountId: bca.id, categoryId: kopi.id, description: d, on: `${m}-${m === N ? today.slice(8) : "10"}` });

  await s.check("FINNY-206.1 Home: the month name opens \"Pick a month\"; two taps to 14 months back", async () => {
    await page.goto(base + "/"); await page.getByTestId("month").waitFor();
    ok((await page.getByTestId("month").innerText()) === label(N), await page.getByTestId("month").innerText());
    await page.getByRole("button", { name: `${label(N)}, pick a month` }).click();
    const d = page.getByRole("dialog", { name: "Pick a month" }); await d.waitFor();
    await page.waitForTimeout(400); await page.screenshot({ path: require("node:path").join(shots, "p221-01-picker.png") });
    if (A.slice(0, 4) !== N.slice(0, 4)) await d.getByRole("button", { name: "Previous year" }).click();
    await d.getByRole("button", { name: new RegExp(`^${label(A)}`) }).click(); await d.waitFor({ state: "detached" });
    ok((await page.getByTestId("month").innerText()) === label(A), await page.getByTestId("month").innerText());
    await page.getByText("Kopi tahun lalu").first().waitFor();
  });

  await s.check("FINNY-206.2 the month shown is pressed, months with transactions say so, later months can't be picked, the years stop where the data does", async () => {
    await page.getByRole("button", { name: `${label(A)}, pick a month` }).click();
    const d = page.getByRole("dialog", { name: "Pick a month" }); await d.waitFor();
    ok(await d.getByRole("button", { name: `${label(A)}, has transactions` }).getAttribute("aria-pressed") === "true", "pressed + has transactions");
    const other = A.slice(5) === "01" ? shift(A, 1) : shift(A, -1);
    if (other.slice(0, 4) === A.slice(0, 4)) ok(await d.getByRole("button", { name: label(other), exact: true }).isEnabled(), "an empty month is still pickable");
    while (await d.getByRole("button", { name: "Next year" }).isEnabled()) await d.getByRole("button", { name: "Next year" }).click();
    ok((await d.locator(".fy-mp-year b").innerText()) === N.slice(0, 4), "stops at this year");
    if (N.slice(5) !== "12") ok(await d.getByRole("button", { name: new RegExp(`^${label(shift(N, 1))}`) }).isDisabled(), "next month greyed out");
    while (await d.getByRole("button", { name: "Previous year" }).isEnabled()) await d.getByRole("button", { name: "Previous year" }).click();
    ok((await d.locator(".fy-mp-year b").innerText()) === B.slice(0, 4), `stops at the first year with data, got ${await d.locator(".fy-mp-year b").innerText()}`);
    ok(await d.getByRole("button", { name: `${label(B)}, has transactions` }).isVisible(), "dot on the oldest month");
    const v = await axe(page); ok(!v.length, v.join(" | "));
    await d.getByRole("button", { name: "This month" }).click(); await d.waitFor({ state: "detached" });
    ok((await page.getByTestId("month").innerText()) === label(N), "This month");
  });

  await s.check("FINNY-206.3 ‹ › still step one month; the keyboard: focus goes into the sheet, Escape closes it and returns to the title", async () => {
    await page.getByRole("button", { name: "Previous month" }).click(); ok((await page.getByTestId("month").innerText()) === label(shift(N, -1)), "‹");
    await page.getByRole("button", { name: "Next month" }).click(); ok((await page.getByTestId("month").innerText()) === label(N), "›");
    const title = page.getByRole("button", { name: `${label(N)}, pick a month` });
    await title.focus(); await page.keyboard.press("Enter");
    const d = page.getByRole("dialog", { name: "Pick a month" }); await d.waitFor();
    await page.waitForFunction(() => !!document.activeElement?.closest('[role="dialog"]'), null, { timeout: 3000 }).catch(() => {});
    ok(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')), "focus inside the sheet");
    await page.keyboard.press("Escape"); await d.waitFor({ state: "detached" });
    ok(await title.evaluate((e) => e === document.activeElement), "focus back on the title");
  });

  await s.check("FINNY-206.1 Budget and Reports: the pill shows the month with ▾ and opens the same sheet", async () => {
    for (const path of ["/budget", "/reports"]) {
      await page.goto(base + path); const pill = page.getByRole("button", { name: `${label(N)}, pick a month` }); await pill.waitFor();
      ok((await pill.innerText()).trim() === `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][Number(N.slice(5)) - 1]} ${N.slice(0, 4)}`, await pill.innerText());
      await pill.click(); const d = page.getByRole("dialog", { name: "Pick a month" }); await d.waitFor();
      if (A.slice(0, 4) !== N.slice(0, 4)) await d.getByRole("button", { name: "Previous year" }).click();
      await d.getByRole("button", { name: new RegExp(`^${label(A)}`) }).click(); await d.waitFor({ state: "detached" });
      await page.getByRole("button", { name: `${label(A)}, pick a month` }).waitFor();
      if (path === "/budget") ok((await page.getByTestId("budget-sub").innerText()).startsWith(label(A)), await page.getByTestId("budget-sub").innerText());
      else ok((await page.locator(".fy-large .sub").first().innerText()).includes(label(A)), await page.locator(".fy-large .sub").first().innerText());
      await shot(page, shots, `p221-02${path.replace("/", "-")}`);
    }
  });

  await s.check("laptop: the title and the picker at 1280 px; nothing sideways at 360 px", async () => {
    const lc = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }); await lc.addCookies(await ctx.cookies());
    const l = await lc.newPage(); await l.goto(base + "/"); await l.getByTestId("month").waitFor();
    await l.getByRole("button", { name: `${label(N)}, pick a month` }).click(); await l.getByRole("dialog", { name: "Pick a month" }).waitFor();
    await l.waitForTimeout(400); await l.screenshot({ path: require("node:path").join(shots, "p221-03-laptop.png") });
    let v = await axe(l); ok(!v.length, v.join(" | ")); await lc.close();
    const dc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" }); await dc.addCookies(await ctx.cookies());
    const dk = await dc.newPage(); await dk.goto(base + "/"); await dk.getByTestId("month").waitFor();
    await dk.getByRole("button", { name: `${label(N)}, pick a month` }).click(); await dk.getByRole("dialog", { name: "Pick a month" }).waitFor();
    await dk.waitForTimeout(400); await dk.screenshot({ path: require("node:path").join(shots, "p221-04-dark.png") });
    v = await axe(dk); ok(!v.length, "dark: " + v.join(" | ")); await dc.close();
    await page.setViewportSize({ width: 360, height: 740 }); await page.goto(base + "/"); await page.getByTestId("month").waitFor();
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= 360), "no sideways scroll at 360");
    // ‹ › stay beside the title on a phone, even for the longest month name
    for (const w of [360, 390, 430]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.evaluate(() => { const s = document.querySelector('[data-testid="month"]'); s.textContent = "September 2026"; });
      const t = await page.locator(".fy-month-title").boundingBox(), n = await page.locator(".fy-large .fy-month").first().boundingBox();
      if (process.env.QA_DEBUG) console.log("    ", w, JSON.stringify(await page.evaluate(() => { const L = document.querySelector(".fy-large"); const h = L.querySelector("h1"); return { large: L.getBoundingClientRect().width, kids: [...L.children].map((c) => Math.round(c.getBoundingClientRect().width)), h1font: getComputedStyle(h).fontSize, title: Math.round(h.getBoundingClientRect().width) }; })));
      ok(Math.abs((t.y + t.height / 2) - (n.y + n.height / 2)) < 16, `at ${w} px the ‹ › sit beside the title (title y ${Math.round(t.y)}, buttons y ${Math.round(n.y)})`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await j("DELETE", "me/data", { confirm: "DELETE" });
  await b.close();
  s.done();
};
