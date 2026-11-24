// Sprint 1 (v0.1.0) QA, 🐧 Bubbles: every acceptance criterion of FINNY-13/23/24/25, FINNY-8/26/27/28, FINNY-10/29/30 and
// FINNY-9/31/32, in a real browser against a production build. Numbers are made up. Screenshots at 375 px and 1280 px.
const { suite, ok, browser, shot } = require("./helpers.cjs");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint1");
  const b = await browser();
  const phone = await b.newContext({ viewport: { width: 375, height: 780 }, deviceScaleFactor: 2 });
  const page = await phone.newPage();
  page.on("dialog", (d) => d.accept());
  const api = (path, opts = {}) => page.request.fetch(`${base}/api/${path}`, { ...opts, headers: { "content-type": "application/json" }, data: opts.data });
  const json = async (path, opts) => { const r = await api(path, opts); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const text = (sel) => page.locator(sel).first().innerText();
  const settle = () => page.waitForTimeout(400);

  // ---------- FINNY-13 / 23 / 25: only the owner gets in
  await s.check("FINNY-23.2 every page signed out lands on sign-in and keeps where you were going", async () => {
    for (const p of ["/", "/accounts", "/categories", "/settings"]) {
      await page.goto(base + p); ok(page.url().startsWith(`${base}/login?from=${encodeURIComponent(p)}`), `${p} → ${page.url()}`);
    }
  });
  await s.check("FINNY-23.2 every API route signed out answers 401", async () => {
    const routes = [["GET", "accounts"], ["POST", "accounts"], ["PATCH", "accounts/x"], ["PUT", "accounts/order"], ["GET", "categories"], ["POST", "categories"], ["POST", "categories/starter"],
      ["PATCH", "categories/x"], ["DELETE", "categories/x"], ["POST", "categories/x/merge"], ["GET", "transactions"], ["POST", "transactions"], ["PATCH", "transactions/x"],
      ["DELETE", "transactions/x"], ["GET", "suggest?q=kopi"], ["GET", "entities"], ["GET", "summary"], ["GET", "export"], ["DELETE", "me/data"]];
    for (const [m, p] of routes) { const r = await api(p, { method: m, data: m === "GET" ? undefined : {} }); ok(r.status() === 401, `${m} /api/${p} → ${r.status()}`); }
  });
  await s.check("FINNY-25.1 sign-in page: Continue with Google, usable at 375 px", async () => {
    await page.goto(base + "/login"); ok(await page.getByRole("button", { name: /Continue with Google/ }).isVisible(), "no Google button");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), "scrolls sideways at 375 px");
    await shot(page, shots, "01-sign-in-375");
  });
  await s.check("FINNY-23.1 an address that isn't on the list lands on Not invited and gets no session", async () => {
    await page.goto(base + "/login"); await page.getByLabel("Email").fill("stranger@example.com"); await page.getByRole("button", { name: "Dev sign-in" }).click();
    await page.waitForURL(/not-invited/); ok((await text("h1")) === "Not invited", "no Not invited heading");
    await shot(page, shots, "02-not-invited-375");
    ok((await api("accounts")).status() === 401, "a stranger got a session");
  });
  await s.check("FINNY-23.1 the owner signs in and returns to the page asked for", async () => {
    await page.goto(base + "/accounts"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click();
    await page.waitForURL(`${base}/accounts`); ok((await api("accounts")).status() === 200, "no session after sign-in");
  });
  await s.check("FINNY-23 the session cookie is httpOnly and lasts 30 days", async () => {
    const c = (await phone.cookies()).find((x) => x.name.endsWith("authjs.session-token"));
    ok(c && c.httpOnly, "no httpOnly session cookie"); const days = (c.expires * 1000 - Date.now()) / 864e5; ok(days > 29 && days <= 30.1, `expires in ${days} days`);
  });

  // ---------- FINNY-8 / 27 / 28: accounts
  async function addAccount({ name, type, opening, limit, day }) {
    await page.goto(base + "/accounts"); await page.getByRole("button", { name: "New account" }).click();
    const f = page.getByRole("dialog"); await f.getByLabel("Name").fill(name); await f.getByLabel("Type").selectOption(type);
    if (opening) await f.getByLabel(/Opening balance|Owed on the opening date/).fill(opening);
    if (limit) await f.getByLabel("Limit").fill(limit);
    if (day) await f.getByLabel("Statement day").fill(day);
    await f.getByRole("button", { name: "Add account" }).click(); await f.waitFor({ state: "detached" });
  }
  await s.check("FINNY-8.1/2 add accounts of every type with an opening balance; a card with limit and statement day", async () => {
    await addAccount({ name: "BCA", type: "bank", opening: "1.250.000" });
    await addAccount({ name: "Kas Tunai", type: "cash", opening: "450000" });
    await addAccount({ name: "GoPay", type: "ewallet" });
    await addAccount({ name: "CC Mandiri", type: "card", opening: "200.000", limit: "36.000.000", day: "25" });
    await addAccount({ name: "ShopeePinjam", type: "loan", opening: "3.000.000" });
    const { body } = await json("accounts");
    ok(body.length === 5, `${body.length} accounts`);
    const cc = body.find((a) => a.name === "CC Mandiri");
    ok(cc.openingSen === -20000000 && cc.limitSen === 3600000000 && cc.statementDay === 25, JSON.stringify(cc));
  });
  await s.check("FINNY-8.3 balances are computed; a card shows used and available", async () => {
    await page.goto(base + "/accounts"); await settle();
    ok((await text('[data-testid="account-BCA"]')).includes("1.250.000"), "BCA balance");
    const cc = await text('[data-testid="account-CC Mandiri"]');
    ok(cc.includes("Rp 200.000") && cc.includes("owed") && cc.includes("Rp 35,8 jt left of 36 jt"), cc);
  });
  await s.check("FINNY-8.5 all accounts on one page, grouped by type, with a total", async () => {
    for (const g of ["Cash & bank", "E-wallets", "Credit cards", "Loans & paylater"]) ok(await page.getByTestId(`group-${g}`).isVisible(), `no ${g} group`);
    // 1.250.000 + 450.000 + 0 − 200.000 − 3.000.000
    ok((await text('[data-testid="accounts-total"]')) === "−Rp 1.500.000", await text('[data-testid="accounts-total"]'));
  });
  await s.check("FINNY-8.1 rename and reorder an account", async () => {
    await page.getByRole("button", { name: "Edit Kas Tunai" }).click(); const f = page.getByRole("dialog");
    await f.getByLabel("Name").fill("Dompet"); await f.getByRole("button", { name: "Save changes" }).click(); await f.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Reorder" }).click(); await page.getByRole("button", { name: "Move Dompet up" }).click(); await settle(); await page.getByRole("button", { name: "Done" }).click();
    const names = (await json("accounts")).body.filter((a) => !a.archived).sort((a, b) => a.position - b.position).map((a) => a.name);
    ok(names[0] === "Dompet", names.join(","));
  });
  await shot(page, shots, "03-accounts-375");

  // ---------- FINNY-10 / 29 / 30: categories
  await s.check("FINNY-10.4 a new Finny offers starter categories in the owner's own words", async () => {
    await page.goto(base + "/categories"); await page.getByRole("button", { name: "Add starter categories" }).click();
    await page.getByTestId("cat-Beli Kopi").waitFor(); ok(await page.getByTestId("cat-Kebutuhan Pribadi").isVisible(), "no group");
  });
  await s.check("FINNY-10.1 a tree by kind: add a third-level category; a fourth level is refused", async () => {
    await page.getByRole("button", { name: "New category" }).click(); let f = page.getByRole("dialog");
    await f.getByLabel("Name").fill("Kopi Susu"); await f.getByLabel("Parent category").selectOption({ label: "  Beli Kopi" });
    await f.getByRole("button", { name: "Add category" }).click(); await f.waitFor({ state: "detached" });
    const cats = (await json("categories")).body; const ks = cats.find((c) => c.name === "Kopi Susu"), bk = cats.find((c) => c.name === "Beli Kopi");
    ok(ks && ks.parentId === bk.id, "Kopi Susu not under Beli Kopi");
    const r = await json("categories", { method: "POST", data: { kind: "expense", name: "Too deep", parentId: ks.id } });
    ok(r.status === 400 && /3 levels/.test(r.body.error), JSON.stringify(r));
    await page.getByRole("tab", { name: "Income" }).click(); ok(await page.getByTestId("cat-Gaji Bulanan").isVisible(), "no income tree");
  });
  await s.check("FINNY-10.2 rename and move a category", async () => {
    await page.getByRole("tab", { name: "Expense" }).click();
    await page.getByRole("button", { name: "Change Beli Jajanan" }).click(); const f = page.getByRole("dialog");
    await f.getByLabel("Name").fill("Jajan"); await f.getByLabel("Parent category").selectOption({ label: "Transportasi" }); // moved, then moved back by API
    await f.getByRole("button", { name: "Save" }).click(); await f.waitFor({ state: "detached" });
    const cats = (await json("categories")).body; const j = cats.find((c) => c.name === "Jajan"), tr = cats.find((c) => c.name === "Transportasi"), kp = cats.find((c) => c.name === "Kebutuhan Pribadi");
    ok(j && j.parentId === tr.id, "not moved"); await json(`categories/${j.id}`, { method: "PATCH", data: { parentId: kp.id } });
  });
  await shot(page, shots, "04-categories-375");

  // ---------- FINNY-9 / 31 / 32: transactions
  // Pick a category tile (opening "All categories" when it isn't among the most used) and account chips.
  async function pickCategory(f, name) {
    const r = f.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name, exact: true });
    if (!(await r.count())) await f.getByRole("button", { name: "All categories", exact: true }).click();
    await r.click();
  }
  const pickAccount = (f, group, name) => f.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name, exact: true }).click();
  async function quickAdd({ kind = "Spend", amount, what, category, account, to, entity, date }) {
    await page.getByRole("button", { name: "Add a transaction" }).first().click();
    const f = page.getByRole("dialog"); await f.getByRole("tab", { name: kind }).click();
    await f.getByLabel("Amount").fill(amount); if (what) await f.getByLabel("What for").fill(what);
    if (category) await pickCategory(f, category);
    if (account) await pickAccount(f, kind === "Transfer" ? "From account" : "Account", account);
    if (to) await pickAccount(f, "To account", to);
    if (entity) { await f.getByRole("button", { name: "Paid to, note" }).click(); await f.getByLabel(/Paid to|From \(optional\)/).fill(entity); }
    if (date) await f.getByLabel("Date").fill(date);
    await f.getByRole("button", { name: "Save", exact: true }).click(); await f.waitFor({ state: "detached" }); await settle();
  }
  const bal = async (name) => (await json("accounts")).body.find((a) => a.name === name).balanceSen;
  await s.check("FINNY-9.1 add a spend at 375 px: amount first, today by default", async () => {
    await page.goto(base + "/"); await page.getByRole("button", { name: "Add a transaction" }).first().click();
    const f = page.getByRole("dialog");
    ok(await f.getByLabel("Date").inputValue() === new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), "date isn't today");
    await f.getByLabel("Amount").fill("43890"); await f.getByLabel("What for").fill("Ngopi di Le Tusa");
    await pickCategory(f, "Beli Kopi"); await pickAccount(f, "Account", "BCA");
    await f.getByRole("button", { name: "Paid to, note" }).click(); await f.getByLabel(/Paid to/).fill("Le Tusa");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= 375), "the form scrolls sideways");
    await shot(page, shots, "05-quick-add-375");
    await f.getByRole("button", { name: "Save", exact: true }).click(); await f.waitFor({ state: "detached" }); await settle();
    ok((await text('[data-testid="txn-list"]')).includes("−43.890"), "not in the list");
  });
  await s.check("FINNY-9.5 balances and totals update at once", async () => {
    ok(await bal("BCA") === 125000000 - 4389000, `BCA ${await bal("BCA")}`);
    ok((await text('[data-testid="spent"]')) === "Rp 43.890", await text('[data-testid="spent"]'));
  });
  await s.check("FINNY-9.3 the category is suggested from history while typing", async () => {
    await page.getByRole("button", { name: "Add a transaction" }).first().click(); const f = page.getByRole("dialog");
    await f.getByLabel("What for").fill("Ngopi di Janji Jiwa");
    await f.getByTestId("suggestion").waitFor(); ok((await f.getByTestId("suggestion").innerText()).includes("Beli Kopi"), "no suggestion");
    await page.waitForTimeout(200);
    ok(await f.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: "Beli Kopi", exact: true }).getAttribute("aria-checked") === "true", "suggestion didn't pick the category");
    ok(await f.getByRole("radiogroup", { name: "Account", exact: true }).getByRole("radio", { name: "BCA", exact: true }).getAttribute("aria-checked") === "true", "last account not remembered");
    await shot(page, shots, "06-suggestion-375");
    await f.getByLabel("Amount").fill("38.000"); await f.getByRole("button", { name: "Save", exact: true }).click(); await f.waitFor({ state: "detached" }); await settle();
  });
  await s.check("FINNY-9.2 a transfer moves money and counts as neither income nor spending", async () => {
    const before = [await bal("BCA"), await bal("GoPay")];
    await quickAdd({ kind: "Transfer", amount: "100.000", what: "Top up GoPay", account: "BCA", to: "GoPay" });
    ok(await bal("BCA") === before[0] - 10000000 && await bal("GoPay") === before[1] + 10000000, "balances didn't move");
    ok((await text('[data-testid="spent"]')) === "Rp 81.890", `spent ${await text('[data-testid="spent"]')}`);
    ok((await text('[data-testid="txn-list"]')).includes("BCA → GoPay"), "transfer row");
  });
  await s.check("FINNY-9.1 income, and paying the card is a transfer", async () => {
    await quickAdd({ kind: "Income", amount: "15.000.000", what: "Gaji November", category: "Gaji Bulanan", account: "BCA", entity: "Kantor" });
    ok((await text('[data-testid="income"]')) === "Rp 15.000.000", await text('[data-testid="income"]'));
    await quickAdd({ kind: "Transfer", amount: "200.000", what: "Bayar CC", account: "BCA", to: "CC Mandiri" });
    const cc = (await json("accounts")).body.find((a) => a.name === "CC Mandiri"); ok(cc.card.used === 0 && cc.card.available === 3600000000, JSON.stringify(cc.card));
  });
  await s.check("FINNY-9.2 a transfer to the same account is refused", async () => {
    const accs = (await json("accounts")).body; const bca = accs.find((a) => a.name === "BCA");
    const r = await json("transactions", { method: "POST", data: { kind: "transfer", amount: "1.000", accountId: bca.id, toAccountId: bca.id } });
    ok(r.status === 400 && /two different/.test(r.body.error), JSON.stringify(r));
  });
  const now = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const lastMonthDay = new Date(Date.UTC(+now.slice(0, 4), +now.slice(5, 7) - 1, 0)).toISOString().slice(0, 10); // the last day of last month
  await s.check("FINNY-31.4 amounts arrive as rupiah text and are stored as sen", async () => {
    const accs = (await json("accounts")).body; const kopi = (await json("categories")).body.find((c) => c.name === "Biaya Bank");
    const r = await json("transactions", { method: "POST", data: { kind: "spend", amount: "2.499,91", accountId: accs.find((a) => a.name === "Dompet").id, categoryId: kopi.id, description: "Admin", on: lastMonthDay } });
    ok(r.status === 200 && r.body.amountSen === 249991, JSON.stringify(r.body));
  });
  await s.check("FINNY-9.6 the list filters by month, account, category and text", async () => {
    await page.goto(base + "/"); await settle();
    await page.getByLabel("Filter by account").selectOption({ label: "GoPay" }); await settle();
    let t = await text('[data-testid="txn-list"]'); ok(t.includes("Top up GoPay") && !t.includes("Gaji"), "account filter");
    await page.getByLabel("Filter by account").selectOption({ label: "All accounts" });
    await page.getByLabel("Filter by category").selectOption({ label: "Kebutuhan Pribadi" }); await settle(); // a parent includes its sub-categories
    t = await text('[data-testid="txn-list"]'); ok(t.includes("Ngopi di Le Tusa") && t.includes("Ngopi di Janji Jiwa") && !t.includes("Gaji"), "category filter");
    await page.getByLabel("Filter by category").selectOption({ label: "All categories" });
    await page.getByLabel("Search transactions").fill("tusa"); await page.waitForTimeout(700);
    t = await text('[data-testid="txn-list"]'); ok(t.includes("Le Tusa") && !t.includes("Janji Jiwa"), "search");
    await page.getByLabel("Search transactions").fill(""); await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Previous month" }).click(); await settle();
    t = await text('[data-testid="txn-list"]'); ok(t.includes("Admin") && !t.includes("Le Tusa"), "previous month");
    await page.getByRole("button", { name: "Next month" }).click(); await settle();
  });
  await shot(page, shots, "07-home-375");
  await s.check("FINNY-9.5 edit a transaction and delete one (asks first)", async () => {
    await page.getByRole("button", { name: "Edit Ngopi di Janji Jiwa" }).click(); let f = page.getByRole("dialog");
    await f.getByLabel("Amount").fill("40.000"); await f.getByRole("button", { name: "Save changes" }).click(); await f.waitFor({ state: "detached" }); await settle();
    ok((await text('[data-testid="txn-list"]')).includes("−40.000"), "edit didn't show");
    await page.getByRole("button", { name: "Edit Ngopi di Janji Jiwa" }).click(); f = page.getByRole("dialog");
    await f.getByRole("button", { name: "Delete" }).click(); await f.waitFor({ state: "detached" }); await settle();
    ok(!(await text('[data-testid="txn-list"]')).includes("Janji Jiwa"), "not deleted");
  });

  // ---------- categories with history
  await s.check("FINNY-10.2 a switched-off category leaves the form but keeps its transactions", async () => {
    const kopi = (await json("categories")).body.find((c) => c.name === "Beli Kopi");
    await json(`categories/${kopi.id}`, { method: "PATCH", data: { active: false } });
    await page.goto(base + "/"); await page.getByRole("button", { name: "Add a transaction" }).first().click(); const f = page.getByRole("dialog");
    if (await f.getByRole("button", { name: "All categories", exact: true }).count()) await f.getByRole("button", { name: "All categories", exact: true }).click();
    ok(!(await f.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: "Beli Kopi", exact: true }).count()), "still offered");
    await f.getByRole("button", { name: "Close" }).click();
    ok((await text('[data-testid="txn-list"]')).includes("Ngopi di Le Tusa"), "history gone");
    await json(`categories/${kopi.id}`, { method: "PATCH", data: { active: true } });
  });
  await s.check("FINNY-10.3 merging moves every transaction to the category kept", async () => {
    const cats = (await json("categories")).body; const kopi = cats.find((c) => c.name === "Beli Kopi"), makan = cats.find((c) => c.name === "Makan di Luar");
    const r = await json(`categories/${kopi.id}/merge`, { method: "POST", data: { into: makan.id } });
    ok(r.status === 200 && r.body.moved === 1, JSON.stringify(r));
    const left = (await json("categories")).body; ok(!left.some((c) => c.name === "Beli Kopi"), "Beli Kopi still there");
    ok(left.find((c) => c.name === "Kopi Susu").parentId === makan.id, "its sub-category didn't move");
    const tx = (await json("transactions")).body.items.find((t) => t.description === "Ngopi di Le Tusa"); ok(tx.categoryId === makan.id, "transaction didn't move");
  });

  // ---------- FINNY-8.4 closing an account
  await s.check("FINNY-8.4 a closed account keeps its history, leaves the form and the totals", async () => {
    await page.goto(base + "/accounts"); await page.getByRole("button", { name: "Edit ShopeePinjam" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Close account/ }).click(); await settle();
    ok((await text('[data-testid="accounts-total"]')) !== "−Rp 1.500.000", "total unchanged");
    ok(await page.getByRole("button", { name: /Closed \(1\)/ }).isVisible(), "no Closed section");
    await page.getByRole("button", { name: "Add a transaction" }).first().click();
    ok(!(await page.getByRole("dialog").getByRole("radio", { name: "ShopeePinjam" }).count()), "closed account offered"); await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  });

  // ---------- desktop
  const desk = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await desk.addCookies(await phone.cookies());
  const dp = await desk.newPage();
  await s.check("Desktop: the quick-add form sits beside the list; the nav is on top", async () => {
    await dp.goto(base + "/"); await dp.waitForTimeout(600);
    ok(await dp.locator("aside form").isVisible(), "no side form"); ok(await dp.locator(".fy-topbar").isVisible(), "no top nav");
    await shot(dp, shots, "08-home-desktop");
    await dp.goto(base + "/accounts"); await dp.waitForTimeout(500); await shot(dp, shots, "09-accounts-desktop");
  });

  // ---------- FINNY-24: export and delete
  await s.check("FINNY-24.1 export: a zip with one CSV per table, amounts in rupiah", async () => {
    const r = await page.request.get(base + "/api/export"); ok(r.status() === 200 && r.headers()["content-type"] === "application/zip", `export ${r.status()}`);
    const buf = await r.body(); ok(buf.slice(0, 2).toString() === "PK", "not a zip");
    const s1 = buf.toString("utf8"); for (const f of ["accounts.csv", "categories.csv", "entities.csv", "transactions.csv"]) ok(s1.includes(f), `no ${f}`);
    ok(s1.includes(",spend,43890,BCA,"), "transaction row with rupiah amount"); ok(s1.includes("2499.91"), "sen kept");
  });
  await s.check("FINNY-24.2 delete everything needs DELETE typed, then removes all money data", async () => {
    ok((await json("me/data", { method: "DELETE", data: { confirm: "yes" } })).status === 400, "deleted without DELETE");
    await page.goto(base + "/settings"); await shot(page, shots, "10-settings-375");
    const btn = page.getByRole("button", { name: "Delete everything" }); ok(await btn.isDisabled(), "button enabled before typing");
    await page.getByLabel("Type DELETE to confirm").fill("DELETE"); await btn.click(); await page.getByRole("status").waitFor();
    ok((await json("accounts")).body.length === 0 && (await json("categories")).body.length === 0 && (await json("transactions")).body.items.length === 0, "data left");
    ok((await api("accounts")).status() === 200, "signed out by delete");
  });
  await s.check("Shield: headers on every page, never indexed", async () => {
    const r = await page.request.get(base + "/login"); const h = r.headers();
    ok(h["x-frame-options"] === "DENY" && /frame-ancestors 'none'/.test(h["content-security-policy"] || ""), "headers");
    ok(/noindex/.test(await r.text()), "no noindex");
  });
  await s.check("FINNY-23 signing out ends the session", async () => {
    await page.goto(base + "/settings"); await page.getByRole("button", { name: "Sign out" }).click(); await page.waitForURL(/\/login/);
    ok((await api("accounts")).status() === 401, "still signed in");
  });

  await b.close(); s.done();
};
