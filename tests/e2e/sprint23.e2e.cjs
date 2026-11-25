// Sprint 23 (v0.23.0) QA, 🐧 Bubbles: balances you can trust (FINNY-207, FINNY-205), on a production build, as a phone
// (390 × 844) and a laptop, with the made-up statements from tests/fixtures/statements/make-pdfs.mjs: a Mandiri Livin'
// statement (a transfer from Krom, a card payment a fee apart from Finny's, a person who owes the owner, two alike on one day),
// a Mandiri credit card bill, and a Krom month with a Booster pocket. Every name and number is invented.
const path = require("node:path");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const FIX = path.join(__dirname, "..", "fixtures", "statements");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint23");
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const axe = async (pg) => (await new AxeBuilder({ page: pg }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`);
  const flat = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
  const lines = () => page.getByTestId("stmt-line");
  const line = (text) => lines().filter({ hasText: text });
  const choose = async (file) => {
    await page.goto(base + "/import/statements");
    await page.waitForFunction(() => { const i = document.querySelector('input[type="file"]'); return i && !i.disabled; });
    await page.locator("#main").getByLabel("Choose a PDF statement").setInputFiles(path.join(FIX, file));
  };
  const add = (d) => json("transactions", { method: "POST", data: d });
  const acc = async (n) => (await json("accounts")).body.find((a) => a.name === n);

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  const A = {};
  for (const [name, type, opening, openingOn, extra] of [["BCA", "bank", "5.000.000", "2026-01-01", {}], ["Krom", "bank", "1.001.000", "2026-10-01", {}], ["Mandiri", "bank", "1.033.013", "2026-11-01", {}],
    ["CC Mandiri", "card", "-2.150.000", "2026-09-18", { limit: "20.000.000" }]])
    A[name] = (await json("accounts", { method: "POST", data: { name, type, opening, openingOn, ...extra } })).body;
  const C = {};
  for (const [name, kind] of [["Lainnya", "expense"], ["Tarik Tunai", "expense"], ["Transport", "expense"]]) C[name] = (await json("categories", { method: "POST", data: { name, kind } })).body;
  // Already in Finny: Mandiri's card payment typed with the bank's Rp 2.500 fee, one of two cash withdrawals, and BCA's payment of the October bill.
  await add({ kind: "transfer", amount: "3.565.726", accountId: A.Mandiri.id, toAccountId: A["CC Mandiri"].id, description: "Bayar CC Mandiri", on: "2026-11-03" });
  await add({ kind: "spend", amount: "100.000", accountId: A.Mandiri.id, categoryId: C["Tarik Tunai"].id, description: "Tarik Tunai ATM", on: "2026-11-20" });
  await add({ kind: "transfer", amount: "2.152.500", accountId: A.BCA.id, toAccountId: A["CC Mandiri"].id, description: "Bayar CC Mandiri", on: "2026-10-01" });

  await s.check("FINNY-207.1 Owed to me: a new account type with its own group, counted in net worth; lending is a transfer", async () => {
    await page.goto(base + "/accounts?add=1");
    const form = page.getByRole("form", { name: "Add an account" }); await form.waitFor();
    await form.getByLabel("Type").selectOption("owed");
    await form.getByText("Who owes you").waitFor();
    await form.getByLabel("Who owes you").fill("Rina (owes me)");
    await form.getByLabel("They owe you now").fill("2.500.000");
    ok((await flat(page.getByTestId("owed-note"))).includes("Neither is spending or income"), await flat(page.getByTestId("owed-note")));
    await page.waitForTimeout(300); await page.screenshot({ path: path.join(shots, "s23-01-new-owed.png") });
    await form.getByRole("button", { name: "Add account" }).click(); await form.waitFor({ state: "detached" });
    A.Rina = await acc("Rina (owes me)");
    ok(A.Rina.type === "owed" && A.Rina.balanceSen === 2_500_000_00, JSON.stringify(A.Rina));
    await add({ kind: "transfer", amount: "1.000.000", accountId: A.BCA.id, toAccountId: A.Rina.id, description: "Pinjam Rina", on: "2026-11-02" });
    await page.reload();
    const g = page.getByTestId("group-Owed to you"); await g.waitFor();
    const t = await flat(g);
    for (const w of ["Owed to you", "Rp 3.500.000", "Lent Rp 3.500.000 · paid back Rp 0"]) ok(t.includes(w), `no "${w}" in ${t}`);
    const ov = (await json("assets")).body;
    ok(ov.groups?.owed?.sen === 3_500_000_00, `net worth group ${JSON.stringify(ov.groups?.owed)}`);
    await shot(page, shots, "s23-02-accounts");
    const v = await axe(page); ok(!v.length, v.join(" | "));
  });

  await s.check("FINNY-207.2/3/4/5 a bank statement: a person to their account, a transfer already in a fee apart, two alike both kept", async () => {
    await choose("mandiri-livin.pdf");
    await page.getByTestId("balance").waitFor({ timeout: 20000 });
    ok(await page.getByLabel("Into account").inputValue() === A.Mandiri.id, "Mandiri not guessed");
    ok((await lines().count()) === 7, `lines ${await lines().count()}: ${(await lines().allInnerTexts()).map((x) => x.replace(/\s+/g, " ")).join(" | ")}`);
    const rina = await flat(line("Rina Wijaya").first());
    ok(rina.includes("To Rina (owes me) · owes you Rp 500.000 more") && rina.includes("Transfer"), rina);
    const pay = await flat(line("Pembayaran kartu kredit").first());
    ok(pay.includes("Already in: to CC Mandiri, 3 Nov · Rp 2.500 apart (a fee)") && pay.includes("Already in"), pay);
    const krom = await flat(line("Dari Krom").first()); ok(krom.includes("From Krom"), krom);
    const atm = line("Tarik Tunai ATM"); ok((await atm.count()) === 2, "two ATM lines");
    const both = [await flat(atm.nth(0)), await flat(atm.nth(1))];
    ok(both.every((x) => x.includes("one of 2 alike on this day")), both.join(" | "));
    ok(both.filter((x) => x.includes("Already in")).length === 1 && both.filter((x) => x.includes("New")).length === 1, both.join(" | "));
    await shot(page, shots, "s23-03-statement");
    const v = await axe(page); ok(!v.length, v.join(" | "));
    await page.getByRole("button", { name: "Save 5 new lines" }).click();
    await page.getByRole("status").filter({ hasText: "Saved 5 lines" }).waitFor({ timeout: 15000 });
    ok((await acc("Rina (owes me)")).balanceSen === 4_000_000_00, "Rina owes 4.000.000 after the statement");
    ok((await acc("Mandiri")).balanceSen === 352_287_00, `Mandiri ${(await acc("Mandiri")).balanceSen}`);
  });

  await s.check("FINNY-207.4/6 the Mandiri card bill: named, read, its payment already in from BCA a fee apart", async () => {
    await choose("mandiri-card.pdf");
    await page.getByTestId("bill-name").waitFor({ timeout: 20000 });
    ok(await page.getByLabel("Into account").inputValue() === A["CC Mandiri"].id, "CC Mandiri not guessed");
    ok((await flat(page.getByTestId("bill-name"))) === "Mandiri credit card bill · card ending 7731 · 17 Oct", await flat(page.getByTestId("bill-name")));
    ok((await flat(page.getByTestId("due"))) === "Due 6 Nov · minimum Rp 50.000", await flat(page.getByTestId("due")));
    ok((await lines().count()) === 5, `lines ${await lines().count()}`);
    const pay = await flat(line("Payment Thank You").first());
    ok(pay.includes("Already in: from BCA, 1 Oct (1 day earlier) · Rp 2.500 apart (a fee)"), pay);
    const fx = await flat(line("Streaming Plus").first()); ok(fx.includes("USD 12.00"), fx);
    await shot(page, shots, "s23-04-card-bill");
  });

  await s.check("FINNY-207.7 a statement saved before keeps no dates; uploaded again, it adds them without saving lines twice", async () => {
    const hash = createHash("sha256").update(readFileSync(path.join(FIX, "mandiri-card.pdf"))).digest("hex");
    const before = (await json("transactions?limit=500")).body.items.length;
    const saved = await json("statements", { method: "POST", data: { accountId: A["CC Mandiri"].id, bank: "mandiri-card", periodFrom: "2026-09-18", periodTo: "2026-10-17", fileHash: hash,
      lines: [{ on: "2026-10-04", kind: "spend", sen: 300_000_00, accountId: A["CC Mandiri"].id, categoryId: C.Transport.id, description: "Spbu Pertamina Bandung" }] } });
    ok(saved.status === 200, JSON.stringify(saved.body));
    ok(!(await json(`accounts/${A["CC Mandiri"].id}/checkpoints`)).body.points.length, "no dates before");
    await choose("mandiri-card.pdf");
    await page.getByTestId("add-dates").waitFor({ timeout: 20000 });
    await page.getByRole("button", { name: "Add its dates to Check with statements" }).click();
    await page.getByRole("status").filter({ hasText: "dates to Check with statements" }).waitFor();
    const c = (await json(`accounts/${A["CC Mandiri"].id}/checkpoints`)).body;
    ok(c.points.length === 2 && c.points[1].bankSen === -971_000_00, JSON.stringify(c.points));
    ok((await json("transactions?limit=500")).body.items.length === before + 1, "lines saved twice");
  });

  await s.check("FINNY-207.6 Krom with a Booster pocket: pocket moves left out, interest and tax kept, the balance matches", async () => {
    await choose("krom-pockets.pdf");
    await page.getByTestId("balance").waitFor({ timeout: 20000 });
    ok(await page.getByLabel("Into account").inputValue() === A.Krom.id, "Krom not guessed");
    const t = await flat(page.locator("main"));
    ok((await lines().count()) === 4, `lines ${await lines().count()}`);
    for (const w of ["Booster: Bunga", "Booster: Pajak", "Pembuatan Deposito"]) ok(t.includes(w), `no "${w}"`);
    ok(!/Pencairan Dana|Tabungan Utama/.test(t) && (await line("Booster").count()) === 2, "a pocket move was read");
    ok((await flat(page.getByTestId("balance"))).includes("Ending balance Rp 775.000 matches Finny"), await flat(page.getByTestId("balance")));
  });

  await s.check("FINNY-207.7 Check with statements: where Finny parted from the bank, each date, the month's lines, the difference", async () => {
    await page.goto(base + "/accounts"); await page.getByRole("button", { name: "Edit Mandiri" }).click();
    await page.getByRole("link", { name: "Check with statements" }).click(); await page.waitForURL(`**/accounts/${A.Mandiri.id}/check`);
    const parted = await flat(page.getByTestId("parted"));
    ok(parted.includes("Parted on 24 Nov 2026") && parted.includes("1 of 2 statement dates match") && parted.includes("Rp 2.500 lower than the bank") && parted.includes("between 1 Nov 2026 and 24 Nov 2026 is missing"), parted);
    const pts = page.getByTestId("point"); ok((await pts.count()) === 2, `points ${await pts.count()}`);
    ok((await flat(pts.nth(0))).includes("Bank Rp 354.787 · Finny Rp 352.287") && (await flat(pts.nth(0))).includes("Rp 2.500 apart"), await flat(pts.nth(0)));
    ok((await flat(pts.nth(1))).includes("Statement and Finny: Rp 1.033.013"), await flat(pts.nth(1)));
    await shot(page, shots, "s23-05-check");
    let v = await axe(page); ok(!v.length, v.join(" | "));
    ok((await page.getByRole("link", { name: "See November 2026's lines" }).getAttribute("href")) === `/transactions?account=${A.Mandiri.id}&month=2026-11`, "lines link");
    await page.getByRole("button", { name: "Add the difference as one line" }).click();
    const dlg = page.getByRole("dialog"); await dlg.waitFor();
    ok((await dlg.getByLabel("Amount").inputValue()).replace(/\D/g, "") === "2500", `amount ${await dlg.getByLabel("Amount").inputValue()}`);
    await page.keyboard.press("Escape"); await dlg.waitFor({ state: "detached" });
    v = await axe(page); ok(!v.length, v.join(" | "));
  });

  await s.check("FINNY-207.8 Possible doubles: reasons, the sure ones ticked, Remove with undo, Not a double", async () => {
    await add({ kind: "transfer", amount: "2.000.000", accountId: A.Krom.id, toAccountId: A.BCA.id, description: "Ke BCA", on: "2026-06-06" });
    await add({ kind: "transfer", amount: "2.000.000", accountId: A.Krom.id, toAccountId: A.BCA.id, description: "Dari Krom", on: "2026-06-08" });
    await add({ kind: "transfer", amount: "1.250.000", accountId: A.Krom.id, toAccountId: A["CC Mandiri"].id, description: "Bayar CC", on: "2026-03-14" });
    await add({ kind: "transfer", amount: "1.252.500", accountId: A.BCA.id, toAccountId: A["CC Mandiri"].id, description: "Pembayaran", on: "2026-03-15" });
    await add({ kind: "spend", amount: "100.000", accountId: A.BCA.id, categoryId: C.Lainnya.id, description: "GOPAY TOPUP", on: "2026-07-02" });
    await add({ kind: "spend", amount: "100.000", accountId: A.BCA.id, categoryId: C.Lainnya.id, description: "Gopay Topup", on: "2026-07-02" });
    const n0 = (await json("transactions?limit=500")).body.items.length;
    await page.goto(base + "/settings"); await page.getByRole("link", { name: "Possible doubles" }).click(); await page.waitForURL("**/settings/doubles");
    await page.getByTestId("double").first().waitFor();
    for (const g of ["card", "transfer", "same-day"]) ok(await page.getByTestId(`group-${g}`).isVisible(), `no ${g} group`);
    const card = await flat(page.getByTestId("group-card")); ok(card.includes("A card payment added twice") && card.includes("Rp 2.500 apart"), card);
    const tr = await flat(page.getByTestId("group-transfer")); ok(tr.includes("A transfer seen by both banks") && tr.includes("(2 days apart)"), tr);
    const same = page.getByTestId("group-same-day");
    ok((await same.getByRole("checkbox").first().getAttribute("aria-checked")) === "false", "a look-alike is ticked");
    const sure = await page.getByRole("checkbox", { checked: true }).count();
    ok(sure === 2, `ticked ${sure}`);
    const listed = await page.getByTestId("double").count();
    await shot(page, shots, "s23-06-doubles");
    const v = await axe(page); ok(!v.length, v.join(" | "));
    await page.getByRole("button", { name: "Remove 2" }).click();
    await page.getByTestId("removed").waitFor();
    ok((await json("transactions?limit=500")).body.items.length === n0 - 2, "two removed");
    await page.getByTestId("removed").getByRole("button", { name: "Undo" }).click();
    await page.getByTestId("removed").waitFor({ state: "detached" });
    ok((await json("transactions?limit=500")).body.items.length === n0, "undo brought them back");
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="double"]').length === n, listed);
    const before = listed;
    await same.getByRole("button", { name: "Not a double" }).first().click();
    await page.waitForFunction((n) => document.querySelectorAll('[data-testid="double"]').length === n - 1, before, { timeout: 8000 }).catch(() => {});
    const after = await page.getByTestId("double").count();
    ok(after === before - 1, `doubles ${before} → ${after}: ${(await page.getByTestId("double").allInnerTexts()).map((x) => x.replace(/\s+/g, " ")).join(" | ")} ${await flat(page.locator("main"))}`.slice(0, 900));
    ok((await json("transactions/doubles")).body.doubles.every((d) => d.reason !== "same-day" || !d.remove.description.match(/gopay/i)), "the look-alike is still listed");
  });

  await s.check("laptop and dark: Check with statements and Possible doubles; nothing sideways at 360 px", async () => {
    for (const [name, opts] of [["laptop", { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }], ["dark", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" }]]) {
      const c2 = await b.newContext(opts); await c2.addCookies(await ctx.cookies());
      const p2 = await c2.newPage(); p2.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
      await p2.goto(`${base}/accounts/${A.Mandiri.id}/check`); await p2.getByTestId("parted").waitFor();
      await p2.waitForTimeout(300); await p2.screenshot({ path: path.join(shots, `s23-07-check-${name}.png`) });
      let v = await axe(p2); ok(!v.length, `${name} check: ${v.join(" | ")}`);
      await p2.goto(`${base}/settings/doubles`); await p2.getByTestId("double").first().waitFor();
      await p2.waitForTimeout(300); await p2.screenshot({ path: path.join(shots, `s23-08-doubles-${name}.png`) });
      v = await axe(p2); ok(!v.length, `${name} doubles: ${v.join(" | ")}`);
      await c2.close();
    }
    await page.setViewportSize({ width: 360, height: 740 });
    for (const p of [`/accounts/${A.Mandiri.id}/check`, "/settings/doubles", "/accounts"]) {
      await page.goto(base + p); await page.waitForLoadState("networkidle");
      ok(await page.evaluate(() => document.documentElement.scrollWidth <= 361), `${p} scrolls sideways at 360`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  });

  await s.check("FINNY-205 offline: a filter never opened online says it needs a connection (no React error); a visited one opens", async () => {
    const oc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "allow" });
    await oc.addCookies(await ctx.cookies());
    const op = await oc.newPage(); const oerr = []; op.on("pageerror", (e) => oerr.push(e.message));
    await op.goto(base + "/"); await op.evaluate(() => navigator.serviceWorker.ready); await op.reload(); await op.waitForFunction(() => !!navigator.serviceWorker.controller);
    await op.goto(base + "/transactions"); await op.getByTestId("tx-foot").first().waitFor();
    await op.goto(base + "/transactions?month=2026-06"); await op.getByTestId("tx-foot").first().waitFor();
    await oc.setOffline(true);
    await op.goto(base + "/transactions?look=1");
    await op.getByText("This view needs a connection").waitFor();
    await op.screenshot({ path: path.join(shots, "s23-09-offline-filter.png") });
    await op.getByRole("link", { name: "Show the kept list without the filter" }).click();
    await op.getByTestId("tx-foot").first().waitFor();
    await op.goto(base + "/transactions?month=2026-06"); await op.getByTestId("tx-foot").first().waitFor();
    ok((await op.getByLabel("Month").inputValue()) === "2026-06", "the visited filter's page");
    ok(!oerr.length, oerr.join(" | "));
    await oc.setOffline(false); await oc.close();
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
