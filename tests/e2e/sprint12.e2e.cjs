// Sprint 12 (v0.12.0) QA, 🐧 Bubbles: the workbook match check (FINNY-123), end to end in a browser, with the made-up
// workbooks written by tests/fixtures/make-workbooks.mjs (June 2024). Never real data.
const path = require("node:path");
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint12");
  const { makeWorkbooks } = await import(path.join(__dirname, "..", "fixtures", "make-workbooks.mjs"));
  const files = await makeWorkbooks(path.join(__dirname, "..", "..", ".data", "qa-fixtures"));
  const M = "2024-06";
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const noSideScroll = async (l) => { const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((e) => `${e.tagName}.${e.className?.baseVal ?? e.className}`)); ok(!wide.length, `${l} scrolls sideways: ${wide.join(" ")}`); };
  const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");
  const waitText = (id, t) => page.waitForFunction(([i, x]) => document.querySelector(`[data-testid="${i}"]`)?.textContent?.includes(x), [id, t]);
  // Every request the page sends that carries a body, to prove the workbook never leaves the device.
  const sent = []; page.on("request", (r) => { if (r.method() !== "GET") sent.push({ url: r.url(), body: r.postData() || "" }); });

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  // Bring the made-up books into Finny exactly as the owner did (Sprint 3's import).
  await page.goto(base + "/import"); await page.getByLabel("Choose a workbook").setInputFiles(files.books); await page.getByTestId("sheets").waitFor();
  await page.getByRole("button", { name: "Next: categories" }).click(); await page.getByRole("button", { name: "Next: check and import" }).click();
  await page.getByRole("button", { name: /^Import \d+ transactions/ }).click(); await page.getByTestId("import-done").waitFor({ timeout: 30000 });
  const txns = async () => (await json("transactions?limit=500")).body.items;
  sent.length = 0;

  await s.check("FINNY-123.1 from Import and the review; the workbook is read on the device", async () => {
    await page.goto(base + "/import"); ok((await page.getByTestId("import-match").getAttribute("href")).endsWith("/match"), "Import links to the check");
    await page.goto(`${base}/review/${M}`); await page.getByTestId("rv-match").waitFor();
    ok((await text("rv-match")).includes("Check against your workbook"), await text("rv-match"));
    await page.getByTestId("rv-match").click(); await page.waitForURL(`${base}/review/${M}/match`);
    await page.getByLabel("Choose the Pengeluaran workbook").setInputFiles(files.books);
    await waitText("mt-files", "read on this device");
    await noSideScroll("Check: choose"); await shot(page, shots, "s12-01-choose-375");
    await page.getByRole("button", { name: "Check June" }).click(); await page.getByTestId("mt-head").waitFor();
  });

  await s.check("FINNY-123.2/3 a clean import: every account and category matches; saved as counts", async () => {
    // By hand: Bank Satu 4.841.110, GoPay 61.000, Kartu Kredit −150.000, PinjamDulu −500.000 (the template's Kas Tunai isn't compared).
    await waitText("mt-head", "Everything matches");
    ok((await text("mt-head")).includes("4 of 4 match"), await text("mt-head"));
    ok((await text("mt-accounts")).includes("Bank Satu") && (await text("mt-accounts")).includes("4.841.110"), await text("mt-accounts"));
    await page.waitForFunction(async (m) => (await (await fetch(`/api/reviews/${m}`)).json()).match?.matches === true, M);
    const r = (await json(`reviews/${M}`)).body.match;
    ok(r.accountsOk === 4 && r.accountsTotal === 4 && r.categoriesOk === r.categoriesTotal && r.categoriesTotal >= 8, JSON.stringify(r));
  });

  await s.check("FINNY-123.4 a row missing in Finny: the difference, the row behind it, Add to Finny", async () => {
    const lunch = (await txns()).find((t) => t.description === "Makan siang");
    ok((await json(`transactions/${lunch.id}`, { method: "DELETE" })).status === 200, "deleted the lunch");
    await page.reload(); await page.getByLabel("Choose the Pengeluaran workbook").setInputFiles(files.books); await waitText("mt-files", "read on this device");
    await page.getByRole("button", { name: "Check June" }).click(); await waitText("mt-head", "2 differences");
    ok((await text("mt-head")).includes("3 of 4 match"), await text("mt-head"));
    ok(/GoPay Workbook 61\.000 · Finny 96\.000 \+35\.000/.test(await text("mt-accounts")), await text("mt-accounts"));
    ok(/Makan di Luar Workbook 235\.000 · Finny 200\.000 −35\.000/.test(await text("mt-categories")), await text("mt-categories"));
    await noSideScroll("Check: result"); await shot(page, shots, "s12-02-result-375");
    await page.getByTestId("mt-accounts").getByRole("button", { name: /GoPay/ }).click(); await page.getByTestId("mt-diff").waitFor();
    ok((await text("mt-diff")).includes("Finny is Rp 35.000 higher"), await text("mt-diff"));
    ok(/Makan siang .*5 Jun · Makan di Luar −35\.000/.test(await text("mt-only-wb")), await text("mt-only-wb"));
    ok((await text("mt-only-finny")).includes("Nothing"), await text("mt-only-finny"));
    await noSideScroll("Check: a difference"); await shot(page, shots, "s12-03-difference-375");
    await page.getByRole("button", { name: "Add Makan siang to Finny" }).click();
    await page.getByRole("status").filter({ hasText: "Added 1 row" }).waitFor();
    await waitText("mt-diff", "They match now");
    const back = (await txns()).find((t) => t.description === "Makan siang");
    ok(back && back.on === "2024-06-05" && back.amountSen === 3_500_000, "the lunch is back on its day");
    await page.getByRole("button", { name: "Results" }).click(); await waitText("mt-head", "Everything matches");
  });

  await s.check("FINNY-123.4 a row only in Finny", async () => {
    const bank = (await json("accounts")).body.find((a) => a.name === "Bank Satu"), kopi = (await json("categories")).body.find((c) => c.name === "Beli Kopi");
    const extra = (await json("transactions", { method: "POST", data: { kind: "spend", amount: "20.000", accountId: bank.id, categoryId: kopi.id, description: "Kopi lagi", on: "2024-06-20" } })).body;
    await page.getByRole("button", { name: "Back" }).click(); await page.getByRole("button", { name: "Check June" }).click(); await waitText("mt-head", "2 differences");
    await page.getByTestId("mt-categories").getByRole("button", { name: /Beli Kopi/ }).click(); await page.getByTestId("mt-diff").waitFor();
    ok(/Kopi lagi .*20 Jun · Beli Kopi 20\.000/.test(await text("mt-only-finny")) && (await text("mt-only-wb")).includes("Nothing"), await text("mt-only-finny"));
    await json(`transactions/${extra.id}`, { method: "DELETE" });
  });

  await s.check("FINNY-123.3 with the Transaction Log: its categories compared too", async () => {
    await page.goto(`${base}/review/${M}/match`);
    await page.getByLabel("Choose the Pengeluaran workbook").setInputFiles(files.books); await waitText("mt-files", "Books ·");
    await page.getByLabel("Choose the Wealth workbook").setInputFiles(files.wealth); await waitText("mt-files", "Transaction Log ·");
    await page.getByRole("button", { name: "Check June" }).click(); await page.getByTestId("mt-log").waitFor();
    // The log's June: Coffee 43.890, Transportation 12.000, Gifts 250.000; Finny has no categories by those names.
    ok(/Coffee Workbook 43\.890 · Finny 0/.test(await text("mt-log")) && (await text("mt-log")).includes("Gifts (income)"), await text("mt-log"));
    await page.waitForFunction(async (m) => (await (await fetch(`/api/reviews/${m}`)).json()).match?.withLog === true, M);
    ok((await json(`reviews/${M}`)).body.match.matches === false, "the log's differences count");
  });

  await s.check("FINNY-123.5 only counts reach the server; the review keeps the result", async () => {
    const saves = sent.filter((x) => /\/api\/reviews\/[\d-]+\/match$/.test(x.url));
    ok(saves.length >= 3, `saves ${saves.length}`);
    ok(saves.every((x) => Object.keys(JSON.parse(x.body)).sort().join() === "accountsOk,accountsTotal,categoriesOk,categoriesTotal,withLog"), saves.map((x) => x.body).join(" | "));
    const others = sent.filter((x) => !/\/api\/transactions$/.test(x.url));
    ok(!others.some((x) => /Ngopi|Gaji Juni|Bank Satu|Coffee/.test(x.body)), "workbook data left the device");
    ok(!sent.some((x) => x.body.length > 20000), "a large body was sent");
    // Back to the books only: everything matches again, and the review says so.
    await page.goto(`${base}/review/${M}/match`); await page.getByLabel("Choose the Pengeluaran workbook").setInputFiles(files.books); await waitText("mt-files", "Books ·");
    await page.getByRole("button", { name: "Check June" }).click(); await waitText("mt-head", "Everything matches");
    await page.waitForFunction(async (m) => (await (await fetch(`/api/reviews/${m}`)).json()).match?.matches === true, M);
    await page.goto(`${base}/review/${M}`); await waitText("rv-match", "Matches your workbook");
    ok((await text("rv-match")).includes("4 of 4 accounts") && (await text("rv-match")).includes("A month in Finny only: the numbers match"), await text("rv-match"));
    await shot(page, shots, "s12-04-review-375");
    const c = (await json(`reviews/${M}/close`, { method: "POST", data: {} })).body;
    ok(c.summary.match?.matches === true, "the summary keeps the result");
    await page.goto(`${base}/review/${M}/close`); await page.getByTestId("rv-summary").waitFor();
    ok((await text("rv-summary")).includes("Workbook check All accounts and categories match"), await text("rv-summary"));
  });

  await s.check("the rules are checked; export has the result", async () => {
    ok((await json("match?month=2024-13")).status === 400 && (await json("match?month=2099-01")).status === 400, "bad months");
    const post = (data) => json(`reviews/${M}/match`, { method: "POST", data });
    ok((await post({ accountsOk: 5, accountsTotal: 4, categoriesOk: 1, categoriesTotal: 1 })).status === 400, "more matching than checked");
    ok((await post({ accountsOk: -1, accountsTotal: 4, categoriesOk: 1, categoriesTotal: 1 })).status === 400, "negative");
    ok((await post({ accountsOk: 0, accountsTotal: 0, categoriesOk: 0, categoriesTotal: 0 })).status === 400, "nothing checked");
    const r = await page.request.get(base + "/api/export"); ok((await r.body()).toString("latin1").includes("match_json"), "export");
  });

  await s.check("desktop and accessibility", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    await page.goto(`${base}/review/${M}/match`); await page.waitForLoadState("networkidle"); await scan("choose");
    await page.getByLabel("Choose the Pengeluaran workbook").setInputFiles(files.books); await waitText("mt-files", "Books ·");
    await page.getByRole("button", { name: "Check June" }).click(); await page.getByTestId("mt-head").waitFor(); await scan("result");
    await page.goto(`${base}/review/${M}`); await page.waitForLoadState("networkidle"); await scan("review");
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(`${base}/review/${M}/match`); await page.getByLabel("Choose the Pengeluaran workbook").setInputFiles(files.books); await waitText("mt-files", "Books ·");
    await page.getByRole("button", { name: "Check June" }).click(); await page.getByTestId("mt-head").waitFor(); await noSideScroll("Desktop"); await shot(page, shots, "s12-05-result-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
