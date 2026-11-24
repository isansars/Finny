// Sprint 20 (v0.20.0) QA, 🐧 Bubbles: undo a delete (FINNY-183), on a production build with made-up records.
// Last month (P) holds 5 transactions worked by hand on BCA (opening 20.000.000) and Tunai (5.000.000):
// Gaji +15.000.000 (BCA), Kopi 45.000 (BCA, a note, "looks fine"), Token listrik 423.000 (BCA), Bensin 150.000 (Tunai),
// a transfer 2.000.000 BCA → Tunai, plus Kedai Kopi 32.000 read from a statement (BCA).
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint20");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const sm = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const P = sm(today.slice(0, 7), -1);
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
  const j = async (method, u, data, headers = {}) => { const r = await page.request.fetch(`${base}/api/${u}`, { method, data, headers: { "content-type": "application/json", ...headers } }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const waitFoot = async (t, p = page) => { try { await p.waitForFunction((x) => document.querySelector('[data-testid="tx-foot"]')?.textContent?.replace(/\s+/g, " ").includes(x), t, { timeout: 15000 }); }
    catch { throw new Error(`waited for "${t}" in the footer; it says "${await p.getByTestId("tx-foot").first().innerText().catch(() => "(no footer)")}"`); } };
  const axe = async (p) => (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`);
  const later = (h) => ({ "x-finny-qa-now": new Date(Date.now() + h * 3600_000).toISOString() });

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await j("DELETE", "me/data", { confirm: "DELETE" });
  const A = {};
  for (const [k, n, t, o] of [["bca", "BCA", "bank", "20.000.000"], ["cash", "Tunai", "cash", "5.000.000"]]) A[k] = (await j("POST", "accounts", { name: n, type: t, opening: o, openingOn: "2025-01-01" })).body;
  await j("POST", "categories/starter", {});
  const cats = (await j("GET", "categories")).body; const list = Array.isArray(cats) ? cats : cats.categories;
  const C = (n) => list.find((c) => c.name === n);
  const kopi = C("Beli Kopi"), listrik = C("Biaya Listrik"), bensin = C("Biaya Bensin"), gaji = list.find((c) => c.kind === "income");
  const add = async (d) => (await j("POST", "transactions", d)).body;
  const T = {};
  T.gaji = await add({ kind: "income", amount: "15.000.000", accountId: A.bca.id, categoryId: gaji.id, description: "Gaji", on: `${P}-01` });
  T.kopi = await add({ kind: "spend", amount: "45.000", accountId: A.bca.id, categoryId: kopi.id, description: "Kopi", note: "with Dina", on: `${P}-05` });
  T.listrik = await add({ kind: "spend", amount: "423.000", accountId: A.bca.id, categoryId: listrik.id, description: "Token listrik", on: `${P}-23` });
  T.bensin = await add({ kind: "spend", amount: "150.000", accountId: A.cash.id, categoryId: bensin.id, description: "Bensin", on: `${P}-10` });
  T.xfer = await add({ kind: "transfer", amount: "2.000.000", accountId: A.bca.id, toAccountId: A.cash.id, description: "Tarik tunai", on: `${P}-02` });
  await j("PATCH", `transactions/${T.kopi.id}`, { looksOk: true });
  const st = await j("POST", "statements", { accountId: A.bca.id, bank: "bca", bankName: "BCA", periodFrom: `${P}-01`, periodTo: `${P}-28`, fileHash: "b".repeat(64),
    lines: [{ on: `${P}-07`, kind: "spend", sen: 3_200_000, accountId: A.bca.id, categoryId: kopi.id, description: "Kedai Kopi" }] });
  ok(st.status === 200, `statement ${st.status}`);
  const all = async () => (await j("GET", `transactions/table?month=${P}&limit=500`)).body.items;
  const balances = async () => { const r = (await j("GET", "accounts")).body; const l = Array.isArray(r) ? r : r.accounts; return Object.fromEntries(l.map((a) => [a.name, a.balanceSen])); };
  const before = await all(), balBefore = await balances();
  const byDesc = (d, rows = before) => rows.find((r) => r.description === d);
  ok(before.length === 6, `${before.length} rows`);
  // BCA 20.000.000 + 15.000.000 − 45.000 − 423.000 − 2.000.000 − 32.000 = 32.500.000; Tunai 5.000.000 − 150.000 + 2.000.000 = 6.850.000
  ok(balBefore.BCA === 32_500_000_00 && balBefore.Tunai === 6_850_000_00, JSON.stringify(balBefore));

  await s.check("FINNY-183.1 delete two on a laptop: the bar says \"Deleted 2 · −Rp 468.000\" with Undo and a 30-second line; balances drop", async () => {
    await page.goto(`${base}/transactions?month=${P}`); await waitFoot("6 transactions");
    for (const d of ["Kopi", "Token listrik"]) await page.getByRole("checkbox", { name: new RegExp(`^Pick ${d},`) }).check();
    await page.getByRole("button", { name: "Delete 2" }).click();
    const bar = page.getByTestId("undo-bar"); await bar.waitFor();
    const text = (await bar.innerText()).replace(/\s+/g, " ");
    ok(text.includes("Deleted 2 · −Rp 468.000") && text.includes("Undo"), text);
    ok(await bar.getByRole("button", { name: "Close" }).isVisible(), "✕");
    const anim = await page.locator(".fy-undo .line i").evaluate((e) => getComputedStyle(e).animationDuration); ok(anim === "30s", `line ${anim}`);
    await waitFoot("4 transactions");
    const bal = await balances(); ok(bal.BCA === 32_968_000_00, `BCA ${bal.BCA}`);
    await shot(page, shots, "s20-01-deleted-laptop");
  });

  await s.check("FINNY-183.2 Undo brings both back exactly (same ids, every column, the note and \"looks fine\"), and the balances", async () => {
    await page.getByTestId("undo-bar").getByRole("button", { name: "Undo" }).click();
    await page.getByText("2 transactions back").waitFor(); await waitFoot("6 transactions");
    const after = await all();
    for (const d of ["Kopi", "Token listrik"]) { const a = byDesc(d), z = byDesc(d, after); ok(z && JSON.stringify(a) === JSON.stringify(z), `${d}: ${JSON.stringify(a)} vs ${JSON.stringify(z)}`); }
    const k = (await j("GET", `transactions?month=${P}`)).body; const kl = Array.isArray(k) ? k : k.items ?? k.transactions;
    const kz = kl.find((t) => t.id === T.kopi.id); ok(kz && kz.note === "with Dina" && kz.looksOk === true && kz.createdAt === T.kopi.createdAt, JSON.stringify(kz));
    const bal = await balances(); ok(JSON.stringify(bal) === JSON.stringify(balBefore), JSON.stringify(bal));
    await shot(page, shots, "s20-02-back-laptop");
  });

  await s.check("FINNY-183.2 an undo works once: a second try says it has expired or was used, and nothing doubles", async () => {
    const d = await j("POST", "transactions/bulk", { ids: [T.bensin.id], action: "delete" });
    ok(d.status === 200 && d.body.undoId && d.body.changed === 1 && d.body.outSen === 150_000_00, JSON.stringify(d.body));
    const u1 = await j("POST", "transactions/undo", { undoId: d.body.undoId }); ok(u1.status === 200 && u1.body.restored === 1, JSON.stringify(u1));
    const u2 = await j("POST", "transactions/undo", { undoId: d.body.undoId }); ok(u2.status === 404 && /expired or was already used/.test(u2.body.error), JSON.stringify(u2));
    ok((await all()).length === 6, "6 rows");
  });

  await s.check("FINNY-183.1 a single delete from the table's trash button, then Undo; a statement row keeps where it came from", async () => {
    await page.goto(`${base}/transactions?month=${P}`); await waitFoot("6 transactions");
    await page.getByRole("button", { name: /^Delete Kedai Kopi,/ }).click();
    const bar = page.getByTestId("undo-bar"); await bar.waitFor(); ok((await bar.innerText()).replace(/\s+/g, " ").includes("Deleted 1 · −Rp 32.000"), await bar.innerText());
    await waitFoot("5 transactions"); await bar.getByRole("button", { name: "Undo" }).click(); await page.getByText("1 transaction back").waitFor(); await waitFoot("6 transactions");
    const z = byDesc("Kedai Kopi", await all()); ok(z && z.source === "statement" && z.id === byDesc("Kedai Kopi").id, JSON.stringify(z));
  });

  await s.check("FINNY-183.3 missed it: after a reload the chip \"Bring back 1 deleted · <day>, <time>\" restores the last delete", async () => {
    await page.getByRole("button", { name: /^Delete Bensin,/ }).click(); await page.getByTestId("undo-bar").waitFor(); await waitFoot("5 transactions");
    await page.reload(); await waitFoot("5 transactions");
    const chip = page.getByTestId("bring-back"); await chip.waitFor();
    const t = (await chip.innerText()).replace(/\s+/g, " ");
    const now = new Date(), day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short" }).format(now);
    ok(new RegExp(`^Bring back 1 deleted · ${day}, \\d\\d:\\d\\d$`).test(t), t);
    await shot(page, shots, "s20-03-bring-back");
    await chip.click(); await page.getByText("1 transaction back").waitFor(); await waitFoot("6 transactions");
    ok(!(await page.getByTestId("bring-back").isVisible()), "chip gone");
  });

  await s.check("FINNY-183.3 the bar goes after 30 seconds and the chip takes its place; ✕ closes it at once", async () => {
    await page.clock.install(); await page.goto(`${base}/transactions?month=${P}`); await waitFoot("6 transactions");
    await page.getByRole("button", { name: /^Delete Bensin,/ }).click(); await page.getByTestId("undo-bar").waitFor();
    await page.clock.runFor(29_000); ok(await page.getByTestId("undo-bar").isVisible(), "still there at 29 s");
    await page.clock.runFor(2_000); await page.getByTestId("bring-back").waitFor(); ok(!(await page.getByTestId("undo-bar").isVisible()), "bar gone at 31 s");
    await page.getByTestId("bring-back").click(); await page.getByText("1 transaction back").waitFor();
    await page.getByRole("button", { name: /^Delete Bensin,/ }).click(); await page.getByTestId("undo-bar").getByRole("button", { name: "Close" }).click();
    await page.getByTestId("bring-back").waitFor(); await page.getByTestId("bring-back").click(); await page.getByText("1 transaction back").waitFor(); await waitFoot("6 transactions");
  });

  await s.check("FINNY-183.4 after a day it's gone for good: no chip, and the undo says so (QA clock)", async () => {
    const d = await j("POST", "transactions/bulk", { ids: [T.bensin.id], action: "delete" });
    ok((await j("GET", "transactions/undo", undefined, later(23))).body.last?.undoId === d.body.undoId, "still there at 23 h");
    ok((await j("GET", "transactions/undo", undefined, later(25))).body.last === null, "chip gone at 25 h");
    const u = await j("POST", "transactions/undo", { undoId: d.body.undoId }, later(25)); ok(u.status === 404, JSON.stringify(u));
    // A delete a day later purges it from the trash for good.
    const d2 = await j("POST", "transactions/bulk", { ids: [T.gaji.id], action: "delete" }, later(25));
    ok((await j("POST", "transactions/undo", { undoId: d.body.undoId })).status === 404, "purged");
    ok((await j("POST", "transactions/undo", { undoId: d2.body.undoId }, later(25))).status === 200, "the new one still works");
    T.bensin = await add({ kind: "spend", amount: "150.000", accountId: A.cash.id, categoryId: bensin.id, description: "Bensin", on: `${P}-10` });
  });

  await s.check("FINNY-183.4 a category deleted since: the undo refuses, names it, and changes nothing (accounts are only archived, never deleted)", async () => {
    const cat = (await j("POST", "categories", { name: "Kopi kantor", kind: "expense" })).body; ok(cat.id, JSON.stringify(cat));
    const t = await add({ kind: "spend", amount: "25.000", accountId: A.bca.id, categoryId: cat.id, description: "Kopi kantor", on: `${P}-12` });
    const d = await j("POST", "transactions/bulk", { ids: [t.id, T.listrik.id], action: "delete" }); ok(d.status === 200, JSON.stringify(d));
    const del = await j("DELETE", `categories/${cat.id}`); ok(del.status === 200, `category delete ${del.status} ${JSON.stringify(del.body)}`);
    const u = await j("POST", "transactions/undo", { undoId: d.body.undoId });
    ok(u.status === 409 && u.body.error === "Can't bring them back: a category they used was deleted since.", JSON.stringify(u));
    ok(!(await all()).some((r) => r.description === "Token listrik"), "all or nothing: Token listrik stays deleted");
    await page.goto(`${base}/transactions?month=${P}`); await page.getByTestId("bring-back").click();
    await page.getByRole("alert").filter({ hasText: "Can't bring them back" }).waitFor();
    await shot(page, shots, "s20-04-refused");
    T.listrik = await add({ kind: "spend", amount: "423.000", accountId: A.bca.id, categoryId: listrik.id, description: "Token listrik", on: `${P}-23` });
  });

  await s.check("FINNY-183.4 someone else's or a made-up undo id is not found; a bad body too", async () => {
    for (const body of [{ undoId: crypto.randomUUID() }, { undoId: "nope" }, {}]) { const u = await j("POST", "transactions/undo", body); ok(u.status === 404, `${JSON.stringify(body)} → ${u.status}`); }
    const r = await page.request.fetch(`${base}/api/transactions/undo`, { method: "POST", data: { undoId: crypto.randomUUID() }, headers: { "content-type": "application/json", cookie: "" } });
    ok(r.status() === 401, `signed out ${r.status()}`);
  });

  await s.check("the export leaves the trash out; Home's edit dialog still deletes for good; delete everything empties the trash", async () => {
    const d = await j("POST", "transactions/bulk", { ids: [T.bensin.id], action: "delete" });
    const ex = await page.request.fetch(`${base}/api/export`); const body = await ex.text(); ok(ex.status() === 200 && !body.includes(T.bensin.id), "trash in the export");
    await j("POST", "transactions/undo", { undoId: d.body.undoId });
    const plain = await j("DELETE", `transactions/${T.bensin.id}`); ok(plain.status === 200 && !plain.body.undoId, JSON.stringify(plain.body));
    T.bensin = await add({ kind: "spend", amount: "150.000", accountId: A.cash.id, categoryId: bensin.id, description: "Bensin", on: `${P}-10` });
  });

  await s.check("phone 390: the bar sits above the tab bar, Undo and ✕ are thumb-sized, no axe issues", async () => {
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); await pc.addCookies(await ctx.cookies());
    const p = await pc.newPage(); p.on("dialog", (d) => d.accept()); p.on("pageerror", (e) => errors.push(`phone ${e.message}`));
    await p.goto(`${base}/transactions?month=${P}`); await waitFoot("6", p);
    await p.getByRole("button", { name: "Select", exact: true }).click();
    await p.getByRole("button", { name: /^Pick Token listrik,/ }).click(); await p.getByRole("button", { name: /^Pick Kopi,/ }).click();
    await p.getByRole("button", { name: "Delete 2" }).click(); await p.getByTestId("undo-bar").waitFor();
    await p.waitForFunction(() => document.querySelector('[data-testid="undo-bar"]').getAnimations().every((x) => x.playState === "finished" || x.effect?.getTiming().duration === 30000));
    const bar = await p.getByTestId("undo-bar").boundingBox(), tabs = await p.locator(".fy-tabbar").boundingBox();
    ok(bar.y + bar.height <= tabs.y, `bar ends ${bar.y + bar.height}, tabs at ${tabs.y}`);
    for (const n of ["Undo", "Close"]) { const bb = await p.getByTestId("undo-bar").getByRole("button", { name: n }).boundingBox(); ok(bb.height >= 44 && bb.width >= 44, `${n} ${bb.width}×${bb.height}`); }
    const v = await axe(p); ok(!v.length, v.join(" | "));
    await p.screenshot({ path: require("node:path").join(shots, "s20-05-phone-deleted.png") });
    await p.getByTestId("undo-bar").getByRole("button", { name: "Undo" }).tap(); await p.getByText("2 transactions back").waitFor();
    await p.screenshot({ path: require("node:path").join(shots, "s20-06-phone-back.png") });
    await p.getByRole("button", { name: /^Edit Bensin,/ }).waitFor();
    await p.getByRole("button", { name: "Select", exact: true }).click().catch(() => {});
    await pc.close();
    ok((await all()).length === 6, "6 rows back");
  });

  await s.check("laptop: keyboard reaches Undo and ✕, no axe issues with the bar and with the chip", async () => {
    await page.goto(`${base}/transactions?month=${P}`); await waitFoot("6 transactions");
    await page.getByRole("button", { name: /^Delete Bensin,/ }).click(); await page.getByTestId("undo-bar").waitFor();
    const undo = page.getByTestId("undo-bar").getByRole("button", { name: "Undo" }); await undo.focus(); ok(await undo.evaluate((e) => e === document.activeElement), "Undo focusable");
    let v = await axe(page); ok(!v.length, v.join(" | "));
    await page.getByTestId("undo-bar").getByRole("button", { name: "Close" }).click(); await page.getByTestId("bring-back").waitFor();
    v = await axe(page); ok(!v.length, v.join(" | "));
    await page.getByTestId("bring-back").press("Enter"); await page.getByText("1 transaction back").waitFor();
  });

  await s.check("delete everything empties the trash", async () => {
    await j("POST", "transactions/bulk", { ids: [T.bensin.id], action: "delete" });
    ok((await j("GET", "transactions/undo")).body.last, "a trash row first");
    await j("DELETE", "me/data", { confirm: "DELETE" });
    ok((await j("GET", "transactions/undo")).body.last === null, "trash emptied");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await b.close();
  s.done();
};
