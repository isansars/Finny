// Sprint 4 (v0.4.0) QA, 🐧 Bubbles: reading bank e-statements (FINNY-14), end to end in a browser, with the made-up
// statements drawn by tests/fixtures/statements/make-pdfs.mjs (BCA, Mandiri, Krom, a locked BRI card, a picture). Never real data.
const path = require("node:path");
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const FIX = path.join(__dirname, "..", "fixtures", "statements");
const pdf = (n) => path.join(FIX, `${n}.pdf`);

module.exports = async ({ base, shots }) => {
  const s = suite("sprint4");
  const { PASSWORD } = await import(path.join(FIX, "make-pdfs.mjs"));
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const acc = async (n) => (await json("accounts")).body.find((a) => a.name === n);
  const noSideScroll = async (l) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${l} scrolls sideways`);
  const lines = () => page.getByTestId("stmt-line");
  const statuses = async () => (await lines().evaluateAll((els) => els.map((e) => e.getAttribute("data-status")))).sort().join(",");
  const line = (text) => lines().filter({ hasText: text }).first();
  const choose = async (name) => { const input = page.getByLabel("Choose a PDF statement"); await page.waitForFunction(() => { const i = document.querySelector('input[type="file"]'); return i && !i.disabled; }); await input.setInputFiles(pdf(name)); };
  const waitCheck = async () => { await page.getByTestId("balance").waitFor({ timeout: 20000 }); };
  // Every request body the page sends, to prove the PDF never leaves the device.
  const bodies = []; page.on("request", (r) => { const d = r.postDataBuffer(); if (d) bodies.push(d); });

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  // Finny before the statements: four accounts, a few categories and a little history.
  const A = {};
  for (const [name, type, opening, extra] of [["Cash", "cash", "0", {}], ["BCA", "bank", "1.500.000", {}], ["Mandiri", "bank", "2.000.000", {}], ["Krom", "bank", "400.000", {}], ["BRI Card", "card", "-800.000", { limit: "20.000.000" }]])
    A[name] = (await json("accounts", { method: "POST", data: { name, type, opening, openingOn: "2026-09-20", ...extra } })).body;
  const C = {};
  for (const [name, kind] of [["Beli Kopi", "expense"], ["Makan di Luar", "expense"], ["Lainnya", "expense"], ["Belanja Online", "expense"], ["Cashback", "income"], ["Gaji", "income"]])
    C[name] = (await json("categories", { method: "POST", data: { name, kind } })).body;
  const add = (d) => json("transactions", { method: "POST", data: d });
  await add({ kind: "spend", amount: "30.000", accountId: A.Cash.id, categoryId: C["Beli Kopi"].id, description: "Kedai Kopi Senja", on: "2026-09-05" });
  await add({ kind: "income", amount: "500", accountId: A.Cash.id, categoryId: C.Cashback.id, description: "Cashback", on: "2026-09-06" });
  await add({ kind: "spend", amount: "250.000", accountId: A.BCA.id, categoryId: C["Belanja Online"].id, description: "Tokopedia", on: "2026-10-03" });
  await add({ kind: "spend", amount: "150.000", accountId: A.Krom.id, categoryId: C.Lainnya.id, description: "Bensin", on: "2026-10-01" });

  await s.check("FINNY-14.1 Settings › Bank statements: the start screen, read on the device", async () => {
    await page.goto(base + "/settings"); await page.getByRole("link", { name: "Read a bank statement" }).click(); await page.waitForURL(base + "/import/statements");
    const t = await page.locator("main").innerText();
    for (const w of ["Choose this month's PDF", "never leave it", "BCA", "Mandiri", "Krom", "BRI credit card", "None yet"]) ok(t.includes(w), `no "${w}"`);
    await noSideScroll("Start"); await shot(page, shots, "s4-01-start-375");
  });

  await s.check("FINNY-14.3 a picture-only PDF is refused with a clear reason", async () => {
    await choose("picture");
    await page.getByRole("alert").filter({ hasText: "picture" }).waitFor({ timeout: 15000 });
    ok((await page.getByRole("alert").filter({ hasText: "picture" }).innerText()).includes("original PDF from your bank"), "no hint");
    await shot(page, shots, "s4-02-picture-375");
  });

  await s.check("FINNY-14.3/4/5/6/8 Krom: the account guessed, New / Transfer / Check, cashback folded, the balance matches", async () => {
    await choose("krom"); await waitCheck();
    ok(await page.getByLabel("Into account").inputValue() === A.Krom.id, "Krom not guessed");
    ok((await page.locator("h1").innerText()) === "October 2026", "title");
    ok(await statuses() === "check,new,new,new,xfer,xfer", await statuses());
    ok((await line("Kedai Kopi Senja").innerText()).includes("Beli Kopi (suggested)"), "kopi suggestion");
    ok((await line("Cashback × 2").innerText()).includes("Cashback"), "cashback folded");
    ok((await line("Warung Bakmi").innerText()).includes("Lainnya"), "fallback category");
    ok(await lines().filter({ hasText: "From Mandiri" }).count() === 1 && await lines().filter({ hasText: "To BCA" }).count() === 1, "transfers paired with Mandiri and BCA");
    ok((await line("Spbu").innerText()).includes("Same amount on 1 Oct"), "check hint");
    ok((await page.getByTestId("balance").innerText()).includes("Ending balance Rp 377.730 matches Finny"), await page.getByTestId("balance").innerText());
    ok(await page.getByRole("tab", { name: "New 5" }).count() === 1 && await page.getByRole("tab", { name: "Check 1" }).count() === 1, "counts");
    await noSideScroll("Check"); await shot(page, shots, "s4-03-krom-check-375");
  });

  await s.check("FINNY-14.6 fix one line: mark the Check line as already in, change a category, add a note", async () => {
    await line("Spbu").click();
    await page.getByRole("radio", { name: "Already in" }).click(); await shot(page, shots, "s4-04-line-sheet-375");
    await page.getByRole("button", { name: "Mark as already in" }).click();
    ok((await line("Spbu").getAttribute("data-status")) === "in", "not marked");
    await line("Warung Bakmi").click();
    await page.getByLabel("Category").selectOption(C["Makan di Luar"].id); await page.getByLabel("Note").fill("lunch with the team");
    await page.getByRole("button", { name: "Keep as new" }).click();
    ok((await line("Warung Bakmi").innerText()).includes("Makan di Luar"), "category not changed");
    await page.getByRole("tab", { name: /^Check/ }).click(); ok(await lines().count() === 0, "check filter");
    await page.getByRole("tab", { name: /^All/ }).click();
  });

  await s.check("FINNY-14.10 nothing is saved before Save; Save saves the 5 lines as one batch; the PDF never left the device", async () => {
    ok((await acc("Krom")).balanceSen === 25_000_000, "saved early");
    await page.getByRole("button", { name: "Save 5 new lines" }).click();
    await page.getByRole("status").filter({ hasText: "Saved 5 lines" }).waitFor({ timeout: 15000 });
    ok((await acc("Krom")).balanceSen === 37_773_000, `Krom ${(await acc("Krom")).balanceSen}`);
    ok((await acc("Mandiri")).balanceSen === 170_000_000 && (await acc("BCA")).balanceSen === 135_000_000, "transfers");
    const all = (await json("transactions?limit=100")).body.items;
    const bakmi = all.find((t) => t.description.startsWith("Warung Bakmi"));
    ok(bakmi && bakmi.categoryId === C["Makan di Luar"].id && bakmi.description.includes("lunch with the team"), JSON.stringify(bakmi));
    ok(all.some((t) => t.description === "Cashback × 2" && t.amountSen === 73_000 && t.kind === "income"), "cashback line");
    ok(bodies.every((d) => d.length < 50_000 && !d.includes(Buffer.from("%PDF"))), "the PDF was sent");
    ok((await page.getByTestId("statements").innerText()).includes("Krom · October 2026"), "not under Read before");
    await shot(page, shots, "s4-05-saved-375");
  });

  await s.check("FINNY-14.2 a locked PDF asks for its password; a wrong one says so; the password isn't kept", async () => {
    await choose("bri-card");
    await page.getByLabel("PDF password").waitFor({ timeout: 15000 }); await shot(page, shots, "s4-06-password-375");
    await page.getByLabel("PDF password").fill("not-it"); await page.getByRole("button", { name: "Open statement" }).click();
    await page.getByRole("alert").filter({ hasText: "didn't open it" }).waitFor({ timeout: 15000 });
    await page.getByLabel("PDF password").fill(PASSWORD); await page.getByRole("button", { name: "Open statement" }).click();
    await waitCheck();
    ok(await page.evaluate((p) => !document.body.innerHTML.includes(p) && !JSON.stringify(localStorage).includes(p), PASSWORD), "password kept in the page");
    ok(bodies.every((d) => !d.includes(Buffer.from(PASSWORD))), "the password was sent");
  });

  await s.check("FINNY-14.5/7/9 BRI card: the bill, the payment already in, USD and instalments", async () => {
    ok(await page.getByLabel("Into account").inputValue() === A["BRI Card"].id, "card not guessed");
    ok((await page.locator("h1").innerText()) === "October bill", "title");
    // The 800.000 payment: Finny has the BCA → card transfer? Not yet (BCA comes later), so it's a Transfer from a bank.
    ok((await line("Payment").getAttribute("data-status")) === "xfer", await line("Payment").getAttribute("data-status"));
    ok((await line("Cloud.com").innerText()).includes("USD 20.00"), "fx");
    ok((await line("Contoh Elektronik").innerText()).includes("3 of 12"), "instalment");
    ok((await page.getByTestId("balance").innerText()).includes("Bill Rp 1.190.000 matches Finny"), await page.getByTestId("balance").innerText());
    await noSideScroll("Card check"); await shot(page, shots, "s4-07-card-375");
    // The payment came from BCA: mark it so, then save.
    await line("Payment").click(); await page.getByLabel("From account").selectOption(A.BCA.id); await page.getByRole("button", { name: "Keep as transfer" }).click();
    await page.getByRole("button", { name: "Save 6 new lines" }).click();
    await page.getByRole("status").filter({ hasText: "Saved 6 lines" }).waitFor({ timeout: 15000 });
    const card = await acc("BRI Card"); ok(card.card.used === 119_000_000, `owed ${card.card.used}`);
    const cloud = (await json("transactions?limit=100")).body.items.find((t) => t.description.startsWith("Cloud.com"));
    ok(cloud && cloud.amountSen === 33_000_000 && cloud.description.includes("USD 20.00 × 16,500.00"), JSON.stringify(cloud));
  });

  await s.check("FINNY-14.5/9 BCA: already in (typed and transfers), a gap shown, lines needing a choice block Save", async () => {
    await choose("bca"); await waitCheck();
    ok((await line("Tokopedia").getAttribute("data-status")) === "in", "Tokopedia not already in");
    ok((await line("Kartu Kredit").getAttribute("data-status")) === "in", "the card payment (saved from the card side) not already in");
    ok((await line("Kedai Kopi Senja").innerText()).includes("Beli Kopi"), "suggestion");
    // Finny also has Krom's 100.000 into BCA on 10 Oct, which this made-up BCA month doesn't: a gap of Rp 100.000.
    const gap = await page.getByTestId("balance").innerText(); ok(gap.includes("Rp 100.000 apart"), gap);
    ok(await page.getByRole("button", { name: /Save 4 new lines/ }).isDisabled(), "save allowed with a line missing its choice");
    ok((await page.locator(".fy-savebar").innerText()).includes("need a category or account"), "no reason");
    await shot(page, shots, "s4-08-bca-gap-375");
    // Money in from the owner's other bank: dev sign-in has no full name, so the owner says it's a transfer.
    await line("Finny Tester").click(); await page.getByRole("button", { name: "It's a transfer between my accounts" }).click();
    await page.getByLabel("From account").selectOption(A.Mandiri.id); await page.getByRole("button", { name: "Keep as transfer" }).click();
    ok((await line("Finny Tester").getAttribute("data-status")) === "xfer", "not a transfer");
    await line("Contoh Makmur").click(); await page.getByLabel("Category").selectOption(C.Gaji.id); await page.getByRole("button", { name: "Keep as new" }).click();
    await page.getByRole("button", { name: "Save 4 new lines" }).click();
    await page.getByRole("status").filter({ hasText: "Saved 4 lines" }).waitFor({ timeout: 15000 });
  });

  await s.check("FINNY-14.10 the same statement again adds nothing (screen and API)", async () => {
    await choose("bca"); await waitCheck();
    await page.getByRole("alert").filter({ hasText: "You saved this statement" }).waitFor();
    ok(await page.getByRole("button", { name: /Save|Nothing new/ }).isDisabled(), "save enabled");
    const batch = (await json("imports")).body.find((x) => x.kind === "statement" && x.bank === "bca");
    const again = await json("statements", { method: "POST", data: { accountId: A.BCA.id, bank: "bca", periodFrom: "2026-10-01", periodTo: "2026-10-31", fileHash: batch.fileHash, lines: [{ on: "2026-10-12", kind: "spend", sen: 100, accountId: A.BCA.id, categoryId: C.Lainnya.id, description: "x" }] } });
    ok(again.status === 409, `status ${again.status}`);
    await page.getByRole("button", { name: "Back" }).click();
  });

  await s.check("FINNY-14.10 a saved statement is undone as one batch", async () => {
    const before = (await acc("Krom")).balanceSen;
    await page.getByRole("button", { name: /^Undo Krom/ }).click();
    await page.getByRole("status").filter({ hasText: "Removed 5 lines" }).waitFor({ timeout: 15000 });
    ok(before === 37_773_000 && (await acc("Krom")).balanceSen === 25_000_000, `Krom ${(await acc("Krom")).balanceSen}`);
    ok(!(await page.getByTestId("statements").innerText()).includes("Krom"), "still listed");
    await shot(page, shots, "s4-09-undone-375");
  });

  await s.check("FINNY-14 Mandiri: the transfer to Krom matches nothing now (Krom undone) and is a transfer", async () => {
    await choose("mandiri"); await waitCheck();
    ok((await line("Transfer ke Krom").getAttribute("data-status")) === "xfer", await line("Transfer ke Krom").getAttribute("data-status"));
    ok((await line("Gaji Oktober").innerText()).includes("Pick a category"), "income without history needs a choice");
    await page.getByRole("button", { name: "Back" }).click();
  });

  await s.check("Read a statement from an account; a 10-page statement is read in under 3 s on a slowed CPU", async () => {
    await page.goto(base + "/accounts"); await page.getByRole("button", { name: "Edit Mandiri" }).click();
    await page.getByRole("link", { name: "Read a statement" }).click(); await page.waitForURL(/\/import\/statements\?account=/);
    const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const t0 = Date.now(); await choose("bca-long"); await page.getByLabel("Into account").waitFor({ timeout: 30000 }); const ms = Date.now() - t0;
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    console.log(`      10 pages read in ${ms} ms at 4× slower CPU`);
    ok(ms < 3000, `${ms} ms`);
    ok(await page.getByLabel("Into account").inputValue() === A.Mandiri.id, "the account from the link");
  });

  await s.check("desktop: the check screen and the line sheet", async () => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(base + "/import/statements"); await choose("krom");
    await waitCheck();
    await noSideScroll("Desktop"); await shot(page, shots, "s4-10-check-desktop");
    await line("Kedai Kopi Senja").click(); await shot(page, shots, "s4-11-sheet-desktop");
    await page.keyboard.press("Escape");
  });

  await s.check("accessibility: axe finds nothing serious on the start, check and line screens", async () => {
    const scan = async (label) => { const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact));
      ok(!v.length, `${label}: ${v.map((x) => `${x.id} (${x.nodes.length})`).join(", ")}`); };
    await scan("check screen");
    await line("Kedai Kopi Senja").click(); await page.waitForTimeout(300); await scan("line sheet"); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(base + "/import/statements"); await page.waitForTimeout(700); await scan("start screen");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
