// Sprint 3 (v0.3.0) QA, 🐧 Bubbles: importing the workbooks (FINNY-11), end to end in a browser, with the made-up
// workbooks written by tests/fixtures/make-workbooks.mjs. Never real data.
const path = require("node:path");
const { suite, ok, browser, shot } = require("./helpers.cjs");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint3");
  const { makeWorkbooks } = await import(path.join(__dirname, "..", "fixtures", "make-workbooks.mjs"));
  const files = await makeWorkbooks(path.join(__dirname, "..", "..", ".data", "qa-fixtures"));
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const accounts = async () => (await json("accounts")).body;
  const acc = async (n) => (await accounts()).find((a) => a.name === n);
  const noSideScroll = async (l) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${l} scrolls sideways`);

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  // What Finny already has: GoPay, the category "Makan di Luar", and the workbook's 5 June lunch (so it's a duplicate).
  const gopay = (await json("accounts", { method: "POST", data: { name: "GoPay", type: "ewallet" } })).body;
  const makan = (await json("categories", { method: "POST", data: { kind: "expense", name: "Makan di Luar" } })).body;
  await json("transactions", { method: "POST", data: { kind: "spend", amount: "35.000", accountId: gopay.id, categoryId: makan.id, description: "Makan siang", on: "2024-06-05" } });

  await s.check("FINNY-11.1 Settings › Import; the workbook is read on the device", async () => {
    await page.goto(base + "/settings"); await page.getByRole("link", { name: "Import a workbook" }).click(); await page.waitForURL(base + "/import");
    await noSideScroll("Import"); await shot(page, shots, "s3-01-choose-375");
    const sent = []; page.on("request", (r) => { if (r.method() !== "GET") sent.push((r.postData() || "").length); });
    await page.getByLabel("Choose a workbook").setInputFiles(files.books);
    await page.getByTestId("sheets").waitFor();
    ok(sent.every((n) => n < 20000), "the workbook was uploaded"); // only the plan is ever sent, later
  });
  await s.check("FINNY-11.2 every sheet listed; the template's example is off with the reason; types guessed; an existing account joins", async () => {
    const t = await page.getByTestId("sheets").innerText();
    for (const n of ["Kas Tunai", "Bank Satu", "GoPay", "Kartu Kredit (closed)", "PinjamDulu"]) ok(t.includes(n), `no ${n}`);
    ok(await page.getByRole("switch", { name: "Import Kas Tunai" }).getAttribute("aria-checked") === "false", "template sheet on");
    ok((await page.getByTestId("sheet-Kas Tunai").innerText()).includes("Template example"), "no reason");
    ok((await page.getByTestId("sheet-GoPay").innerText()).includes("Joins your GoPay"), "GoPay doesn't join");
    ok(await page.getByLabel("Type of Kartu Kredit").inputValue() === "card" && await page.getByLabel("Type of PinjamDulu").inputValue() === "loan", "types");
    await noSideScroll("Accounts step"); await shot(page, shots, "s3-02-accounts-375");
    await page.getByRole("button", { name: "Next: categories" }).click();
  });
  await s.check("FINNY-11.3 categories: the chart of accounts as a tree; existing names matched", async () => {
    ok(await page.getByTestId("cats-matched").innerText() === "1", "Makan di Luar not matched");
    ok((await page.getByTestId("plan-categories").innerText()).includes("Pengembalian Dana"), "refunds");
    await noSideScroll("Categories step"); await shot(page, shots, "s3-03-categories-375");
    await page.getByRole("button", { name: "Next: check and import" }).click();
  });
  await s.check("FINNY-11.6 the check: balances vs the workbook, what can't be placed, nothing guessed", async () => {
    ok((await page.getByTestId("to-import").innerText()).startsWith("15"), "count");
    ok((await page.getByTestId("check-GoPay").innerText()).includes("Matches"), "GoPay exact");
    ok((await page.getByTestId("check-Bank Satu").innerText()).includes("Matched by moving the opening balance −Rp 25.000"), "Bank Satu aligned");
    ok((await page.getByTestId("unplaced").innerText()).includes("Tabungan Bank-0001"), "unplaced row");
    await noSideScroll("Check step"); await shot(page, shots, "s3-04-check-375");
  });
  await s.check("FINNY-11.4/5/7 import: transfers once, cards and loans as owed, CLOSED closed, the duplicate skipped", async () => {
    await page.getByRole("button", { name: /^Import 15 transactions/ }).click(); await page.getByTestId("import-done").waitFor({ timeout: 30000 });
    ok((await page.getByTestId("import-done").innerText()).includes("Imported 14"), await page.getByTestId("import-done").innerText());
    ok((await page.getByRole("status").innerText()).includes("1 were already in Finny"), "skipped count");
    await shot(page, shots, "s3-05-done-375");
    await page.getByRole("link", { name: "See your latest month" }).click(); await page.waitForURL(/month=2024-06/);
    await page.getByTestId("by-category").waitFor(); ok((await page.getByTestId("month").innerText()) === "June 2024", "not the imported month");
    await shot(page, shots, "s3-05b-home-imported-375");
    ok((await acc("Bank Satu")).balanceSen === 484111000, `Bank Satu ${(await acc("Bank Satu")).balanceSen}`); // = the workbook's last Saldo
    ok((await acc("GoPay")).balanceSen === 6100000, `GoPay ${(await acc("GoPay")).balanceSen}`); // both parking rows count
    const kk = await acc("Kartu Kredit"); ok(kk.archived && kk.card.used === 15000000 && kk.limitSen === 1000000000, JSON.stringify(kk));
    const pd = await acc("PinjamDulu"); ok(pd.type === "loan" && pd.card.used === 50000000, JSON.stringify(pd.card));
    ok((await acc("Kas Tunai")).balanceSen === 30000000, "cash from the one-sided transfer");
    const all = (await json("transactions?limit=500")).body.items; ok(all.filter((t) => t.kind === "transfer").length === 4, "transfers");
    const cats = (await json("categories")).body; const listrik = cats.find((c) => c.name === "Biaya Listrik");
    ok(listrik && cats.find((c) => c.id === listrik.parentId)?.name === "Sarana Pelengkap Properti", "3-level path");
  });
  await s.check("FINNY-11.7 importing the same workbook again adds nothing", async () => {
    await page.goto(base + "/import"); await page.getByLabel("Choose a workbook").setInputFiles(files.books); await page.getByTestId("sheets").waitFor();
    await page.getByRole("button", { name: "Next: categories" }).click(); await page.getByRole("button", { name: "Next: check and import" }).click();
    await page.getByRole("button", { name: /^Import 15 transactions/ }).click(); await page.getByTestId("import-done").waitFor({ timeout: 30000 });
    ok((await page.getByTestId("import-done").innerText()).includes("Imported 0"), await page.getByTestId("import-done").innerText());
    ok((await acc("Bank Satu")).balanceSen === 484111000, "balance changed");
  });
  await s.check("FINNY-11.8 the wealth workbook offers only the Transaction Log rows not in Finny", async () => {
    await page.goto(base + "/import"); await page.getByLabel("Choose a workbook").setInputFiles(files.wealth); await page.getByTestId("log-rows").waitFor();
    const t = await page.getByTestId("log-rows").innerText(); ok(t.includes("Parkir") && t.includes("Hadiah") && !t.includes("Ngopi di Kedai"), t);
    await noSideScroll("Log step"); await shot(page, shots, "s3-06-log-375");
    await page.getByRole("button", { name: "Add 2 transactions" }).click(); await page.getByTestId("import-done").waitFor({ timeout: 30000 });
    ok((await acc("GoPay")).balanceSen === 4900000, "Parkir not added");
  });
  await s.check("FINNY-11.9 undo removes exactly what each import added", async () => {
    await page.goto(base + "/import"); const list = page.getByTestId("imports"); await list.getByRole("button", { name: /^Undo/ }).first().waitFor();
    ok(await list.getByRole("button", { name: /^Undo/ }).count() === 3, "three imports listed");
    await shot(page, shots, "s3-07-imports-375");
    for (let i = 0; i < 3; i++) { await list.getByRole("button", { name: /^Undo/ }).first().click(); await page.waitForTimeout(700); }
    const names = (await accounts()).map((a) => a.name); ok(JSON.stringify(names) === JSON.stringify(["GoPay"]), names.join(","));
    ok((await acc("GoPay")).balanceSen === -3500000, "GoPay back to its own lunch");
    const cats = (await json("categories")).body.map((c) => c.name); ok(JSON.stringify(cats) === JSON.stringify(["Makan di Luar"]), cats.join(","));
  });
  const desk = await b.newContext({ viewport: { width: 1280, height: 900 } }); await desk.addCookies(await ctx.cookies()); const dp = await desk.newPage();
  await s.check("Desktop: the check step", async () => {
    await dp.goto(base + "/import"); await dp.getByLabel("Choose a workbook").setInputFiles(files.books); await dp.getByTestId("sheets").waitFor();
    await dp.getByRole("button", { name: "Next: categories" }).click(); await dp.getByRole("button", { name: "Next: check and import" }).click(); await dp.getByTestId("checks").waitFor();
    await shot(dp, shots, "s3-08-check-desktop");
  });
  await b.close(); s.done();
};
