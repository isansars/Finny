// Sprint 22 (v0.22.0) QA, 🐧 Bubbles: several at once, offline (FINNY-199), on a production build with the service worker
// running and Playwright's offline mode, as a phone (390 × 844) and a laptop (1280 × 800). "Another device" is a second
// signed-in browser that stays online. Made-up records only, all today: Kopi 45.000 twice (a twin), Roti 20.000 twice
// (a twin), Token listrik 423.000 and PLN 380.000 (both wrongly under Biaya Bensin), Bensin 150.000, Gaji +1.000.000.
const { suite, ok, browser } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");
const path = require("node:path");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint22");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "allow" });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  const other = await b.newContext(); await other.addCookies(await ctx.cookies());
  const api = async (method, p, data) => { const r = await other.request.fetch(`${base}/api/${p}`, { method, data, headers: { "content-type": "application/json" } }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const text = async (pg, id) => (await pg.getByTestId(id).innerText()).replace(/\s+/g, " ");
  const all = async () => (await api("GET", "transactions?limit=500")).body.items;
  const by = async (d) => (await all()).filter((t) => t.description === d);
  const axe = async (pg) => (await new AxeBuilder({ page: pg }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`);

  await api("DELETE", "me/data", { confirm: "DELETE" });
  const bca = (await api("POST", "accounts", { name: "BCA", type: "bank", opening: "5.000.000", openingOn: "2025-01-01" })).body;
  const C = {};
  for (const [k, n, kind] of [["kopi", "Beli Kopi", "expense"], ["bensin", "Biaya Bensin", "expense"], ["listrik", "Listrik", "expense"], ["gaji", "Gaji", "income"]]) C[k] = (await api("POST", "categories", { name: n, kind })).body;
  const T = {};
  for (const [k, d, a, c, kind] of [["kopi1", "Kopi", "45.000", "kopi"], ["kopi2", "Kopi", "45.000", "kopi"], ["roti1", "Roti", "20.000", "kopi"], ["roti2", "Roti", "20.000", "kopi"],
    ["token", "Token listrik", "423.000", "bensin"], ["pln", "PLN", "380.000", "bensin"], ["bensin", "Bensin", "150.000", "bensin"], ["gaji", "Gaji", "1.000.000", "gaji", "income"]])
    T[k] = (await api("POST", "transactions", { kind: kind ?? "spend", amount: a, accountId: bca.id, categoryId: C[c].id, description: d, on: today })).body;
  const month = today.slice(0, 7);

  // The service worker keeps Transactions' list, as on the owner's phone after one visit.
  await page.goto(base + "/"); await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const tx = async (pg) => { await pg.goto(`${base}/transactions?month=${month}`); await pg.getByTestId("tx-foot").first().waitFor(); };
  await tx(page); await page.waitForLoadState("networkidle");
  const rows = () => page.getByTestId("tx-row");
  // After a pick its button reads "Unpick …", so the next "Pick <name>" is always the first one left.
  const pick = async (name) => page.getByRole("button", { name: new RegExp(`^Pick ${name},`) }).first().click();
  const select = async () => { await page.getByRole("button", { name: "Select", exact: true }).click(); };

  await s.check("FINNY-199.1 delete several offline: the bar says they wait on this phone; Undo cancels at once", async () => {
    await ctx.setOffline(true); await page.reload(); await page.getByTestId("offline-banner").waitFor(); await page.getByTestId("tx-foot").first().waitFor();
    ok((await rows().count()) === 8, `${await rows().count()} rows offline`);
    await select(); await pick("Kopi"); await pick("Kopi");
    await page.screenshot({ path: path.join(shots, "s22-01-picked-offline.png") });
    await page.getByRole("button", { name: "Delete 2" }).click();
    const bar = page.getByTestId("undo-bar"); await bar.waitFor();
    const t = (await bar.innerText()).replace(/\s+/g, " ");
    ok(t.includes("Deleted 2 · −Rp 90.000") && t.includes("waits on this phone"), t);
    ok((await page.locator(".fy-undo .line").count()) === 0, "no 30-second line offline");
    ok((await page.locator('[data-testid="waiting"] [data-op="delete"]').count()) === 2, "two deletes wait");
    ok((await page.getByRole("button", { name: /^Edit Kopi,/ }).count()) === 0, "not listed twice");
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(shots, "s22-02-deleted-offline.png") });
    const v = await axe(page); ok(!v.length, v.join(" | "));
    await bar.getByRole("button", { name: "Undo" }).click(); await page.getByText("2 transactions back").waitFor();
    ok((await page.locator('[data-testid="waiting"]').count()) === 0, "nothing waits after Undo");
    ok((await page.getByRole("button", { name: /^Edit Kopi,/ }).count()) === 2, "both back in the list");
    ok((await by("Kopi")).length === 2, "nothing reached Finny");
    await select(); await pick("Kopi"); await pick("Kopi"); await page.getByRole("button", { name: "Delete 2" }).click(); await bar.waitFor();
  });

  await s.check("FINNY-199.2 a new category offline waits per row; a row whose kind doesn't fit keeps its own", async () => {
    await select(); await pick("Token listrik"); await pick("PLN"); await pick("Gaji");
    await page.getByRole("button", { name: "Change category" }).click(); await page.getByLabel("New category").selectOption(C.listrik.id);
    await page.getByRole("button", { name: "Change 3" }).click();
    await page.getByRole("alert").filter({ hasText: "1 of them kept their category" }).waitFor();
    const w = await text(page, "waiting");
    ok((w.match(/Biaya Bensin → Listrik/g) ?? []).length === 2 && (w.match(/change waiting/g) ?? []).length === 2, w);
    ok((await page.getByRole("button", { name: /^Edit Gaji,/ }).count()) === 1, "Gaji untouched, still listed");
    await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(shots, "s22-03-category-offline.png") });
  });

  await s.check("FINNY-199.2 Looks fine offline waits too; changing a waiting row again merges", async () => {
    await select(); await pick("Roti"); await pick("Roti");
    await page.getByTestId("bulk").getByRole("button", { name: "Looks fine" }).click();
    await page.waitForFunction(() => (document.querySelector('[data-testid="waiting"]')?.textContent?.match(/looks fine/g) ?? []).length === 2);
    ok((await page.locator('[data-testid="waiting"] .fy-row').count()) === 6, `${await page.locator('[data-testid="waiting"] .fy-row').count()} waiting`);
  });

  await s.check("FINNY-199.3 Home shows the same Waiting to send", async () => {
    await page.goto(base + "/"); await page.getByTestId("waiting").waitFor();
    ok((await page.locator('[data-testid="waiting"] .fy-row').count()) === 6, "6 on Home");
    await tx(page);
  });

  await s.check("FINNY-199.4 back online: each row sent once (\"4 changes and 2 deletes sent\"); Finny has the changes", async () => {
    await ctx.setOffline(false); await page.getByTestId("online-banner").waitFor({ timeout: 40000 });
    ok((await text(page, "online-banner")) === "Back online · 4 changes and 2 deletes sent", await text(page, "online-banner"));
    ok((await by("Kopi")).length === 0, "both Kopi deleted");
    for (const d of ["Token listrik", "PLN"]) ok((await by(d))[0].categoryId === C.listrik.id, `${d} moved`);
    ok((await by("Gaji"))[0].categoryId === C.gaji.id, "Gaji kept");
    const roti = await api("GET", `transactions/table?month=${month}&limit=50`);
    ok(roti.body.items.filter((r) => r.description === "Roti").every((r) => r.looksOk), "Roti looks fine");
    ok((await api("GET", "transactions/undo")).body.last, "the deletes can be brought back for a day");
    await page.evaluate(() => window.dispatchEvent(new Event("online"))); await page.waitForTimeout(1500);
    ok((await all()).length === 6, `${(await all()).length} rows (nothing twice)`);
  });

  await s.check("FINNY-199.4 changed on another device meanwhile: asked on Transactions; Keep Finny's", async () => {
    await page.reload(); await page.getByTestId("tx-foot").first().waitFor(); await page.waitForLoadState("networkidle");
    await ctx.setOffline(true); await page.reload(); await page.getByTestId("offline-banner").waitFor(); await page.getByTestId("tx-foot").first().waitFor();
    await select(); await pick("PLN"); await page.getByRole("button", { name: "Change category" }).click();
    await page.getByLabel("New category").selectOption(C.bensin.id); await page.getByRole("button", { name: "Change 1" }).click();
    await page.getByTestId("waiting").waitFor();
    ok((await api("PATCH", `transactions/${T.pln.id}`, { amount: "385.000" })).status === 200, "the other device changes PLN");
    await ctx.setOffline(false);
    const card = page.getByRole("region", { name: "PLN changed somewhere else" }); await card.waitFor({ timeout: 40000 });
    ok((await card.innerText()).replace(/\s+/g, " ").includes("In Finny now −385.000"), await card.innerText());
    await card.getByRole("button", { name: "Keep Finny's" }).click(); await card.waitFor({ state: "detached" });
    const p = (await by("PLN"))[0]; ok(p.categoryId === C.listrik.id && p.amountSen === 385_000_00, JSON.stringify(p));
  });

  await s.check("laptop: tick boxes, Delete offline waits and is sent; online several at once is one request as before", async () => {
    const lc = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "allow" }); await lc.addCookies(await ctx.cookies());
    const l = await lc.newPage(); l.on("dialog", (d) => d.accept()); l.on("pageerror", (e) => errors.push(`laptop ${e.message}`));
    await l.goto(base + "/"); await l.evaluate(() => navigator.serviceWorker.ready); await l.reload(); await l.waitForFunction(() => !!navigator.serviceWorker.controller);
    await tx(l); await l.waitForLoadState("networkidle");
    await lc.setOffline(true); await l.reload(); await l.getByTestId("offline-banner").waitFor(); await l.getByTestId("tx-foot").first().waitFor();
    await l.getByRole("checkbox", { name: /^Pick Bensin,/ }).check(); await l.getByRole("button", { name: "Delete 1" }).click();
    const bar = l.getByTestId("undo-bar"); await bar.waitFor(); ok((await bar.innerText()).includes("waits on this phone"), await bar.innerText());
    await l.screenshot({ path: path.join(shots, "s22-04-laptop-offline.png") });
    const v = await axe(l); ok(!v.length, v.join(" | "));
    await lc.setOffline(false); await l.getByTestId("online-banner").waitFor({ timeout: 40000 });
    ok((await by("Bensin")).length === 0, "Bensin deleted once back");
    // Online: one request for several, all or nothing (Sprint 18), and nothing waits.
    let bulkCalls = 0; l.on("request", (r) => { if (r.url().endsWith("/api/transactions/bulk")) bulkCalls++; });
    await l.reload(); await l.getByTestId("tx-foot").first().waitFor();
    await l.getByRole("checkbox", { name: /^Pick Roti,/ }).first().check(); await l.getByRole("checkbox", { name: /^Pick Roti,/ }).nth(1).check();
    await l.getByRole("button", { name: "Delete 2" }).click(); await l.getByTestId("undo-bar").waitFor();
    ok(bulkCalls === 1 && (await l.locator('[data-testid="waiting"]').count()) === 0 && (await l.locator(".fy-undo .line").count()) === 1, `bulk ${bulkCalls}`);
    await lc.close();
  });

  await s.check("no page errors", async () => ok(!errors.filter((e) => !/Failed to fetch|NetworkError|net::/.test(e)).length, errors.join(" | ")));
  await api("DELETE", "me/data", { confirm: "DELETE" });
  await other.close(); await b.close();
  s.done();
};
