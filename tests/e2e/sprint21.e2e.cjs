// Sprint 21 (v0.21.0) QA, 🐧 Bubbles: fix and delete offline (FINNY-191), on a production build with the service worker
// running and Playwright's offline mode, as a phone (390 × 844). "Another device" is a second signed-in browser that
// stays online. Made-up records only: today, on BCA: Kopi 45.000 ("with Dina"), Bensin 150.000, Makan 80.000, Roti 20.000.
const { suite, ok, browser } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");
const path = require("node:path");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint21");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "allow" });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  // The other device: same owner, always online.
  const other = await b.newContext(); await other.addCookies(await ctx.cookies());
  const api = async (method, p, data) => { const r = await other.request.fetch(`${base}/api/${p}`, { method, data, headers: { "content-type": "application/json" } }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");
  const all = async () => (await api("GET", "transactions?limit=500")).body.items;
  const find = async (d) => (await all()).filter((t) => t.description === d);
  const axe = async () => (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => `${v.id} ${v.nodes[0]?.target.join(" ")}`);

  await api("DELETE", "me/data", { confirm: "DELETE" });
  const bca = (await api("POST", "accounts", { name: "BCA", type: "bank", opening: "5.000.000", openingOn: "2025-01-01" })).body;
  const kopi = (await api("POST", "categories", { name: "Beli Kopi", kind: "expense" })).body;
  const bensin = (await api("POST", "categories", { name: "Biaya Bensin", kind: "expense" })).body;
  const T = {};
  for (const [k, d, a, c, note] of [["kopi", "Kopi", "45.000", kopi, "with Dina"], ["bensin", "Bensin", "150.000", bensin], ["makan", "Makan", "80.000", kopi], ["roti", "Roti", "20.000", kopi]])
    T[k] = (await api("POST", "transactions", { kind: "spend", amount: a, accountId: bca.id, categoryId: c.id, description: d, note, on: today })).body;

  // The service worker keeps Home's numbers, as on the owner's phone.
  await page.goto(base + "/"); await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Edit Roti" }).waitFor();
  const dialog = () => page.getByRole("dialog");
  const editOffline = async (name, amount, note) => {
    await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click(); const d = dialog(); await d.waitFor();
    if (amount) await d.getByLabel("Amount").fill(amount);
    if (note !== undefined) { if (!(await d.getByLabel("Note").count())) await d.getByRole("button", { name: "Paid to, note" }).click(); await d.getByLabel("Note").fill(note); }
    await d.getByRole("button", { name: "Save changes" }).click(); await d.waitFor({ state: "detached" });
  };
  const deleteOffline = async (name) => { await page.getByRole("button", { name: `Edit ${name}`, exact: true }).click(); await dialog().getByRole("button", { name: "Delete" }).click(); await dialog().waitFor({ state: "detached" }); };

  await s.check("FINNY-191.1 edit offline: the sheet says it waits; Save changes keeps it on the phone", async () => {
    await ctx.setOffline(true); await page.reload(); await page.getByTestId("offline-banner").waitFor();
    ok(/Changes wait on this phone\./.test(await text("offline-banner")), await text("offline-banner"));
    await page.getByRole("button", { name: "Edit Kopi", exact: true }).click(); const d = dialog(); await d.waitFor();
    ok((await d.innerText()).includes("No connection: this change waits on this phone and is sent when you're back online."), "the note");
    ok(await d.getByRole("button", { name: "Save changes" }).isEnabled(), "Save enabled offline");
    await d.getByLabel("Amount").fill("50.000");
    await page.screenshot({ path: path.join(shots, "s21-01-edit-offline.png") });
    await d.getByRole("button", { name: "Save changes" }).click(); await d.waitFor({ state: "detached" });
    const w = await text("waiting"); ok(/Kopi .*Beli Kopi · BCA · was 45\.000 −50\.000 change waiting/.test(w), w);
    ok((await page.getByRole("button", { name: "Edit Kopi", exact: true }).count()) === 0, "not listed twice");
    ok((await find("Kopi"))[0].amountSen === 45_000_00, "nothing sent yet");
  });

  await s.check("FINNY-191.2/3 delete offline: struck through with Keep it; Keep it cancels; deleting again waits", async () => {
    await deleteOffline("Bensin");
    const row = page.locator('[data-testid="waiting"] [data-op="delete"]'); await row.waitFor();
    ok(/Bensin .*−150\.000 delete waiting Keep it/.test((await row.innerText()).replace(/\s+/g, " ")), await row.innerText());
    ok(await row.locator("s").first().isVisible(), "struck through");
    await row.getByRole("button", { name: "Keep Bensin" }).click(); await row.waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Edit Bensin", exact: true }).waitFor();
    await deleteOffline("Bensin"); await row.waitFor();
  });

  await s.check("FINNY-191.3 change what waits again: the sheet says it isn't sent yet; a new entry offline waits too", async () => {
    await page.getByRole("button", { name: "Change Kopi, waiting" }).click(); const d = dialog(); await d.waitFor();
    ok((await d.innerText()).includes("Not sent yet: changing it here changes what this phone will send."), "the note");
    await d.getByLabel("Amount").fill("52.000"); await d.getByRole("button", { name: "Save changes" }).click(); await d.waitFor({ state: "detached" });
    ok(/was 45\.000 −52\.000 change waiting/.test(await text("waiting")), await text("waiting"));
    await page.getByRole("button", { name: "Add a transaction" }).first().click(); const f = dialog();
    await f.getByLabel("Amount").fill("38.000"); await f.getByLabel("What for").fill("Makan siang");
    await f.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: "Beli Kopi", exact: true }).click();
    await f.getByRole("button", { name: "Save on this phone" }).click(); await f.waitFor({ state: "detached" });
    ok(/Makan siang Beli Kopi · BCA −38\.000 new, waiting/.test(await text("waiting")), await text("waiting"));
    // Two more changes the other device will also touch: Makan (it deletes it) and Roti (it changes it).
    await editOffline("Makan", "85.000"); await editOffline("Roti", null, "fresh");
    ok((await page.locator('[data-testid="waiting"] .fy-row').count()) === 5, `${await page.locator('[data-testid="waiting"] .fy-row').count()} waiting`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(shots, "s21-02-waiting.png") });
    const v = await axe(); ok(!v.length, v.join(" | "));
  });

  await s.check("FINNY-191.4/5 back online: sent once and in order; the two changed elsewhere are kept and asked about", async () => {
    ok((await api("DELETE", `transactions/${T.makan.id}`)).status === 200, "other device deletes Makan");
    ok((await api("PATCH", `transactions/${T.roti.id}`, { amount: "25.000" })).status === 200, "other device changes Roti");
    await ctx.setOffline(false); await page.getByTestId("online-banner").waitFor({ timeout: 40000 });
    ok((await text("online-banner")) === "Back online · 1 new, 1 change and 1 delete sent", await text("online-banner"));
    const k = (await find("Kopi"))[0]; ok(k.amountSen === 52_000_00 && k.note === "with Dina" && k.id === T.kopi.id, JSON.stringify(k));
    ok((await find("Bensin")).length === 0, "Bensin deleted");
    ok((await api("GET", "transactions/undo")).body.last?.n === 1, "the offline delete can be brought back for a day");
    ok((await find("Makan siang")).length === 1, "new entry once");
    await page.getByTestId("conflict").first().waitFor();
    ok((await page.getByTestId("conflict").count()) === 2, `${await page.getByTestId("conflict").count()} conflicts`);
    ok((await page.locator('[data-testid="waiting"]').count()) === 0, "nothing else waits");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(shots, "s21-03-back-online.png"), fullPage: true });
    // Another pass sends nothing twice.
    await page.evaluate(() => window.dispatchEvent(new Event("online"))); await page.waitForTimeout(1500);
    ok((await find("Makan siang")).length === 1 && (await find("Kopi")).length === 1, "still once");
  });

  await s.check("FINNY-191.5 changed elsewhere: both versions side by side; Use this phone's sends the phone's", async () => {
    const card = page.getByRole("region", { name: "Roti changed somewhere else" }); await card.waitFor();
    const t = (await card.innerText()).replace(/\s+/g, " ");
    ok(t.includes("This phone −20.000") && t.includes("“fresh”") && t.includes("In Finny now −25.000"), t);
    const v = await axe(); ok(!v.length, v.join(" | "));
    await card.screenshot({ path: path.join(shots, "s21-04-conflict.png") });
    await card.getByRole("button", { name: "Use this phone's" }).click(); await card.waitFor({ state: "detached" });
    const r = (await find("Roti"))[0]; ok(r.amountSen === 20_000_00 && r.note === "fresh", JSON.stringify(r));
  });

  await s.check("FINNY-191.5 deleted elsewhere: Add it back makes it again with the phone's version", async () => {
    const card = page.getByRole("region", { name: "Makan was deleted somewhere else" }); await card.waitFor();
    ok((await card.innerText()).includes("In Finny now\nDeleted") || (await card.innerText()).replace(/\s+/g, " ").includes("In Finny now Deleted"), await card.innerText());
    await card.getByRole("button", { name: "Add it back" }).click(); await card.waitFor({ state: "detached" });
    await page.waitForFunction(async () => true); await page.waitForTimeout(800);
    const m = await find("Makan"); ok(m.length === 1 && m[0].amountSen === 85_000_00 && m[0].id !== T.makan.id, JSON.stringify(m));
  });

  await s.check("FINNY-191.5 Keep Finny's drops the phone's change; a delete of something already gone just goes", async () => {
    await page.reload(); await page.getByRole("button", { name: "Edit Kopi", exact: true }).waitFor();
    await ctx.setOffline(true); await page.reload(); await page.getByTestId("offline-banner").waitFor();
    await editOffline("Kopi", null, "phone note"); await deleteOffline("Roti");
    ok((await api("PATCH", `transactions/${T.kopi.id}`, { note: "laptop note" })).status === 200, "other device changes Kopi");
    ok((await api("DELETE", `transactions/${T.roti.id}`)).status === 200, "other device deletes Roti");
    await ctx.setOffline(false);
    const card = page.getByRole("region", { name: "Kopi changed somewhere else" }); await card.waitFor({ timeout: 40000 });
    await page.locator('[data-testid="waiting"]').waitFor({ state: "detached", timeout: 15000 }).catch(() => {});
    ok((await page.getByTestId("conflict").count()) === 1, "only Kopi asks; the Roti delete just went");
    ok((await page.locator('[data-testid="waiting"]').count()) === 0, `still waiting: ${await page.locator('[data-testid="waiting"]').innerText().catch(() => "")}`);
    await card.getByRole("button", { name: "Keep Finny's" }).click(); await card.waitFor({ state: "detached" });
    ok((await find("Kopi"))[0].note === "laptop note", "Finny's kept");
  });

  await s.check("FINNY-193 the API: expect refused with Finny's version (409), gone (404), no expect as before", async () => {
    const k = (await find("Kopi"))[0];
    const seen = { on: k.on, kind: k.kind, amountSen: k.amountSen, accountId: k.accountId, toAccountId: k.toAccountId, categoryId: k.categoryId, description: k.description, note: k.note, entity: k.entity };
    const okPatch = await api("PATCH", `transactions/${k.id}`, { amount: "53.000", expect: seen }); ok(okPatch.status === 200, JSON.stringify(okPatch));
    const stale = await api("PATCH", `transactions/${k.id}`, { amount: "54.000", expect: seen });
    ok(stale.status === 409 && stale.body.current?.amountSen === 53_000_00 && stale.body.fields.join() === "amountSen", JSON.stringify(stale));
    const del = await api("DELETE", `transactions/${k.id}?undo=1`, { expect: seen }); ok(del.status === 409, `delete ${del.status}`);
    ok((await api("PATCH", `transactions/${T.bensin.id}`, { amount: "1", expect: seen })).status === 404, "gone");
    ok((await api("PATCH", `transactions/${k.id}`, { amount: "54.000" })).status === 200, "no expect: as before");
    ok((await api("DELETE", `transactions/${k.id}`)).status === 200, "plain delete as before");
  });

  await s.check("Settings › Finny on your phone counts changes too; signing out clears what waits", async () => {
    await ctx.setOffline(true); await page.reload(); await page.getByTestId("offline-banner").waitFor();
    await editOffline("Makan siang", "39.000");
    await page.route("**/api/transactions/**", (r) => r.abort()); await ctx.setOffline(false); // keep it waiting
    await page.goto(base + "/settings/phone"); await page.waitForTimeout(500); ok((await text("waiting-count")) === "1", `${await text("waiting-count")} waiting`);
    ok((await find("Makan siang"))[0].amountSen === 38_000_00, "the waiting change wasn't sent");
    // Signing out (which also ends the other browser's session: same owner) clears the phone's outbox first.
    await page.goto(base + "/settings"); await page.getByTestId("sign-out").click(); await page.waitForURL(/\/login/);
    const left = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("finny", 1); r.onsuccess = () => { const t = r.result.transaction("outbox", "readonly").objectStore("outbox").count(); t.onsuccess = () => res(t.result); }; r.onerror = () => res(-1); }));
    ok(left === 0, `left ${left}`);
  });

  await s.check("no page errors", async () => ok(!errors.filter((e) => !/Failed to fetch|NetworkError|net::/.test(e)).length, errors.join(" | ")));
  await other.close(); await b.close();
  s.done();
};
