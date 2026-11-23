// Sprint 11 (v0.11.0) QA, 🐧 Bubbles: net worth goals (FINNY-115), end to end in a browser, on made-up accounts and six
// months of made-up history whose figures are worked out by hand below. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");

const shiftMonth = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const between = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };
const mon = (m) => new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(m + "-01T00:00:00Z"));
const fmt = (sen) => (sen / 100).toLocaleString("de-DE");
const rp = (n) => n * 100;

module.exports = async ({ base, shots }) => {
  const s = suite("sprint11");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), N = today.slice(0, 7), M = shiftMonth(N, -1);
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const json = async (p, o = {}) => { const r = await page.request.fetch(`${base}/api/${p}`, { ...o, headers: { "content-type": "application/json" }, data: o.data }); return { status: r.status(), body: await r.json().catch(() => ({})) }; };
  const noSideScroll = async (l) => { const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 3).map((e) => `${e.tagName}.${e.className?.baseVal ?? e.className}`)); ok(!wide.length, `${l} scrolls sideways: ${wide.join(" ")}`); };
  const text = async (id) => (await page.getByTestId(id).innerText()).replace(/\s+/g, " ");
  const waitText = (id, t) => page.waitForFunction(([i, x]) => document.querySelector(`[data-testid="${i}"]`)?.textContent?.includes(x), [id, t]);

  await page.goto(base + "/login"); await page.getByLabel("Email").fill("owner@finny.test"); await page.getByRole("button", { name: "Dev sign-in" }).click(); await page.waitForURL(base + "/");
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  const A = {};
  A.bca = (await json("accounts", { method: "POST", data: { name: "BCA Tahapan", type: "bank", opening: "70.000.000", openingOn: "2024-01-01" } })).body;
  A.rdpu = (await json("accounts", { method: "POST", data: { name: "Reksadana Pasar Uang", type: "investment", opening: "23.400.000", openingOn: "2024-01-01" } })).body;
  A.jago = (await json("accounts", { method: "POST", data: { name: "Jago Kantong", type: "bank", opening: "9.600.000", openingOn: "2024-01-01" } })).body;
  A.card = (await json("accounts", { method: "POST", data: { name: "Kartu Kredit", type: "card", opening: "0", openingOn: "2024-01-01" } })).body;
  const gaji = (await json("categories", { method: "POST", data: { name: "Gaji", kind: "income" } })).body;
  // Each of the last six months (N−5 … N), on the 1st: Gaji 3.000.000 into BCA; 2.100.000 from BCA to RDPU; 2.000.000 from BCA to Jago.
  for (let i = 5; i >= 0; i--) {
    const on = `${shiftMonth(N, -i)}-01`;
    await json("transactions", { method: "POST", data: { kind: "income", amount: "3.000.000", accountId: A.bca.id, categoryId: gaji.id, description: "Gaji", on } });
    await json("transactions", { method: "POST", data: { kind: "transfer", amount: "2.100.000", accountId: A.bca.id, toAccountId: A.rdpu.id, description: "RDPU", on } });
    await json("transactions", { method: "POST", data: { kind: "transfer", amount: "2.000.000", accountId: A.bca.id, toAccountId: A.jago.id, description: "Jago", on } });
  }
  // By hand, today: BCA 70 + 18 − 12,6 − 12 = 63,4 jt; RDPU 23,4 + 12,6 = 36 jt; Jago 9,6 + 12 = 21,6 jt; net worth 121 jt.
  // Six month-ends ago (end of N−6): net worth 103 jt → growing (121 − 103) ÷ 6 = 3.000.000 a month.
  // DP rumah (45 jt of BCA + all of RDPU): 81 jt now, 68,4 jt then → pace 2.100.000. Target 150 jt by Jun 2028:
  //   needed = 69 jt ÷ months left, rounded up to Rp 100.000; at the pace, 69 ÷ 2,1 = 32,9 → 33 months.
  // Trip (all of Jago): 21,6 jt now, 9,6 jt then → pace 2.000.000; target 30 jt in 5 months → needed 8,4 ÷ 5 = 1,68 → 1.700.000: on track.
  const ml = between(N, "2028-06"), needed = Math.ceil(rp(69_000_000) / ml / rp(100_000)) * rp(100_000), reached = shiftMonth(N, 33);

  await s.check("FINNY-115.1 Goals from Assets: net worth and its pace; nothing yet", async () => {
    await page.goto(base + "/assets"); await waitText("goals-row", "Aim your money somewhere");
    await page.getByTestId("goals-row").click(); await page.waitForURL(base + "/assets/goals");
    await waitText("goals-hero", "Growing");
    const h = await text("goals-hero");
    ok(h.includes("Rp 121.000.000") && h.includes("Growing about Rp 3.000.000 a month (last 6 months)"), h);
  });

  await s.check("FINNY-115.2/3/4 a new goal: accounts all or a part, needed a month as you type", async () => {
    await page.getByRole("button", { name: "Add a goal" }).click();
    await page.getByLabel("Name").fill("DP rumah"); await page.getByLabel("Target (Rp)").fill("150.000.000"); await page.getByLabel("By (optional)").fill("2028-06");
    ok(!(await page.getByRole("checkbox", { name: "Use Kartu Kredit" }).count()), "a card isn't offered");
    await page.getByRole("checkbox", { name: "Use BCA Tahapan" }).click();
    await page.getByRole("radiogroup", { name: "How much of BCA Tahapan" }).getByRole("radio", { name: "Part" }).click();
    await page.getByLabel("Part of BCA Tahapan").fill("45.000.000");
    await page.getByRole("checkbox", { name: "Use Reksadana Pasar Uang" }).click();
    await waitText("goal-need", "Needs");
    ok((await text("goal-need")).includes(`Needs Rp ${fmt(needed)} a month to reach it by Jun 2028`), await text("goal-need"));
    await shot(page, shots, "s11-02-new-goal-375");
    await page.getByRole("button", { name: "Save goal" }).click();
    await page.waitForURL(/\/assets\/goals\/[0-9a-f-]{36}$/); await waitText("goal-hero", "81.000.000");
  });

  await s.check("FINNY-115.4/5 a goal: saved, needed vs your pace, the month at your pace, the chart, a budget line", async () => {
    const h = await text("goal-hero");
    ok(h.includes("Rp 81.000.000 of 150.000.000") && (await text("goal-needed")) === `Rp ${fmt(needed)}` && (await text("goal-pace")) === "Rp 2.100.000", h);
    ok((await text("goal-reach")).includes(`At your pace you reach it by ${mon(reached)}, after Jun 2028`), await text("goal-reach"));
    ok((await page.getByRole("img", { name: /DP rumah: saved over time/ }).count()) === 1, "the chart");
    ok((await text("goal-sources")).includes("45.000.000 of 63.400.000") && (await text("goal-sources")).includes("all of it"), await text("goal-sources"));
    await noSideScroll("Goal"); await shot(page, shots, "s11-03-goal-375");
    await page.getByRole("button", { name: `Add Rp ${fmt(needed)} to this month's budget` }).click();
    await page.getByRole("status").filter({ hasText: "DP rumah" }).waitFor();
    const cats = (await json("categories")).body; const list = Array.isArray(cats) ? cats : cats.categories;
    const c = list.find((x) => x.name === "DP rumah");
    ok(c?.kind === "saving", "a saving category named after the goal");
    ok((await json(`budgets?month=${N}`)).body.lines.find((l) => l.categoryId === c.id)?.plannedSen === needed, "this month's budget line");
  });

  await s.check("FINNY-115.1 the goals page: on track, behind, the emergency fund alongside", async () => {
    ok((await json("goals", { method: "POST", data: { name: "Trip to Japan", kind: "save", target: "30.000.000", byMonth: shiftMonth(N, 5), sources: [{ accountId: A.jago.id }] } })).status === 200, "trip");
    ok((await json("goals", { method: "POST", data: { name: "Net worth Rp 1 M", kind: "networth", target: "1.000.000.000", byMonth: "2030-12" } })).status === 200, "net worth goal");
    await json("emergency", { method: "PUT", data: { stability: "stable", spending: "5.000.000" } });
    await page.goto(base + "/assets/goals"); await page.getByTestId("goal-Trip to Japan").waitFor();
    const dp = await text("goal-DP rumah"), trip = await text("goal-Trip to Japan"), nw = await text("goal-Net worth Rp 1 M");
    ok(dp.includes("54%") && dp.includes("Behind") && dp.includes("BCA Tahapan + Reksadana Pasar Uang"), dp);
    ok(trip.includes("72%") && trip.includes("On track"), trip);
    ok(nw.includes("12%") && nw.includes("net worth") && nw.includes("Behind"), nw);
    ok((await text("goal-emergency")).includes("Emergency fund"), "the emergency fund card");
    await noSideScroll("Goals"); await shot(page, shots, "s11-01-goals-375");
    const trip2 = (await json("goals")).body.goals.find((g) => g.name === "Trip to Japan");
    ok(trip2.neededSen === rp(1_700_000) && trip2.paceSen === rp(2_000_000) && trip2.onTrack, `trip ${trip2.neededSen} ${trip2.paceSen}`);
  });

  await s.check("FINNY-115.2 edit and delete", async () => {
    await page.getByTestId("goal-DP rumah").click(); await waitText("goal-hero", "81.000.000");
    await page.getByRole("button", { name: "Edit" }).first().click();
    await page.getByLabel("Target (Rp)").fill("120.000.000"); await page.getByRole("button", { name: "Save goal" }).click();
    await waitText("goal-hero", "of 120.000.000");
    ok((await page.getByRole("progressbar", { name: "68% of target" }).count()) === 1, "81 of 120 = 67,5% → 68%");
    const nw = (await json("goals")).body.goals.find((g) => g.kind === "networth");
    ok((await json(`goals/${nw.id}`, { method: "DELETE" })).status === 200 && (await json(`goals/${nw.id}`)).status === 404, "deleted");
  });

  await s.check("FINNY-115.6 in the month-end review: each goal's % and change; kept at close", async () => {
    // DP rumah (now 120 jt) at the end of M: 45 + 23,4 + 5 × 2,1 = 78,9 jt = 65,75% → 66%; the month before 76,8 jt = 64% → +2 pts.
    // Trip at the end of M: 9,6 + 10 = 19,6 jt of 30 = 65,3% → 65%; before 17,6 jt = 58,7% → 59% → +6 pts.
    const r = (await json(`reviews/${M}`)).body;
    const g = Object.fromEntries(r.wealth.goals.map((x) => [x.name, [x.pct, x.change]]));
    ok(JSON.stringify(g["DP rumah"]) === "[66,2]" && JSON.stringify(g["Trip to Japan"]) === "[65,6]", JSON.stringify(g));
    await page.goto(`${base}/review/${M}`); await page.getByTestId("rv-goals").waitFor();
    ok(/DP rumah 66% · \+2 pts/.test(await text("rv-goals")) && /Trip to Japan 65% · \+6 pts/.test(await text("rv-goals")), await text("rv-goals"));
    await shot(page, shots, "s11-04-review-375");
    const c = (await json(`reviews/${M}/close`, { method: "POST", data: {} })).body;
    ok(c.summary.goals?.length === 2 && c.summary.goals.some((x) => x.name === "DP rumah" && x.pct === 66), "the summary keeps them");
    await page.goto(`${base}/review/${M}/close`); await page.getByTestId("rv-summary").waitFor();
    ok((await text("rv-summary")).includes("DP rumah +2 pts this month 66%"), await text("rv-summary"));
    await json(`reviews/${M}/reopen`, { method: "POST" });
  });

  await s.check("the rules are checked; export has the goals", async () => {
    const bad = async (data, label) => ok((await json("goals", { method: "POST", data })).status === 400, label);
    await bad({ kind: "save", target: "1.000", sources: [{ accountId: A.jago.id }] }, "no name");
    await bad({ name: "x", kind: "save", target: "0", sources: [{ accountId: A.jago.id }] }, "a target of 0");
    await bad({ name: "x", kind: "save", target: "1.000", byMonth: shiftMonth(N, -1), sources: [{ accountId: A.jago.id }] }, "a past month");
    await bad({ name: "x", kind: "save", target: "1.000", byMonth: "2028-6", sources: [{ accountId: A.jago.id }] }, "not a month");
    await bad({ name: "x", kind: "save", target: "1.000", sources: [{ accountId: A.card.id }] }, "a card");
    await bad({ name: "x", kind: "save", target: "1.000", sources: [{ accountId: A.jago.id }, { accountId: A.jago.id }] }, "the same account twice");
    await bad({ name: "x", kind: "save", target: "1.000", sources: [] }, "no accounts");
    const nd = (await json("goals", { method: "POST", data: { name: "No date", kind: "save", target: "1.000.000.000", sources: [{ accountId: A.jago.id }] } })).body;
    ok((await json(`goals/${nd.id}/budget`, { method: "POST" })).status === 400, "a budget line needs a date");
    ok((await json("goals/not-a-goal")).status === 404, "an unknown goal");
    const r = await page.request.get(base + "/api/export"); ok((await r.body()).toString("latin1").includes("goals.csv"), "export");
  });

  await s.check("desktop and accessibility", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    const id = (await json("goals")).body.goals.find((g) => g.name === "DP rumah").id;
    for (const p of ["/assets/goals", `/assets/goals/${id}`, "/assets"]) { await page.goto(base + p); await page.waitForLoadState("networkidle"); await scan(p); }
    await page.goto(base + "/assets/goals"); await page.getByRole("button", { name: "Add a goal" }).click(); await page.getByLabel("Name").waitFor(); await scan("new goal sheet"); await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(`${base}/assets/goals/${id}`); await page.getByTestId("goal-chart").waitFor(); await noSideScroll("Desktop"); await shot(page, shots, "s11-05-goal-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
