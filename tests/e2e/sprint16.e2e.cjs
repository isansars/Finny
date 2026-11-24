// Sprint 16 (v0.16.0) QA, 🐧 Bubbles: BCA credit card statements (FINNY-154), end to end in a browser with the made-up
// bill drawn by tests/fixtures/statements/make-pdfs.mjs (two cards on one bill, a payment, a USD charge, an instalment,
// an annual fee, December lines on a January bill). The owner's real bills never leave fixtures-private/.
const path = require("node:path");
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const FIX = path.join(__dirname, "..", "fixtures", "statements");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint16");
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const acc = async (n) => (await json("accounts")).body.find((a) => a.name === n);
  const noSideScroll = async (l) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${l} scrolls sideways`);
  const lines = () => page.getByTestId("stmt-line");
  const line = (text) => lines().filter({ hasText: text }).first();
  const choose = async () => { await page.waitForFunction(() => { const i = document.querySelector('input[type="file"]'); return i && !i.disabled; }); await page.getByLabel("Choose a PDF statement").setInputFiles(path.join(FIX, "bca-card.pdf")); };
  const txns = async () => (await json("transactions?limit=500")).body.items;

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  // Finny before the bill: a BCA savings account, the BCA card owing the previous bill (500.000), some history to suggest categories.
  const A = {};
  for (const [name, type, opening, extra] of [["Cash", "cash", "0", {}], ["BCA", "bank", "5.000.000", {}], ["BCA Card", "card", "-500.000", { limit: "10.000.000" }], ["BRI Card", "card", "0", { limit: "5.000.000" }]])
    A[name] = (await json("accounts", { method: "POST", data: { name, type, opening, openingOn: "2026-10-01", ...extra } })).body;
  const C = {};
  for (const [name, kind] of [["Langganan", "expense"], ["Belanja Online", "expense"], ["Biaya Bank", "expense"], ["Elektronik", "expense"]])
    C[name] = (await json("categories", { method: "POST", data: { name, kind } })).body;
  const add = (d) => json("transactions", { method: "POST", data: d });
  // History (October, outside the bill's window): what each shop usually is.
  await add({ kind: "spend", amount: "200.000", accountId: A.Cash.id, categoryId: C.Langganan.id, description: "Streaming Plus Singapore Sg", on: "2026-10-05" });
  await add({ kind: "spend", amount: "125.000", accountId: A.Cash.id, categoryId: C["Biaya Bank"].id, description: "Biaya Iuran Tahunan", on: "2026-10-06" });
  await add({ kind: "spend", amount: "300.000", accountId: A.Cash.id, categoryId: C.Elektronik.id, description: "Cicilan Toko Elektronik 02/12", on: "2026-10-15" });
  // Already in Finny: the book typed on the card. The 500.000 payment isn't typed anywhere yet, so it's a transfer from BCA.
  await add({ kind: "spend", amount: "148.400", accountId: A["BCA Card"].id, categoryId: C["Belanja Online"].id, description: "Toko Buku Online", on: "2026-12-28" });

  await s.check("FINNY-154.1 BCA credit card is in the list (5 statements)", async () => {
    await page.goto(base + "/import/statements");
    await page.getByText("Monthly bill · every BCA card on it").waitFor();
    const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    for (const w of ["BCA credit card", "Monthly bill · every BCA card on it", "5 statements", "BRI credit card"]) ok(t.includes(w), `no "${w}"`);
    await noSideScroll("Start"); await shot(page, shots, "s16-01-start-375");
  });

  await s.check("FINNY-154.2/3/4/5 the bill: the card account guessed, each line's card, USD, instalment, the due date, the bill checked", async () => {
    await choose();
    await page.getByTestId("balance").waitFor({ timeout: 20000 });
    ok(await page.getByLabel("Into account").inputValue() === A["BCA Card"].id, "the BCA card account wasn't guessed");
    ok((await page.locator("h1").innerText()) === "January bill", await page.locator("h1").innerText());
    const due = (await page.getByTestId("due").innerText()).replace(/\s+/g, " ");
    ok(due === "Due 19 Jan · minimum Rp 50.000", due);
    const bal = await page.getByTestId("balance").innerText();
    ok(bal.includes("Bill Rp 789.400 matches Finny"), bal);
    ok((await lines().count()) === 5, `lines ${await lines().count()}`);
    const st = (await line("Streaming Plus").innerText()).replace(/\s+/g, " ");
    ok(st.includes("Mastercard Contoh ·· 4821") && st.includes("USD 12,00") && (await line("Streaming Plus").getAttribute("data-status")) === "new", st);
    const ci = (await line("Cicilan").innerText()).replace(/\s+/g, " ");
    ok(ci.includes("Everyday ·· 7730") && ci.includes("3 of 12"), ci);
    ok((await line("Biaya Iuran").innerText()).includes("Everyday ·· 7730"), "the annual fee's card");
    ok((await line("Toko Buku").getAttribute("data-status")) === "in", "the book typed on the card isn't Already in");
    ok((await line("Pembayaran").getAttribute("data-status")) === "xfer", `payment ${await line("Pembayaran").getAttribute("data-status")}`);
    ok((await line("Pembayaran").innerText()).includes("BCA"), "the payment isn't paired with BCA");
    await noSideScroll("Bill"); await shot(page, shots, "s16-02-bill-375");
  });

  await s.check("FINNY-154.5 a line names its card; a foreign charge its rate", async () => {
    await line("Streaming Plus").click();
    const d = page.getByRole("dialog"); await d.waitFor();
    const t = (await d.innerText()).replace(/\s+/g, " ");
    ok(t.includes("5 Dec 2026 · Mastercard Contoh ·· 4821 · BCA credit card") && t.includes("USD 12,00 at 18.000,00"), t.slice(0, 200));
    await page.waitForTimeout(500); await page.screenshot({ path: path.join(shots, "s16-03-line-375.png") });
    await page.keyboard.press("Escape"); await d.waitFor({ state: "detached" });
  });

  await s.check("FINNY-154.5 saved into the one card account; the card owes the bill; reading it again is refused", async () => {
    const save = page.getByRole("button", { name: /^Save \d+ new lines?$/ });
    ok((await save.innerText()) === "Save 4 new lines", await save.innerText());
    await save.click();
    await page.getByRole("status").filter({ hasText: "Saved 4 lines" }).waitFor({ timeout: 15000 });
    const card = await acc("BCA Card"); ok(card.card.used === 78_940_000, `owed ${card.card.used}`);
    ok((await acc("BCA")).balanceSen === 450_000_000, `BCA ${(await acc("BCA")).balanceSen}`);
    const all = await txns();
    const fee = all.find((t) => t.description.startsWith("Biaya Iuran") && t.accountId === A["BCA Card"].id);
    ok(fee && fee.on === "2027-01-03" && fee.amountSen === 12_500_000, JSON.stringify(fee));
    const fx = all.find((t) => t.description.startsWith("Streaming Plus") && t.accountId === A["BCA Card"].id);
    ok(fx && fx.on === "2026-12-05" && fx.amountSen === 21_600_000 && fx.categoryId === C.Langganan.id, JSON.stringify(fx));
    ok(all.filter((t) => t.accountId === A["BRI Card"].id).length === 0, "something went to the other card");
    await page.goto(base + "/import/statements"); await choose();
    await page.getByRole("alert").filter({ hasText: "You saved this statement" }).waitFor({ timeout: 20000 });
  });

  await s.check("accessibility; desktop", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    await scan("bill read again");
    await page.goto(base + "/import/statements"); await page.getByText("Monthly bill · every BCA card on it").waitFor(); await scan("start");
    await page.setViewportSize({ width: 1280, height: 860 });
    await choose(); await page.getByTestId("balance").waitFor({ timeout: 20000 });
    await noSideScroll("desktop"); await shot(page, shots, "s16-04-bill-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
