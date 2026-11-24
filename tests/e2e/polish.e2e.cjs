// The UI/UX audit fixes (FINNY-55), 🐧 Bubbles: re-running the audit's own checks in a browser. Made-up data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

module.exports = async ({ base, shots }) => {
  const s = suite("polish");
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return r.json().catch(() => ({})); };
  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });

  await s.check("9 · a first-time Home shows only a welcome", async () => {
    await page.goto(base + "/"); await page.getByTestId("welcome").waitFor();
    ok(!(await page.getByTestId("net").count()) && !(await page.getByLabel("Search transactions").count()), "tiles or filters on an empty Home");
    await shot(page, shots, "polish-01-welcome-375");
  });
  // A month with names long enough to test the legend, six accounts for the chips.
  const ids = {}; for (const [n, t, o, l] of [["BCA", "bank", 825000000], ["Mandiri", "bank", 210000000], ["Tunai", "cash", 45000000], ["GoPay", "ewallet", 18500000], ["ShopeePay", "ewallet", 5000000], ["CC Mandiri Platinum", "card", -120000000, "36.000.000"]])
    ids[n] = (await json("accounts", { method: "POST", data: { name: n, type: t, openingSen: o, limit: l } })).id;
  await json("categories/starter", { method: "POST" });
  const cats = await json("categories"); const C = (n) => cats.find((c) => c.name === n).id;
  const m = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), ym = m.slice(0, 7);
  for (const [a, c, d, day] of [["412.000", "Belanja Dapur dan Rumah Tangga", "Belanja mingguan", "01"], ["43.890", "Beli Kopi", "Ngopi", "01"], ["350.000", "Biaya Listrik", "Token listrik", "02"]])
    await json("transactions", { method: "POST", data: { kind: "spend", amount: a, accountId: ids.BCA, categoryId: C(c), description: d, on: `${ym}-${day}` } });
  await json("transactions", { method: "POST", data: { kind: "spend", amount: "500.000", accountId: ids.Mandiri, categoryId: C("Dana Darurat"), description: "Nabung", on: `${ym}-01` } });

  const axeContrast = async (pg) => (await new AxeBuilder({ page: pg }).withTags(["wcag2aa"]).analyze()).violations.filter((v) => v.id === "color-contrast").reduce((n, v) => n + v.nodes.length, 0);
  await s.check("1 · no contrast failures on Home, quick add, Accounts, Categories, Settings, Import (light)", async () => {
    let total = 0;
    for (const p of ["/", "/accounts", "/categories", "/settings", "/import"]) { await page.goto(base + p); await page.waitForTimeout(700); total += await axeContrast(page); }
    await page.goto(base + "/"); await page.getByRole("button", { name: "Add a transaction" }).first().click(); await page.waitForTimeout(400); total += await axeContrast(page);
    ok(total === 0, `${total} contrast failures`); await page.getByRole("button", { name: "Close", exact: true }).click();
  });
  await s.check("1 · no contrast failures in dark mode", async () => {
    const dk = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: "dark" }); await dk.addCookies(await ctx.cookies()); const d = await dk.newPage();
    let total = 0; for (const p of ["/", "/accounts", "/categories"]) { await d.goto(base + p); await d.waitForTimeout(700); total += await axeContrast(d); }
    ok(total === 0, `${total} contrast failures`); await d.goto(base + "/"); await d.getByTestId("by-category").waitFor(); await shot(d, shots, "polish-02-home-dark-375");
  });
  await s.check("2 · tapping anywhere on the day chart picks that day and shows its total", async () => {
    await page.goto(base + "/"); const chart = page.getByTestId("day-chart"); await chart.waitFor();
    const box = await chart.boundingBox(); const days = +(await page.locator(".fy-bars-axis span").last().innerText());
    await page.mouse.click(box.x + box.width * (1.5 / days), box.y + box.height - 4); // day 2, at the bottom of the chart
    ok((await page.locator(".fy-bars-pick").innerText()).includes("Rp 350.000"), await page.locator(".fy-bars-pick").innerText());
    ok((await page.getByTestId("txn-list").innerText()).includes("Token listrik") && !(await page.getByTestId("txn-list").innerText()).includes("Ngopi"), "list not filtered");
    await page.getByRole("button", { name: "Show all days" }).click();
  });
  await s.check("4 · the legend shows whole names and amounts", async () => {
    const t = await page.getByTestId("by-category").innerText(); ok(t.includes("Kebutuhan Rumah Tangga") && t.includes("Rp 762 rb"), t);
    const clipped = await page.evaluate(() => [...document.querySelectorAll(".fy-legend .r span")].some((e) => e.scrollWidth > e.clientWidth + 1)); ok(!clipped, "a name is cut off");
  });
  await s.check("10 · saved sits on one quiet line under income and spent", async () => {
    ok(await page.locator(".fy-hero .extra").innerText().then((t) => t.includes("Saved") && t.includes("Rp 500.000")), "no saved line");
    ok(await page.locator(".fy-hero .stats .fy-stat").count() === 2, "stats not 2");
    await shot(page, shots, "polish-03-home-375");
  });
  await s.check("6 · the tab bar is solid", async () => {
    const bg = await page.locator(".fy-tabbar").evaluate((e) => getComputedStyle(e).backgroundColor); ok(/^rgb\(/.test(bg), `tab bar background ${bg}`);
  });
  await s.check("5 · 7 · quick add: every account chip on screen; Rp next to the amount", async () => {
    await page.getByRole("button", { name: "Add a transaction" }).first().click(); const f = page.getByRole("dialog");
    await f.getByLabel("Amount").fill("43.890");
    const chips = await f.getByRole("radiogroup", { name: "Account", exact: true }).getByRole("radio").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
    ok(chips.length === 6 && chips.every((r) => r <= 390), `chips off screen: ${chips.map(Math.round)}`);
    const rp = await f.locator(".fy-amount small").boundingBox(), amt = await f.getByLabel("Amount").boundingBox();
    ok(amt.x - (rp.x + rp.width) < 12, `gap between Rp and the amount: ${Math.round(amt.x - rp.x - rp.width)} px`);
    await shot(page, shots, "polish-04-add-375"); await f.getByRole("button", { name: "Close", exact: true }).click();
  });
  await s.check("8 · buttons at least 44 px, chips and tabs at least 40 px", async () => {
    const small = [];
    for (const p of ["/", "/accounts", "/categories", "/settings"]) {
      await page.goto(base + p); await page.waitForTimeout(500);
      small.push(...await page.evaluate((p) => [...document.querySelectorAll(".fy-btn, .fy-month button, .fy-chip, .fy-seg button, .fy-tabbar a, .fy-tabbar button")]
        .filter((e) => { const r = e.getBoundingClientRect(); const min = e.matches(".fy-chip, .fy-seg button") ? 40 : 44; return r.height && r.height < min - 0.5; })
        .map((e) => `${p} ${(e.getAttribute("aria-label") || e.textContent).trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().height)}px`), p));
    }
    ok(!small.length, small.join("; "));
  });
  await s.check("11 · categories: tap the row to edit; no Edit buttons", async () => {
    await page.goto(base + "/categories"); await page.getByTestId("cat-Beli Kopi").waitFor();
    ok(!(await page.getByRole("button", { name: "Edit", exact: true }).count()), "Edit buttons still there");
    await page.getByRole("button", { name: "Change Beli Kopi" }).click(); ok(await page.getByRole("dialog").isVisible(), "row doesn't open"); await page.getByRole("button", { name: "Close", exact: true }).click();
    await shot(page, shots, "polish-05-categories-375");
  });
  await s.check("12 · cards read 'Rp 34,8 jt left of 36 jt' and 'owed'", async () => {
    await page.goto(base + "/accounts"); const t = await page.getByTestId("account-CC Mandiri Platinum").innerText();
    ok(t.includes("Rp 34,8 jt left of 36 jt") && t.includes("owed"), t); await shot(page, shots, "polish-06-accounts-375");
  });
  await s.check("14 · dates read 23 Nov 2026 in the account form", async () => {
    await page.getByRole("button", { name: "Edit BCA" }).click(); const t = await page.getByRole("dialog").locator(".fy-datefield").innerText();
    ok(/^\d{1,2} [A-Z][a-z]{2} \d{4}/.test(t), t); await page.getByRole("button", { name: "Close", exact: true }).click();
  });
  await s.check("13 · Settings has one Sign out", async () => {
    await page.goto(base + "/settings"); ok(await page.getByText("Sign out", { exact: true }).count() === 1, "Sign out shown twice"); await shot(page, shots, "polish-07-settings-375");
  });
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } }); // leave an empty Finny for the suites after this one
  await b.close(); s.done();
};
