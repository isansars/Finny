// Sprint 10 (v0.10.0) QA, 🐧 Bubbles: the month-end review (FINNY-107), end to end in a browser, on made-up accounts,
// statements, budgets and transactions whose figures are worked out by hand below. Never real data.
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");
const { randomBytes } = require("node:crypto");

const shiftMonth = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const lastDay = (m) => { const [y, mm] = m.split("-").map(Number); return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`; };
const NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const name = (m) => NAMES[Number(m.slice(5)) - 1];

module.exports = async ({ base, shots }) => {
  const s = suite("sprint10");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const N = today.slice(0, 7), M = shiftMonth(N, -1), P = shiftMonth(N, -2), Q = shiftMonth(N, -3);
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
  const A = {}, C = {};
  A.bca = (await json("accounts", { method: "POST", data: { name: "BCA", type: "bank", opening: "50.000.000", openingOn: "2024-01-01" } })).body;
  A.bri = (await json("accounts", { method: "POST", data: { name: "BRI card", type: "card", opening: "0", openingOn: "2024-01-01" } })).body;
  A.fund = (await json("accounts", { method: "POST", data: { name: "Reksadana", type: "investment", opening: "0", openingOn: "2024-01-01" } })).body;
  for (const [k, n, kind] of [["gaji", "Gaji", "income"], ["makan", "Makan di Luar", "expense"], ["belanja", "Belanja Bulanan", "expense"], ["transport", "Transport", "expense"]])
    C[k] = (await json("categories", { method: "POST", data: { name: n, kind } })).body;
  const tx = (kind, amount, on, extra) => json("transactions", { method: "POST", data: { kind, amount, accountId: A.bca.id, on, description: "x", ...extra } });
  // Month P (two months ago): Gaji 10.000.000 in; Belanja 6.000.000 out; and the card statement (P's 15th, Transport 100.000).
  await tx("income", "10.000.000", `${P}-01`, { categoryId: C.gaji.id });
  await tx("spend", "6.000.000", `${P}-12`, { categoryId: C.belanja.id });
  const card = await json("statements", { method: "POST", data: { accountId: A.bri.id, bank: "bri-card", periodFrom: `${Q}-21`, periodTo: `${P}-20`, fileHash: randomBytes(32).toString("hex"),
    lines: [{ on: `${P}-15`, kind: "spend", sen: 10_000_000, accountId: A.bri.id, categoryId: C.transport.id, description: "Ojek" }] } });
  ok(card.status === 200, `card statement ${card.status}`);
  // Month M (last month, the one reviewed): Gaji 15.000.000; Makan 2.240.000 (read from BCA's statement), Belanja 2.340.000,
  // Transport 1.040.000; 1.500.000 paid to the card. Budget M: Makan 2.000.000, Belanja 3.000.000, Transport 1.000.000.
  await tx("income", "15.000.000", `${M}-01`, { categoryId: C.gaji.id });
  const bca = await json("statements", { method: "POST", data: { accountId: A.bca.id, bank: "bca", periodFrom: `${M}-01`, periodTo: lastDay(M), fileHash: randomBytes(32).toString("hex"),
    lines: [{ on: `${M}-10`, kind: "spend", sen: 224_000_000, accountId: A.bca.id, categoryId: C.makan.id, description: "Makan" }] } });
  ok(bca.status === 200, `BCA statement ${bca.status}`);
  await tx("spend", "2.340.000", `${M}-12`, { categoryId: C.belanja.id });
  await tx("spend", "1.040.000", `${M}-14`, { categoryId: C.transport.id });
  await json("transactions", { method: "POST", data: { kind: "transfer", amount: "1.500.000", accountId: A.bca.id, toAccountId: A.bri.id, description: "Bayar kartu", on: `${M}-20` } });
  for (const [k, amt] of [["makan", 200_000_000], ["belanja", 300_000_000], ["transport", 100_000_000]]) await json("budgets", { method: "PUT", data: { categoryId: C[k].id, month: M, amountSen: amt } });
  // This month N: Makan's budget 2.000.000 is already planned, and 1.900.000 is spent (95%).
  await json("budgets", { method: "PUT", data: { categoryId: C.makan.id, month: N, amountSen: 200_000_000 } });
  await tx("spend", "1.900.000", `${N}-01`, { categoryId: C.makan.id });
  // By hand for M: in 15.000.000, out 2.240.000 + 2.340.000 + 1.040.000 = 5.620.000, kept 9.380.000 = 62,5% → 63%.
  // P: in 10.000.000, out 6.100.000, kept 3.900.000. Six months to M together: kept 13.280.000 of 25.000.000 = 53,1% → 53%.
  // Budget used 5.620.000 of 6.000.000 = 93,7% → 94%; over: Makan 112% (+240.000), Transport 104% (+40.000); under: Belanja (−660.000).
  // Net worth at M's end: 50.000.000 + 25.000.000 in − 6.100.000 − 5.620.000 out = 63.280.000 (the card is 1.400.000 in credit);
  // at P's end 53.900.000, so +9.380.000. Debts paid down in M: 1.500.000.
  // Plan N from M: Makan is already planned (stays 2.000.000); Belanja copies 3.000.000; Transport becomes 1.040.000 rounded up to 1.050.000.

  await s.check("FINNY-107.6 Home: the review nudge, and a budget warning at 90%", async () => {
    await page.goto(base + "/"); await page.getByTestId("rv-nudge").waitFor();
    ok((await text("rv-nudge")).includes(`${name(M)} is ready for review`) && (await text("rv-nudge")).includes("0 of 4 done · BRI card statement still to read"), await text("rv-nudge"));
    await page.getByTestId("budget-warning").waitFor();
    ok((await text("budget-warning")).includes("Makan di Luar is at 95%") && (await text("budget-warning")).includes("to go"), await text("budget-warning"));
    await noSideScroll("Home"); await page.screenshot({ path: require("node:path").join(shots, "s10-04-home-375.png") });
  });

  await s.check("FINNY-107.1/2 the review: four steps; statements read or not, by the month the period ends", async () => {
    await page.getByTestId("rv-nudge").click(); await page.waitForURL(`${base}/review/${M}`);
    await waitText("rv-head", "0 of 4 done");
    const st = await text("rv-statements");
    ok(st.includes("1 of 2 accounts read") && /BCA 1–\d+ \w+ · 1 line/.test(st) && /BRI card.*Not read yet.*Read it/.test(st), st);
    ok((await page.getByRole("img", { name: "Statements: not done" }).count()) === 1, "statements not done");
    ok((await text("rv-budget")).includes("2 over") && (await text("rv-wealth")).includes("Investments not valued yet"), `${await text("rv-budget")} / ${await text("rv-wealth")}`);
    ok((await text("rv-wealth")).includes("Rp 63.280.000") && (await text("rv-wealth")).includes("+Rp 9.380.000"), await text("rv-wealth"));
    await noSideScroll("Review"); await shot(page, shots, "s10-01-review-375");
    const api = (await json(`reviews/${P}`)).body;
    const read = Object.fromEntries(api.statements.accounts.map((a) => [a.name, a.read]));
    ok(read["BRI card"] === true && read.BCA === false, `P: the card's period ends in P, BCA's in M: ${JSON.stringify(read)}`);
  });

  await s.check("FINNY-107.3 budget: over and under, kept, plan next month (raise what ran over, keep what's planned)", async () => {
    await page.getByTestId("rv-budget").getByRole("link").click(); await page.waitForURL(`${base}/review/${M}/budget`);
    await page.getByTestId("rv-over").waitFor();
    const over = await text("rv-over"), under = await text("rv-under");
    ok(/Makan di Luar.*112%.*2\.240\.000 of 2\.000\.000.*\+240\.000/.test(over) && /Transport.*104%.*\+40\.000/.test(over) && over.indexOf("Makan") < over.indexOf("Transport"), over);
    ok(/Belanja Bulanan.*2\.340\.000 of 3\.000\.000.*−660\.000/.test(under), under);
    ok((await text("rv-bud-head")).includes("Kept Rp 9.380.000 · 63% of income"), await text("rv-bud-head"));
    ok((await text("rv-plan")).includes("Transport: Rp 1.050.000"), await text("rv-plan"));
    await shot(page, shots, "s10-02-budget-375");
    await page.getByRole("button", { name: `Plan ${name(N)}` }).click();
    await page.getByRole("status").filter({ hasText: "planned" }).waitFor();
    ok((await page.getByRole("status").filter({ hasText: "planned" }).innerText()).includes("2 lines, 1 raised"), await page.getByRole("status").filter({ hasText: "planned" }).innerText());
    const nb = (await json(`budgets?month=${N}`)).body.lines; const at = (k) => nb.find((l) => l.categoryId === C[k].id)?.plannedSen;
    ok(at("makan") === 200_000_000 && at("belanja") === 300_000_000 && at("transport") === 105_000_000, `next: ${at("makan")} ${at("belanja")} ${at("transport")}`);
    ok((await json(`reviews/${M}/plan-next`, { method: "POST" })).body.added.length === 0, "planning again adds nothing");
    await page.getByRole("button", { name: "Done with budget" }).click(); await page.waitForURL(`${base}/review/${M}`);
    await waitText("rv-head", "1 of 4 done");
    ok((await page.getByRole("img", { name: "Budget: done" }).count()) === 1, "budget ticked");
  });

  await s.check("FINNY-107.4 net worth and savings: values, Done", async () => {
    ok((await page.getByTestId("rv-wealth").getByRole("link", { name: "Update values" }).count()) === 1, "Update values link");
    await page.getByTestId("rv-wealth").getByRole("button", { name: "Done" }).click();
    await waitText("rv-head", "2 of 4 done");
    ok((await page.getByRole("img", { name: "Net worth and savings: done" }).count()) === 1, "wealth ticked");
  });

  await s.check("FINNY-107.5 close the month: the summary, a note, saved; reopen", async () => {
    await page.getByTestId("rv-close").getByRole("link").click(); await page.waitForURL(`${base}/review/${M}/close`);
    await page.getByTestId("rv-summary").waitFor();
    const sum = await text("rv-summary"), head = await text("rv-sum-head");
    ok(head.includes("Rp 63.280.000") && head.includes("Rp 9.380.000") && head.includes(`since ${name(P)}`) && head.includes("Rp 15.000.000") && head.includes("Rp 5.620.000"), head);
    ok(/Kept 63% of income · 6-month average 53% 9\.380\.000/.test(sum) && /Budget 2 over, 1 under 94%/.test(sum) && /Debts Paid down this month 1\.500\.000/.test(sum), sum);
    await page.getByLabel("A note for this month (optional)").fill("Bonus month; dinner out twice.");
    await shot(page, shots, "s10-03-close-375");
    await page.getByRole("button", { name: `Close ${name(M)}` }).click();
    await page.getByTestId("rv-note").waitFor();
    ok((await text("rv-note")).includes("Bonus month"), "note saved");
    // A late transaction in M doesn't change the saved summary.
    await tx("spend", "1.000.000", `${M}-28`, { categoryId: C.belanja.id });
    const closed = (await json(`reviews/${M}`)).body;
    ok(closed.closed && closed.summary.outSen === 562_000_000 && closed.summary.keptPct === 63, `saved ${closed.summary.outSen}`);
    ok((await json(`reviews/${M}/close`, { method: "POST", data: {} })).status === 400, "closing twice");
    await page.getByRole("button", { name: `Reopen ${name(M)}` }).click();
    await page.getByRole("button", { name: `Close ${name(M)}` }).waitFor();
    ok((await json(`reviews/${M}`)).body.summary.outSen === 662_000_000, "reopened shows live figures");
    await page.getByRole("button", { name: `Close ${name(M)}` }).click(); await page.getByTestId("rv-note").waitFor();
  });

  await s.check("FINNY-107.6 after closing: no nudge; past reviews on Home and /review", async () => {
    await page.goto(base + "/"); await page.getByTestId("rv-past-home").waitFor();
    ok(!(await page.getByTestId("rv-nudge").count()), "nudge gone");
    ok((await text("rv-past-home")).includes(`${name(M)} ${M.slice(0, 4)}`) && (await text("rv-past-home")).includes("Kept 56%"), await text("rv-past-home"));
    await page.goto(base + "/review"); await page.getByTestId("rv-past").waitFor();
    ok((await text("rv-none-due")).includes("Nothing to review") && (await text("rv-past")).includes(name(M)), await text("rv-past"));
  });

  await s.check("the rules are checked; export has the reviews", async () => {
    ok((await json(`reviews/${N}/close`, { method: "POST", data: {} })).status === 400, "closing this month");
    ok((await json(`reviews/${shiftMonth(N, 1)}`)).status === 400, "a future month");
    ok((await json("reviews/2026-13")).status === 400, "not a month");
    ok((await json(`reviews/${P}`, { method: "PATCH", data: {} })).status === 400, "nothing to change");
    ok((await json(`reviews/${P}/close`, { method: "POST", data: { note: "x".repeat(1001) } })).status === 400, "a long note");
    const r = await page.request.get(base + "/api/export"); ok((await r.body()).toString("latin1").includes("month_reviews.csv"), "export");
  });

  await s.check("desktop and accessibility", async () => {
    const scan = async (l) => { await page.waitForTimeout(400); const v = (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations.filter((x) => ["serious", "critical"].includes(x.impact)); ok(!v.length, `${l}: ${v.map((x) => `${x.id} (${x.nodes.length}) ${x.nodes[0]?.target.join(" ")}`).join(", ")}`); };
    for (const p of [`/review/${M}`, `/review/${M}/budget`, `/review/${M}/close`, "/review", "/"]) { await page.goto(base + p); await page.waitForLoadState("networkidle"); await scan(p); }
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(`${base}/review/${M}`); await page.getByTestId("rv-statements").waitFor(); await noSideScroll("Desktop"); await shot(page, shots, "s10-05-review-desktop");
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await json("me/data", { method: "DELETE", data: { confirm: "DELETE" } });
  await b.close();
  s.done();
};
