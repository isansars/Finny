// v0.19.1 QA, 🐧 Bubbles: Finny edge to edge on an iPhone home screen (FINNY-190). The owner saw a dark strip behind
// the clock and a small tab bar. Checked on a production build as an iPhone 390×844 with the notch and home bar emulated
// (DevTools safe-area insets: 59 px top, 34 px bottom), in dark and light, plus a phone without a notch and a laptop.
// Made-up data only.
const { suite, ok, browser, shot } = require("./helpers.cjs");

const INSETS = { top: 59, bottom: 34, left: 0, right: 0 };

module.exports = async ({ base, shots }) => {
  const s = suite("patch191");
  const b = await browser();
  const phone = async (scheme, insets = INSETS) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
    const p = await ctx.newPage(); p.on("dialog", (d) => d.accept());
    const cdp = await ctx.newCDPSession(p);
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
    return p;
  };
  const errors = [];
  const p = await phone("dark"); p.on("pageerror", (e) => errors.push(`${p.url()} ${e.message}`));
  const j = async (m, u, d) => { const r = await p.request.fetch(base + "/api/" + u, { method: m, data: d, headers: { "content-type": "application/json" } }); return r.json().catch(() => ({})); };
  const go = async (pg, path_) => { await pg.goto(base + path_); await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(300); };
  await p.goto(base + "/login"); await p.getByLabel("Email").fill("owner@finny.test"); await p.getByRole("button", { name: "Dev sign-in" }).click(); await p.waitForURL(base + "/");
  await j("DELETE", "me/data", { confirm: "DELETE" });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const acc = await j("POST", "accounts", { name: "BCA", type: "bank", opening: "12.000.000", openingOn: "2025-01-01" });
  await j("POST", "categories/starter", {});
  const cats = await j("GET", "categories"); const list = Array.isArray(cats) ? cats : cats.categories; const spend = list.find((c) => c.kind === "expense").id;
  for (let i = 1; i <= 14; i++) await j("POST", "transactions", { kind: "spend", amount: String(20000 + i * 1500), accountId: acc.id, categoryId: spend, description: `Kopi ${i}`, on: today });
  const box = (pg, sel) => pg.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; });

  await s.check("the page may draw under the clock: viewport-fit=cover and a translucent status bar on the home screen", async () => {
    const vp = await p.locator('meta[name="viewport"]').getAttribute("content");
    const bar = await p.locator('meta[name="apple-mobile-web-app-status-bar-style"]').getAttribute("content");
    ok(/viewport-fit=cover/.test(vp), `viewport ${vp}`); ok(bar === "black-translucent", `status bar style ${bar}`);
  });

  await go(p, "/");
  await s.check("Home starts just below the clock: no empty strip, nothing under it", async () => {
    const strip = await box(p, ".fy-statusbar"); ok(strip.top === 0 && strip.height === 59, `strip ${JSON.stringify(strip)}`);
    const padTop = await p.locator("#main").evaluate((e) => parseFloat(getComputedStyle(e).paddingTop)); ok(padTop === 67, `main padding-top ${padTop}`);
    const first = await p.locator("#main h1, #main h2").first().evaluate((e) => e.getBoundingClientRect().top);
    ok(first >= 59 && first <= 120, `first heading at ${first}px`);
    const bg = await p.locator(".fy-statusbar").evaluate((e) => getComputedStyle(e).backgroundImage); ok(/gradient/.test(bg), `strip ${bg}`);
  });
  await shot(p, shots, "patch191-home-dark");
  await p.screenshot({ path: require("node:path").join(shots, "patch191-home-dark-screen.png") });

  await s.check("the tab bar is thumb-sized: 58 px items, 26 px icons, 13 px labels, 54 px Add", async () => {
    const items = await p.locator(".fy-tabbar a, .fy-tabbar button").evaluateAll((es) => es.map((e) => ({ h: e.getBoundingClientRect().height, f: getComputedStyle(e).fontSize, svg: e.querySelector("svg")?.getAttribute("width") })));
    ok(items.length === 5, `${items.length} items`);
    for (const it of items) ok(it.h >= 58, `item ${it.h}px`);
    for (const it of items.filter((x) => x.f !== "13px")) throw new Error(`label ${it.f}`);
    ok(items.filter((x) => x.svg === "26").length === 4, `icons ${items.map((x) => x.svg)}`);
    const add = await box(p, ".fy-tabbar .add span"); ok(add.height === 54, `add ${add.height}`);
  });

  await s.check("the tab bar clears the home bar: its buttons end 34 px + 8 px above the bottom", async () => {
    const bar = await box(p, ".fy-tabbar"); ok(Math.round(bar.bottom) === 844, `bar bottom ${bar.bottom}`);
    const last = await box(p, ".fy-tabbar a:last-child"); ok(last.bottom <= 844 - 34 - 8 + 0.5, `items end at ${last.bottom}`);
  });

  await s.check("the end of Home isn't hidden behind the tab bar", async () => {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(200);
    const bar = await box(p, ".fy-tabbar");
    const end = await p.locator("#main").evaluate((m) => { let x = m.lastElementChild; while (x && !x.getClientRects().length) x = x.previousElementSibling; return x.getBoundingClientRect().bottom; });
    ok(end <= bar.top, `content ends ${end}, bar starts ${bar.top}`);
  });

  await s.check("a sheet opened from the tab bar stays below the clock", async () => {
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator(".fy-tabbar .add").click(); await p.waitForTimeout(400);
    const sheet = await box(p, ".fy-sheet"); ok(sheet.top >= 59, `sheet top ${sheet.top}`);
    await shot(p, shots, "patch191-add-sheet");
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  });

  await s.check("Transactions: the picked-rows bar sits above the taller tab bar", async () => {
    await go(p, "/transactions");
    const top = await p.locator("#main h1").first().evaluate((e) => e.getBoundingClientRect().top); ok(top >= 59, `title at ${top}`);
    await p.getByRole("button", { name: "Select", exact: true }).click();
    await p.locator('[data-testid="tx-row"]').first().click(); await p.locator('[data-testid="tx-row"]').nth(1).click();
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    const bulk = await box(p, '[data-testid="bulk"]'), bar = await box(p, ".fy-tabbar");
    ok(bulk.bottom <= bar.top, `bulk ends ${bulk.bottom}, bar starts ${bar.top}`);
    await p.screenshot({ path: require("node:path").join(shots, "patch191-transactions-select.png") });
  });

  await s.check("light mode: the strip behind the clock is Finny pink, so the white clock stays readable", async () => {
    const l = await phone("light"); await l.context().addCookies(await p.context().cookies());
    await go(l, "/");
    const bg = await l.locator(".fy-statusbar").evaluate((e) => getComputedStyle(e).backgroundImage); ok(/gradient/.test(bg), `strip ${bg}`);
    await l.screenshot({ path: require("node:path").join(shots, "patch191-home-light-screen.png") });
    await l.context().close();
  });

  await s.check("a phone without a notch (Android, Safari tab): no strip, the page starts 8 px down as before", async () => {
    const a = await phone("dark", { top: 0, bottom: 0, left: 0, right: 0 }); await a.context().addCookies(await p.context().cookies());
    await go(a, "/");
    const h = await a.locator(".fy-statusbar").evaluate((e) => e.getBoundingClientRect().height); ok(h === 0, `strip ${h}`);
    const padTop = await a.locator("#main").evaluate((e) => parseFloat(getComputedStyle(e).paddingTop)); ok(padTop === 8, `padding-top ${padTop}`);
    const last = await a.locator(".fy-tabbar a:last-child").evaluate((e) => e.getBoundingClientRect().bottom); ok(last <= 844 - 8 + 0.5, `items end ${last}`);
    await a.context().close();
  });

  await s.check("a laptop is unchanged: top bar, no tab bar, no strip", async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }); await ctx.addCookies(await p.context().cookies());
    const w = await ctx.newPage(); await go(w, "/");
    ok(await w.locator(".fy-topbar").isVisible(), "top bar"); ok(!(await w.locator(".fy-tabbar").isVisible()), "tab bar shown");
    const h = await w.locator(".fy-statusbar").evaluate((e) => e.getBoundingClientRect().height); ok(h === 0, `strip ${h}`);
    await ctx.close();
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await j("DELETE", "me/data", { confirm: "DELETE" });
  await b.close();
  s.done();
};
