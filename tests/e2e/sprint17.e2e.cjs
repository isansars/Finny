// Sprint 17 (v0.17.0) QA, 🐧 Bubbles: Finny on the web (FINNY-160). Every finding of "Finny · Web audit (v0.16.0)"
// checked directly on a production build at laptop sizes (1440 × 900, 1440 × 768, 1024 × 768) and on a phone where it
// applies. Made-up accounts and amounts only.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");
const path = require("node:path");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint17");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), N = today.slice(0, 7);
  const sm = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const M = sm(N, -1);
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
  const j = async (method, u, data) => { const r = await page.request.fetch(`${base}/api/${u}`, { method, data, headers: { "content-type": "application/json" } }); return r.json().catch(() => ({})); };
  const go = async (p, pg = page) => { await pg.goto(base + p); await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(250); };
  const sideways = (pg) => pg.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  const focused = (pg = page) => pg.evaluate(() => { const e = document.activeElement; return { label: (e?.getAttribute("aria-label") || e?.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40), inDialog: !!e?.closest("[role=dialog]"), id: e?.id, tag: e?.tagName }; });
  const axe = async (pg) => (await new AxeBuilder({ page: pg }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`);

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await j("DELETE", "me/data", { confirm: "DELETE" });
  const A = {};
  for (const [k, n, t, o, extra] of [["bca", "BCA", "bank", "40.000.000"], ["cash", "Tunai", "cash", "1.000.000"], ["cc", "CC Contoh", "card", "0", { limit: "20.000.000" }]])
    A[k] = await j("POST", "accounts", { name: n, type: t, opening: o, openingOn: "2025-01-01", ...(extra || {}) });
  await j("POST", "categories/starter", {});
  const cats = await j("GET", "categories"); const list = Array.isArray(cats) ? cats : cats.categories;
  const exp = list.find((c) => c.name === "Belanja Dapur dan Rumah Tangga") ?? list.find((c) => c.kind === "expense"), inc = list.find((c) => c.kind === "income");
  for (let i = 2; i >= 0; i--) {
    const m = sm(N, -i), last = i === 0 ? Number(today.slice(8)) : 28;
    await j("POST", "transactions", { kind: "income", amount: "12.000.000", accountId: A.bca.id, categoryId: inc.id, description: "Gaji", on: `${m}-01` });
    for (let d = 2; d <= last; d += 2) await j("POST", "transactions", { kind: "spend", amount: String(40000 + d * 3000), accountId: d % 4 ? A.cash.id : A.cc.id, categoryId: exp.id, description: `Belanja ${d}`, on: `${m}-${String(d).padStart(2, "0")}` });
  }
  // The card is paid 3.000.000 more than it owes: in credit (finding 3).
  const owed = (await j("GET", "accounts")).find((a) => a.id === A.cc.id).card.used;
  await j("POST", "transactions", { kind: "transfer", amount: String((owed + 300_000_000) / 100), accountId: A.bca.id, toAccountId: A.cc.id, description: "Lebih bayar", on: today });
  await j("POST", "recurring", { name: "Langganan Contoh", kind: "spend", amount: "54.900", accountId: A.cc.id, categoryId: exp.id, every: "month", anchorOn: today });

  await s.check("1 · rows that are links keep their padding (Recurring, Sign out), phone and laptop", async () => {
    for (const w of [1440, 375]) {
      await page.setViewportSize({ width: w, height: 900 });
      await go("/settings/recurring");
      const r = await page.getByRole("button", { name: "Change Langganan Contoh" }).evaluate((e) => { const cs = getComputedStyle(e), card = e.closest(".fy-list").getBoundingClientRect(), amt = e.lastElementChild.getBoundingClientRect(); return { pl: parseFloat(cs.paddingLeft), pr: parseFloat(cs.paddingRight), inside: amt.right <= card.right - 8 }; });
      ok(r.pl >= 12 && r.pr >= 12 && r.inside, `${w}px recurring ${JSON.stringify(r)}`);
      await go("/settings");
      const so = await page.getByTestId("sign-out").evaluate((e) => parseFloat(getComputedStyle(e).paddingLeft));
      ok(so >= 12, `${w}px sign out padding ${so}`);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await go("/settings/recurring"); await shot(page, shots, "s17-01-recurring-1440");
  });

  await s.check("2 · the keyboard stays in a sheet; closing gives focus back to its opener", async () => {
    await go("/accounts");
    const opener = page.getByRole("button", { name: "Add a transaction" }).first(); await opener.focus(); await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor(); await page.waitForTimeout(300);
    ok((await focused()).inDialog, "focus didn't go into the sheet");
    for (let i = 0; i < 45; i++) { await page.keyboard.press("Tab"); if (!(await focused()).inDialog) throw new Error(`Tab ${i + 1} left the sheet`); }
    for (let i = 0; i < 12; i++) { await page.keyboard.press("Shift+Tab"); if (!(await focused()).inDialog) throw new Error(`Shift+Tab ${i + 1} left the sheet`); }
    await page.keyboard.press("Escape"); await page.getByRole("dialog").waitFor({ state: "detached" });
    ok((await focused()).label === "Add a transaction", `focus went to ${JSON.stringify(await focused())}`);
  });

  await s.check("3 · a card paid more than it owes says \"in credit\" on Accounts", async () => {
    await go("/accounts");
    const t = (await page.locator(".fy-row", { hasText: "CC Contoh" }).getByTestId("balance").innerText()).replace(/\s+/g, " ");
    ok(t === "Rp 3.000.000 in credit", t);
    await shot(page, shots, "s17-02-accounts-1440");
  });

  await s.check("4 · the day chart: one slider for the keyboard, visible bars, nothing serious for axe", async () => {
    await go("/");
    const chart = page.getByTestId("day-chart"); ok((await chart.getAttribute("role")) === "slider", "not a slider");
    ok((await page.locator('[data-testid="day-chart"] button').count()) === 0, "still a button per day");
    await chart.focus(); await page.keyboard.press("Home");
    ok((await chart.getAttribute("aria-valuenow")) === "1", "Home didn't pick day 1");
    await page.keyboard.press("ArrowRight"); ok((await chart.getAttribute("aria-valuenow")) === "2", "→ didn't move a day");
    ok((await chart.getAttribute("aria-valuetext")).includes("2 "), await chart.getAttribute("aria-valuetext"));
    ok((await page.getByTestId("txn-list").innerText()).includes("Belanja 2"), "the list isn't the day's");
    await page.keyboard.press("Escape"); ok((await chart.getAttribute("aria-valuetext")) === "All days", "Escape didn't clear");
    for (const scheme of ["light", "dark"]) {
      await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(150);
      const c = await page.evaluate(() => { const bar = document.querySelector(".fy-bars > span i:not(.z)"), card = bar.closest(".fy-card");
        const rgb = (s) => s.match(/[\d.]+/g).slice(0, 3).map(Number), L = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const a = L(rgb(getComputedStyle(bar).backgroundColor)), b = L(rgb(getComputedStyle(card).backgroundColor)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
      ok(c >= 3, `${scheme}: bars ${c.toFixed(2)}:1 against the card`);
    }
    await page.emulateMedia({ colorScheme: "light" });
    const v = await axe(page); ok(!v.length, v.join(" | "));
  });

  await s.check("5/6/15 · the laptop bar: Reports and Assets, the current page marked; page titles; Skip to content", async () => {
    const cur = async () => page.locator(".fy-topbar a[aria-current=page]").innerText();
    await go("/reports?view=balance"); ok((await cur()) === "Reports", `on Reports: ${await cur()}`); ok((await page.title()) === "Balance sheet · Finny", await page.title());
    await go("/debts"); ok((await cur()) === "Assets", `on Debts: ${await cur()}`); ok((await page.title()) === "Debts · Finny", await page.title());
    await go("/assets/goals"); ok((await cur()) === "Assets", "on Goals");
    await go(`/review/${M}`); ok((await cur()) === "Home", "on a review"); ok(/^[A-Z][a-z]+ \d{4} review · Finny$/.test(await page.title()), await page.title());
    await go("/"); ok((await page.title()) === "Home · Finny", await page.title());
    const links = await page.locator(".fy-topbar a.nav").allInnerTexts();
    ok(links.join(",") === "Home,Transactions,Budget,Accounts,Reports,Assets,Settings", links.join(",")); // FINNY-172 added Transactions
    await page.locator("body").click({ position: { x: 5, y: 300 } }); await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press("Tab"); ok((await focused()).label === "Skip to content", `first Tab: ${(await focused()).label}`);
    await page.screenshot({ path: path.join(shots, "s17-03-skip-1440.png"), clip: { x: 0, y: 0, width: 1440, height: 120 } });
    await page.keyboard.press("Enter"); await page.waitForTimeout(150); ok((await focused()).id === "main", "Skip didn't move to the page");
    await go("/reports"); await shot(page, shots, "s17-04-reports-1440");
    // Phones keep their four tabs; Home is lit on Reports there.
    await page.setViewportSize({ width: 390, height: 844 }); await go("/reports");
    ok((await page.locator(".fy-tabbar a").count()) === 4 && (await page.locator(".fy-tabbar a.on").innerText()) === "Home", "phone tab bar");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await s.check("7 · Home: the add form stays in view; the bar's Add goes to it; a short laptop keeps Save in view", async () => {
    await go("/");
    const side = page.locator("aside.side");
    await page.mouse.wheel(0, 1600); await page.waitForTimeout(300);
    const r = await side.boundingBox(); ok(r && r.y >= 60 && r.y <= 90, `scrolled: the form is at y ${r && Math.round(r.y)}`);
    await page.screenshot({ path: path.join(shots, "s17-05-home-scrolled-1440.png") });
    await page.getByRole("button", { name: "Add a transaction" }).first().click(); await page.waitForTimeout(250);
    ok((await page.getByRole("dialog").count()) === 0, "the bar's Add opened a second copy");
    ok(await page.evaluate(() => !!document.activeElement?.closest("aside.side") && document.activeElement.tagName === "INPUT"), "focus isn't in the form");
    await page.setViewportSize({ width: 1440, height: 768 }); await go("/");
    const save = page.locator("aside.side").getByRole("button", { name: "Save", exact: true }); const sb = await save.boundingBox();
    ok(sb && sb.y + sb.height <= 768, `Save at ${sb && Math.round(sb.y + sb.height)} on a 768 px screen`);
    await page.screenshot({ path: path.join(shots, "s17-06-home-768.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await s.check("9 · editing on a laptop: a dialog without the grabber; Save changes and Delete in view at 768 px; the phone keeps its sheet", async () => {
    await page.setViewportSize({ width: 1440, height: 768 }); await go("/");
    await page.getByRole("button", { name: /^Edit Belanja/ }).first().click(); const d = page.getByRole("dialog"); await d.waitFor(); await page.waitForTimeout(350);
    ok(!(await d.locator(".fy-grab").isVisible()), "grabber on a laptop");
    for (const n of ["Save changes", "Delete"]) { const bb = await d.getByRole("button", { name: n, exact: true }).boundingBox(); ok(bb && bb.y >= 0 && bb.y + bb.height <= 768, `${n} at ${bb && Math.round(bb.y)}`); }
    const box = await d.boundingBox(); ok(box.width <= 562 && box.x > 400, `dialog ${Math.round(box.width)} wide at x ${Math.round(box.x)}`);
    await page.screenshot({ path: path.join(shots, "s17-07-edit-768.png") });
    await page.keyboard.press("Escape"); await d.waitFor({ state: "detached" });
    await page.setViewportSize({ width: 390, height: 844 }); await go("/");
    await page.getByRole("button", { name: "Add a transaction" }).last().click(); await page.getByRole("dialog").waitFor();
    ok(await page.getByRole("dialog").locator(".fy-grab").isVisible(), "the phone lost its grabber");
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await s.check("8 · list pages share one reading width; the heading doesn't jump", async () => {
    const xs = {};
    for (const p of ["/accounts", "/budget", "/settings", "/categories", "/assets", "/import", `/review/${M}`, "/assets/goals", "/settings/recurring"]) {
      await go(p); const h = await page.locator("h1").first().boundingBox(); const w = await page.locator("main > *").first().evaluate((e) => e.getBoundingClientRect().width);
      xs[p] = Math.round(h.x); ok(w <= 722, `${p} is ${Math.round(w)} px wide`);
    }
    ok(new Set(Object.values(xs)).size === 1, JSON.stringify(xs));
    await go("/settings"); await shot(page, shots, "s17-08-settings-1440");
  });

  await s.check("10 · category names are whole at 1440 and 1024 px", async () => {
    for (const w of [1440, 1024]) {
      await page.setViewportSize({ width: w, height: 900 }); await go("/");
      const cut = await page.evaluate(() => [...document.querySelectorAll(".fy-legend .r span, aside.side .fy-cat small")].filter((e) => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent));
      ok(!cut.length, `${w}px: ${cut.join(", ")}`);
    }
    await page.setViewportSize({ width: 1024, height: 768 }); await go("/"); await page.screenshot({ path: path.join(shots, "s17-09-home-1024.png") });
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await s.check("11–14 · New account / New category, hover, the empty Budget centred, six statements named", async () => {
    await go("/accounts"); ok(await page.getByRole("button", { name: "New account" }).isVisible(), "New account");
    const row = page.locator("a.fy-row, button.fy-row").first(); const bg0 = await row.evaluate((e) => getComputedStyle(e).backgroundColor);
    await row.hover(); await page.waitForTimeout(200); ok(bg0 !== (await row.evaluate((e) => getComputedStyle(e).backgroundColor)), "no hover");
    await go("/categories"); ok(await page.getByRole("button", { name: "New category" }).isVisible(), "New category");
    await go(`/budget?month=${sm(N, 2)}`);
    const empty = page.getByTestId("budget-empty");
    if (await empty.count()) {
      const c = await empty.evaluate((e) => { const r = e.getBoundingClientRect(), bt = e.querySelector(".fy-btn").getBoundingClientRect(); return Math.abs((bt.left + bt.right) / 2 - (r.left + r.right) / 2); });
      ok(c <= 2, `buttons ${Math.round(c)} px off centre`); await shot(page, shots, "s17-10-budget-empty-1440");
    }
    await go("/settings"); ok((await page.locator("main").innerText()).includes("BCA, Mandiri, Krom, and BCA, Mandiri and BRI cards"), "statements line");
  });

  await s.check("every page: axe (WCAG 2.2 AA) and no sideways scroll at 1024, 1440, 1920", async () => {
    const pages = ["/", "/budget", "/accounts", "/reports", "/reports?view=balance", "/debts", "/assets", "/assets/goals", "/review", `/review/${M}`, "/settings", "/settings/recurring", "/settings/phone", "/categories", "/import/statements"];
    const bad = [];
    for (const w of [1440, 1024, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      for (const p of pages) { await go(p); if (await sideways(page)) bad.push(`${w} ${p} sideways`); if (w === 1440) for (const v of await axe(page)) bad.push(`${p} ${v}`); }
    }
    ok(!bad.length, bad.join(" | "));
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await j("DELETE", "me/data", { confirm: "DELETE" });
  await b.close();
  s.done();
};
