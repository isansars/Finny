// Sprint 18 (v0.18.0) QA, 🐧 Bubbles: every transaction, to check (FINNY-168), on a production build with made-up records.
// Last month (P) holds 7 transactions worked by hand: Gaji +15.000.000, a transfer 2.000.000, Kopi 45.000 twice on one day
// (a twin), Bensin 150.000, Makan malam 1.200.000 (10× the 120.000 usual from the month before) and Kedai Kopi 32.000 read
// from a statement. Out 1.472.000 · In 15.000.000 · 3 need a look.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");
const path = require("node:path");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint18");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const sm = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const P = sm(today.slice(0, 7), -1), PP = sm(today.slice(0, 7), -2);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
  const j = async (method, u, data) => { const r = await page.request.fetch(`${base}/api/${u}`, { method, data, headers: { "content-type": "application/json" } }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const foot = async () => (await page.getByTestId("tx-foot").innerText()).replace(/\s+/g, " ");
  const rows = () => page.getByTestId("tx-row");
  const settle = async () => { await page.waitForLoadState("networkidle"); await page.waitForTimeout(250); };
  const waitFoot = async (t) => { try { await page.waitForFunction((x) => document.querySelector('[data-testid="tx-foot"]')?.textContent?.replace(/\s+/g, " ").includes(x), t, { timeout: 15000 }); }
    catch { throw new Error(`waited for "${t}" in the footer; it says "${await page.getByTestId("tx-foot").innerText().catch(() => "(no footer)")}" at ${page.url().replace(base, "")}`); } };
  const chip = async (k) => (await page.getByTestId(`chip-${k}`).innerText()).replace(/\s+/g, " ");
  const axe = async () => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`);

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await j("DELETE", "me/data", { confirm: "DELETE" });
  const A = {};
  for (const [k, n, t, o, x] of [["bca", "BCA", "bank", "20.000.000"], ["cash", "Tunai", "cash", "5.000.000"], ["cc", "CC Contoh", "card", "0", { limit: "10.000.000" }]])
    A[k] = (await j("POST", "accounts", { name: n, type: t, opening: o, openingOn: "2025-01-01", ...(x || {}) })).body;
  await j("POST", "categories/starter", {});
  const cats = (await j("GET", "categories")).body; const list = Array.isArray(cats) ? cats : cats.categories;
  const C = (n) => list.find((c) => c.name === n);
  const kopi = C("Beli Kopi"), makan = C("Makan di Luar"), bensin = C("Biaya Bensin"), jajan = C("Beli Jajanan"), gaji = list.find((c) => c.kind === "income");
  const add = async (d) => (await j("POST", "transactions", d)).body;
  for (const [day, amt] of [["05", "100.000"], ["12", "120.000"], ["20", "140.000"]]) await add({ kind: "spend", amount: amt, accountId: A.cash.id, categoryId: makan.id, description: "Makan", on: `${PP}-${day}` });
  const T = {};
  T.gaji = await add({ kind: "income", amount: "15.000.000", accountId: A.bca.id, categoryId: gaji.id, description: "Gaji", on: `${P}-01` });
  T.xfer = await add({ kind: "transfer", amount: "2.000.000", accountId: A.bca.id, toAccountId: A.cc.id, description: "Bayar kartu", on: `${P}-02` });
  T.kopi1 = await add({ kind: "spend", amount: "45.000", accountId: A.bca.id, categoryId: kopi.id, description: "Kopi", on: `${P}-05` });
  T.kopi2 = await add({ kind: "spend", amount: "45.000", accountId: A.bca.id, categoryId: kopi.id, description: "Kopi", on: `${P}-05` });
  T.bensin = await add({ kind: "spend", amount: "150.000", accountId: A.cash.id, categoryId: bensin.id, description: "Bensin", on: `${P}-10` });
  T.makan = await add({ kind: "spend", amount: "1.200.000", accountId: A.cash.id, categoryId: makan.id, description: "Makan malam", on: `${P}-18` });
  const st = await j("POST", "statements", { accountId: A.bca.id, bank: "bca", bankName: "BCA", periodFrom: `${P}-01`, periodTo: `${P}-28`, fileHash: "a".repeat(64),
    lines: [{ on: `${P}-07`, kind: "spend", sen: 3_200_000, accountId: A.bca.id, categoryId: kopi.id, description: "Kedai Kopi" }] });
  ok(st.status === 200 && st.body.added === 1, `statement ${st.status} ${JSON.stringify(st.body).slice(0, 120)}`);

  await s.check("FINNY-168.1 Transactions in the laptop bar and Settings; Home's \"See every transaction\" opens its month", async () => {
    await page.goto(base + "/"); await page.getByRole("button", { name: "Previous month" }).click(); await page.getByTestId("see-all").waitFor();
    await page.getByTestId("see-all").click(); await page.waitForURL(new RegExp(`/transactions\\?month=${P}`)); await settle();
    ok((await page.title()) === "Transactions · Finny", await page.title());
    ok((await page.locator(".fy-topbar a[aria-current=page]").innerText()) === "Transactions", "bar");
    ok((await page.getByLabel("Month").inputValue()) === P, `month ${await page.getByLabel("Month").inputValue()}`);
    const heads = await page.locator("[data-testid=tx-table] thead th").allInnerTexts();
    ok(["Date", "Description", "Category", "Account", "From", "Amount"].every((h) => heads.some((x) => x.startsWith(h))), heads.join("|"));
    await waitFoot("7 transactions"); ok((await foot()).includes("Out Rp 1.472.000 · In Rp 15.000.000"), await foot());
    const xfer = (await rows().filter({ hasText: "Bayar kartu" }).innerText()).replace(/\s+/g, " ");
    ok(xfer.includes("BCA → CC Contoh") && xfer.includes("Transfer"), xfer);
    ok((await rows().filter({ hasText: "Kedai Kopi" }).innerText()).includes("Statement"), "source");
    await shot(page, shots, "s18-01-table-1440");
    await page.goto(base + "/settings"); ok(await page.getByRole("link", { name: "Every transaction" }).isVisible(), "Settings row");
  });

  await s.check("FINNY-168.2 filters, search, source chips and sort, against hand-worked totals; kept in the URL", async () => {
    await page.goto(`${base}/transactions?month=${P}`); await waitFoot("7 transactions");
    ok((await chip("all")) === "All 7" && (await chip("look")) === "Needs a look 3" && (await chip("typed")) === "Typed 6" && (await chip("statement")) === "From a statement 1" && (await chip("workbook")) === "From the workbook 0", `${await chip("all")} ${await chip("look")} ${await chip("typed")}`);
    await page.getByLabel("Kind").selectOption("spend"); await waitFoot("5 transactions"); ok((await foot()).includes("Out Rp 1.472.000 · In Rp 0"), await foot());
    await page.getByLabel("Kind").selectOption(""); await page.getByLabel("Account").selectOption(A.cash.id); await waitFoot("2 transactions");
    ok((await foot()).includes("Out Rp 1.350.000"), await foot());
    await page.getByLabel("Account").selectOption(""); await page.getByLabel("Category").selectOption(kopi.id); await waitFoot("3 transactions");
    await page.getByLabel("Category").selectOption(""); await page.getByLabel("Search transactions").fill("kedai"); await waitFoot("1 transaction ");
    ok(page.url().includes("q=kedai"), page.url()); await page.reload(); await waitFoot("1 transaction "); ok((await page.getByLabel("Search transactions").inputValue()) === "kedai", "search kept after a reload");
    await page.getByLabel("Search transactions").fill(""); await waitFoot("7 transactions");
    await page.getByTestId("chip-statement").click(); await waitFoot("1 transaction "); await page.getByTestId("chip-all").click(); await waitFoot("7 transactions");
    await page.getByRole("button", { name: /^Amount/ }).click(); await settle();
    ok((await rows().first().innerText()).includes("Gaji"), `biggest first: ${await rows().first().innerText()}`);
    await page.getByRole("button", { name: /^Amount/ }).click(); await settle();
    ok((await rows().first().innerText()).includes("Kedai Kopi"), `smallest first: ${await rows().first().innerText()}`);
    ok((await page.locator("th[aria-sort]").getAttribute("aria-sort")) === "ascending", "aria-sort");
    await page.getByLabel("Month").selectOption("all"); await waitFoot("10 transactions");
  });

  await s.check("FINNY-168.4 Needs a look: Twice? on both Kopi, 10× usual on Makan malam; Looks fine clears one for good", async () => {
    await page.goto(`${base}/transactions?month=${P}&look=1`); await waitFoot("3 transactions");
    const t = (await page.getByTestId("tx-table").innerText()).replace(/\s+/g, " ");
    ok((t.match(/Twice\?/g) || []).length === 2 && t.includes("10× usual"), t.slice(0, 300));
    ok((await page.locator(".fy-note").innerText()).includes("same amount twice"), "explanation");
    await shot(page, shots, "s18-02-needs-a-look-1440");
    await page.getByRole("button", { name: new RegExp(`^Edit Makan malam`) }).click(); const d = page.getByRole("dialog"); await d.waitFor();
    await d.getByRole("button", { name: "Looks fine" }).click(); await d.waitFor({ state: "detached" }); await waitFoot("2 transactions");
    await page.reload(); await waitFoot("2 transactions"); ok((await chip("look")) === "Needs a look 2", await chip("look"));
    // A changed amount may be a new mistake: the mark goes and the guess comes back.
    const r = await j("PATCH", `transactions/${T.makan.id}`, { amount: "1.300.000" }); ok(r.status === 200 && r.body.looksOk === false, JSON.stringify(r.body).slice(0, 100));
    await page.reload(); await waitFoot("3 transactions"); ok((await page.getByTestId("tx-table").innerText()).includes("10× usual"), "back after the change");
    await j("PATCH", `transactions/${T.makan.id}`, { amount: "1.200.000" });
  });

  await s.check("FINNY-168.3 fix and delete one: the edit dialog from a row; delete asks first; the twin goes away", async () => {
    await page.goto(`${base}/transactions?month=${P}`); await waitFoot("7 transactions");
    await page.getByRole("button", { name: `Edit Bensin, 10 ${MONTHS[Number(P.slice(5)) - 1].slice(0, 3)}` }).click(); const d = page.getByRole("dialog"); await d.waitFor();
    await d.getByLabel("What for").fill("Bensin Pertamax"); await d.getByRole("button", { name: "Save changes" }).click(); await d.waitFor({ state: "detached" });
    await page.getByText("Bensin Pertamax").waitFor();
    const before = (await j("GET", "accounts")).body.find((a) => a.id === A.bca.id).balanceSen;
    await page.getByRole("button", { name: /^Delete Kopi/ }).first().click(); await waitFoot("6 transactions");
    ok((await chip("look")) === "Needs a look 1", `the twin is gone: ${await chip("look")}`);
    ok((await j("GET", "accounts")).body.find((a) => a.id === A.bca.id).balanceSen === before + 4_500_000, "BCA balance follows");
  });

  await s.check("FINNY-168.5 several at once: the bar's count and total, change category (transfers and income kept), delete", async () => {
    await page.goto(`${base}/transactions?month=${P}`); await waitFoot("6 transactions");
    const pick = async (n) => page.getByRole("checkbox", { name: new RegExp(`^Pick ${n}`) }).check();
    await pick("Bensin Pertamax"); await pick("Kedai Kopi");
    ok((await page.getByTestId("bulk").innerText()).replace(/\s+/g, " ").includes("2 selected · −Rp 182.000"), await page.getByTestId("bulk").innerText());
    await shot(page, shots, "s18-03-bulk-1440");
    await page.getByRole("button", { name: "Change category" }).click(); await page.getByLabel("New category").selectOption(jajan.id);
    await page.getByRole("button", { name: "Change 2" }).click(); await page.getByTestId("bulk").waitFor({ state: "detached" });
    const all = (await j("GET", `transactions/table?month=${P}&limit=50`)).body.items;
    ok(all.filter((r) => r.categoryId === jajan.id).length === 2, "two moved to Beli Jajanan");
    await pick("Gaji"); await pick("Bayar kartu"); await pick("Makan malam");
    await page.getByRole("button", { name: "Change category" }).click(); await page.getByLabel("New category").selectOption(kopi.id); await page.getByRole("button", { name: "Change 3" }).click();
    await page.getByRole("alert").filter({ hasText: "2 of them kept their category" }).waitFor();
    const after = (await j("GET", `transactions/table?month=${P}&limit=50`)).body.items;
    ok(after.find((r) => r.id === T.gaji.id).categoryId === gaji.id && after.find((r) => r.id === T.xfer.id).categoryId === null && after.find((r) => r.id === T.makan.id).categoryId === kopi.id, "only the spend changed");
    await j("POST", "transactions/bulk", { ids: [T.makan.id], action: "category", categoryId: makan.id });
    await page.reload(); await waitFoot("6 transactions");
    await page.getByRole("checkbox", { name: "Pick all on this page" }).check();
    ok((await page.getByTestId("bulk").innerText()).includes("6 selected"), "pick all");
    await page.getByRole("button", { name: "Clear the selection" }).click(); await page.getByTestId("bulk").waitFor({ state: "detached" });
    await pick("Bensin Pertamax"); await pick("Kedai Kopi"); await page.getByRole("button", { name: "Delete 2" }).click(); await waitFoot("4 transactions");
  });

  await s.check("FINNY-168.6 safe: a foreign id refuses the whole request; the CSV has exactly the filtered rows", async () => {
    const r = await j("POST", "transactions/bulk", { ids: [T.gaji.id, "0b6f1a52-0000-4000-8000-000000000001"], action: "delete" });
    ok(r.status === 404, `foreign id ${r.status}`); ok((await j("GET", `transactions/table?month=${P}`)).body.count === 4, "nothing deleted");
    ok((await j("POST", "transactions/bulk", { ids: [], action: "delete" })).status === 400, "no ids");
    ok((await j("POST", "transactions/bulk", { ids: [T.gaji.id], action: "explode" })).status === 400, "unknown action");
    const csv = await (await page.request.get(`${base}/api/transactions/csv?month=${P}`)).text();
    const lines = csv.trim().split("\n"); ok(lines.length === 5 && lines[0].includes("needs_a_look") && lines[0].includes("from"), lines.join(" / ").slice(0, 300));
    ok(csv.includes("Makan malam") && csv.includes("10x usual"), "the guess in the CSV");
    const spend = await (await page.request.get(`${base}/api/transactions/csv?month=${P}&kind=spend`)).text(); ok(spend.trim().split("\n").length === 3, "filtered CSV");
  });

  await s.check("FINNY-168.7 the phone: rows, Select and the bar; the keyboard ticks rows on a laptop; axe; no sideways scroll", async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${base}/transactions?month=${P}`); await waitFoot("4 ·");
    ok((await page.getByTestId("tx-table").count()) === 0 && (await rows().count()) === 4, "rows, not a table");
    await page.getByRole("button", { name: "Select" }).click(); await page.getByRole("button", { name: /^Pick Gaji/ }).click(); await page.getByRole("button", { name: /^Pick Makan malam/ }).click();
    ok((await page.getByTestId("bulk").innerText()).replace(/\s+/g, " ").includes("2 selected · +Rp 13.800.000"), await page.getByTestId("bulk").innerText());
    await page.screenshot({ path: path.join(shots, "s18-04-phone-select.png") });
    ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), "phone sideways");
    let v = await axe(); ok(!v.length, `phone: ${v.join(" | ")}`);
    await page.getByRole("button", { name: "Done" }).click();
    for (const w of [1024, 1440]) { await page.setViewportSize({ width: w, height: 900 }); await page.goto(`${base}/transactions?month=${P}`); await waitFoot("4 transactions"); const wideEls = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 ? [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map((e) => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().right)}`) : []); ok(!wideEls.length, `${w} sideways: ${wideEls.join(", ")}`); }
    v = await axe(); ok(!v.length, `laptop: ${v.join(" | ")}`);
    await page.getByRole("checkbox", { name: /^Pick Gaji/ }).focus(); await page.keyboard.press("Space");
    ok((await page.getByTestId("bulk").innerText()).includes("1 selected"), "Space ticks");
    await page.keyboard.press("Tab"); ok(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Edit ")), "Tab reaches the row's edit");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await j("DELETE", "me/data", { confirm: "DELETE" });
  await b.close();
  s.done();
};
