// The logo and app icon (FINNY-52), 🐧 Bubbles.
const { suite, ok, browser, shot } = require("./helpers.cjs");
module.exports = async ({ base, shots }) => {
  const s = suite("brand");
  const b = await browser(); const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
  await s.check("FINNY-52.2 the browser tab and iPhone get Finny's icon", async () => {
    await page.goto(base + "/login");
    const icon = await page.locator('link[rel="icon"]').first().getAttribute("href"); ok(icon && /icon/.test(icon), `icon link ${icon}`);
    const apple = await page.locator('link[rel="apple-touch-icon"]').first().getAttribute("href"); ok(apple && /apple-icon/.test(apple), `apple ${apple}`);
    for (const u of [icon, apple, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"]) { const r = await page.request.get(base + u); ok(r.status() === 200, `${u} ${r.status()}`); }
  });
  await s.check("FINNY-52.3 Add to Home Screen: a manifest with Finny's name and 192 / 512 / maskable icons", async () => {
    const href = await page.locator('link[rel="manifest"]').getAttribute("href"); ok(href, "no manifest link");
    const m = await (await page.request.get(base + href)).json();
    ok(m.name === "Finny" && m.display === "standalone", JSON.stringify(m).slice(0, 120));
    ok(m.icons.some((i) => i.sizes === "192x192") && m.icons.some((i) => i.sizes === "512x512") && m.icons.some((i) => i.purpose === "maskable"), "icons");
    ok(await page.locator('meta[name="apple-mobile-web-app-capable"], meta[name="mobile-web-app-capable"]').count() > 0, "no web-app meta");
  });
  await s.check("FINNY-52.2 the sign-in screen and the top bar show the logo", async () => {
    ok(await page.getByRole("img", { name: "Finny" }).isVisible(), "no logo on sign-in"); await shot(page, shots, "brand-01-sign-in-375");
    await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
    const desk = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }); await desk.addCookies(await page.context().cookies()); const d = await desk.newPage();
    await d.goto(base + "/"); ok(await d.getByRole("link", { name: "Finny, home" }).locator("svg").count() === 1, "no mark in the top bar"); await shot(d, shots, "brand-02-topbar-desktop");
  });
  await b.close(); s.done();
};
