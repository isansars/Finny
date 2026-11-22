const { suite, ok, browser } = require("./helpers.cjs");
module.exports = async ({ base }) => {
  const s = suite("smoke");
  const b = await browser(); const page = await b.newPage();
  await s.check("the home page answers", async () => { const r = await page.goto(base + "/"); ok(r.status() < 400, `status ${r.status()}`); });
  await s.check("security headers are set", async () => {
    const r = await fetch(base + "/"); ok(r.headers.get("x-frame-options") === "DENY", "no X-Frame-Options"); ok(!r.headers.get("x-powered-by"), "x-powered-by is set");
  });
  await b.close(); s.done();
};
