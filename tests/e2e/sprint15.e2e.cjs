// Sprint 15 (v0.15.0) QA, 🐧 Bubbles: Finny on your home screen (FINNY-146), on a production build with the service
// worker running and Playwright's offline mode, on made-up accounts and entries. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint15");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, serviceWorkers: "allow" });
  const page = await ctx.newPage(); page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");
  const waitText = (id, t) => page.waitForFunction(([i, x]) => document.querySelector(`[data-testid="${i}"]`)?.textContent?.includes(x), [id, t]);
  const txns = async () => (await json("transactions?limit=500")).body.items;
  const cacheKeys = () => page.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(`${k} ${new URL(r.url).pathname}`); return out; });

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  const bca = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "5.000.000", openingOn: "2025-01-01" } })).body;
  const kopi = (await json("categories", { method: "POST", data: { name: "Beli Kopi", kind: "expense" } })).body;
  await json("transactions", { method: "POST", data: { kind: "spend", amount: "45.000", accountId: bca.id, categoryId: kopi.id, description: "Kopi kemarin", on: today } });

  await s.check("FINNY-146.1 installable: manifest, service worker, Settings › Finny on your phone", async () => {
    const m = await (await page.request.get(base + "/manifest.webmanifest")).json();
    ok(m.name === "Finny" && m.display === "standalone" && m.icons.some((i) => i.sizes === "512x512") && m.start_url === "/", JSON.stringify(m));
    ok((await page.request.get(base + "/sw.js")).status() === 200, "sw.js");
    await page.goto(base + "/"); await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await page.getByTestId("net").waitFor(); await page.waitForLoadState("networkidle");
    await page.goto(base + "/settings"); await page.getByRole("link", { name: "Finny on your phone" }).click(); await page.waitForURL(base + "/settings/phone");
    ok((await text("install-card")).includes("Put Finny on your home screen") && (await page.getByText("2 · Add to Home Screen").count()) === 1, await text("install-card"));
    ok((await text("waiting-count")) === "0", "nothing waiting");
    await shot(page, shots, "s15-04-phone-375");
    await page.goto(base + "/"); await page.getByTestId("net").waitFor(); await page.waitForLoadState("networkidle");
  });

  const netOnline = await page.getByTestId("net").innerText();

  await s.check("FINNY-146.2 opens offline: the last numbers, the time they're from", async () => {
    await ctx.setOffline(true);
    await page.reload(); await page.getByTestId("offline-banner").waitFor();
    ok(/Offline · numbers as of \d\d:\d\d\. New entries wait on this phone\./.test(await text("offline-banner")), await text("offline-banner"));
    await page.waitForFunction((v) => document.querySelector('[data-testid="net"]')?.textContent === v, netOnline);
    ok((await page.getByText("Kopi kemarin").count()) >= 1, "the kept transactions");
    const other = await ctx.newPage(); const r = await other.goto(base + "/reports?view=pace");
    ok(r.status() === 503 && (await other.content()).includes("This page needs a connection"), "a page never kept");
    await other.close();
  });

  await s.check("FINNY-146.3 quick add offline waits on this phone", async () => {
    await page.getByRole("button", { name: "Add a transaction" }).first().click();
    const f = page.getByRole("dialog");
    ok((await f.innerText()).includes("No connection: this is kept on your phone"), "the note");
    await f.getByLabel("Amount").fill("38.000"); await f.getByLabel("What for").fill("Kopi Tuku");
    await f.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: "Beli Kopi", exact: true }).click();
    await page.screenshot({ path: require("node:path").join(shots, "s15-02-add-offline-375.png") });
    await f.getByRole("button", { name: "Save on this phone" }).click(); await f.waitFor({ state: "detached" });
    await page.getByTestId("waiting").waitFor();
    ok(/Kopi Tuku Beli Kopi · BCA −38\.000 waiting to send/.test(await text("waiting")), await text("waiting"));
    await page.screenshot({ path: require("node:path").join(shots, "s15-01-offline-home-375.png") });
    // Editing needs a connection.
    await page.getByRole("button", { name: "Edit Kopi kemarin" }).click();
    const e = page.getByRole("dialog"); ok(await e.getByRole("button", { name: "Save changes" }).isDisabled(), "editing offline");
    await page.keyboard.press("Escape");
  });

  await s.check("FINNY-146.4 back online: sent once, \"Back online · 1 entry sent\"", async () => {
    await ctx.setOffline(false);
    await page.getByTestId("online-banner").waitFor({ timeout: 40000 });
    ok((await text("online-banner")).includes("Back online · 1 entry sent"), await text("online-banner"));
    await page.waitForFunction(() => !document.querySelector('[data-testid="waiting"]'));
    const t = (await txns()).filter((x) => x.description === "Kopi Tuku");
    ok(t.length === 1 && t[0].amountSen === 3_800_000 && t[0].on === today && t[0].clientRef, JSON.stringify(t));
    await page.screenshot({ path: require("node:path").join(shots, "s15-03-back-online-375.png") });
    // The same entry sent again (an answer lost on the way) is the same row; two at once make one row.
    const again = await json("transactions", { method: "POST", data: { kind: "spend", amount: "38.000", accountId: bca.id, categoryId: kopi.id, description: "Kopi Tuku", on: today, clientRef: t[0].clientRef } });
    ok(again.status === 200 && again.body.id === t[0].id, "a resend returns the same row");
    const ref = "8a7b6c5d-0000-4000-8000-00000000abcd", body = { kind: "spend", amount: "12.000", accountId: bca.id, categoryId: kopi.id, description: "Parkir", on: today, clientRef: ref };
    const [x, y] = await Promise.all([json("transactions", { method: "POST", data: body }), json("transactions", { method: "POST", data: body })]);
    ok(x.status === 200 && y.status === 200 && x.body.id === y.body.id && (await txns()).filter((z) => z.description === "Parkir").length === 1, `${x.status} ${y.status}`);
    ok((await json("transactions", { method: "POST", data: { ...body, clientRef: "not-a-uuid" } })).status === 400, "not a uuid");
  });

  await s.check("FINNY-146.5 only GETs and built files are kept; signing out clears the phone", async () => {
    const keys = await cacheKeys();
    ok(keys.some((k) => k.includes("/api/transactions")) && keys.some((k) => k.includes("/_next/static/")), keys.slice(0, 5).join(" | "));
    ok(!keys.some((k) => /\/api\/(auth|export|qa)/.test(k)), "auth or export kept");
    // Something waiting, then sign out: both the kept data and the waiting entry go.
    await ctx.setOffline(true);
    await page.getByRole("button", { name: "Add a transaction" }).first().click();
    const f = page.getByRole("dialog"); await f.getByLabel("Amount").fill("5.000"); await f.getByLabel("What for").fill("Permen");
    await f.getByRole("radiogroup", { name: "Category" }).getByRole("radio", { name: "Beli Kopi", exact: true }).click();
    await f.getByRole("button", { name: "Save on this phone" }).click(); await f.waitFor({ state: "detached" }); await page.getByTestId("waiting").waitFor();
    await ctx.setOffline(false);
    await page.evaluate(() => { window.__noSend = true; });
    await page.goto(base + "/settings"); await page.getByTestId("sign-out").click(); await page.waitForURL(/\/login/);
    const after = await cacheKeys();
    ok(!after.some((k) => k.includes("/api/")), `data kept after sign out: ${after.filter((k) => k.includes("/api/")).join(" | ")}`);
    const waiting = await page.evaluate(() => new Promise((res) => { const r = indexedDB.open("finny", 1); r.onsuccess = () => { const t = r.result.transaction("outbox", "readonly").objectStore("outbox").count(); t.onsuccess = () => res(t.result); }; r.onerror = () => res(-1); }));
    ok(waiting === 0, `waiting after sign out: ${waiting}`);
    await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  });

  await s.check("accessibility, online and offline; desktop", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    await page.goto(base + "/settings/phone"); await page.waitForLoadState("networkidle"); await scan("phone");
    await page.goto(base + "/"); await page.getByTestId("net").waitFor(); await page.waitForLoadState("networkidle");
    await ctx.setOffline(true); await page.reload(); await page.getByTestId("offline-banner").waitFor(); await scan("offline home");
    await ctx.setOffline(false);
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(base + "/settings/phone"); await page.waitForLoadState("networkidle");
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "sideways");
    await shot(page, shots, "s15-05-phone-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
