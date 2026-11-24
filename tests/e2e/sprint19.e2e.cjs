// Sprint 19 (v0.19.0) QA, 🐧 Bubbles: Finny on the phone (FINNY-176). Every finding of "Finny · Phone audit (v0.18.0)"
// checked directly on a production build as a phone (touch) at 360, 390 and 430 px, the keyboard as a 500 px tall screen,
// and offline after one visit. Four months of made-up data across every feature (the audit's set).
const { suite, ok, browser, shot } = require("./helpers.cjs");
const { default: AxeBuilder } = require("@axe-core/playwright");
const path = require("node:path");

module.exports = async ({ base, shots }) => {
  const s = suite("sprint19");
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: "allow" });
  const p = await ctx.newPage(); p.on("dialog", (d) => d.accept());
  const errors = []; p.on("pageerror", (e) => errors.push(`${p.url()} ${e.message}`));
  const j = async (m, u, d) => { const r = await p.request.fetch(base + "/api/" + u, { method: m, data: d, headers: { "content-type": "application/json" } }); return r.json().catch(() => ({})); };
  const go = async (path_) => { await p.goto(base + path_); await p.waitForLoadState("networkidle"); await p.waitForTimeout(300); };
  await p.goto(base + "/login"); await p.getByLabel("Email").fill("owner@finny.test"); await p.getByRole("button", { name: "Dev sign-in" }).click(); await p.waitForURL(base + "/");
  await j("DELETE", "me/data", { confirm: "DELETE" });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date()), N = today.slice(0, 7);
  const sm = (m, by) => { const [y, mm] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mm - 1 + by, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
  const A = {};
  for (const [k, n, t, o, extra] of [["bca", "BCA", "bank", "62.000.000"], ["mandiri", "Mandiri", "bank", "18.000.000"], ["cash", "Tunai", "cash", "1.500.000"], ["gopay", "GoPay", "ewallet", "800.000"],
    ["cc", "CC Mandiri", "card", "0", { limit: "36.000.000", statementDay: 21, dueDay: 5 }], ["loan", "ShopeePinjam", "loan", "0", { limit: "10.000.000" }], ["rdpu", "Reksadana Pasar Uang", "investment", "20.000.000"], ["saham", "Saham BBCA", "investment", "15.000.000"]])
    A[k] = await j("POST", "accounts", { name: n, type: t, opening: o, openingOn: "2025-01-01", ...(extra || {}) });
  await j("POST", "categories/starter", {});
  const cats = await j("GET", "categories"); const list = Array.isArray(cats) ? cats : cats.categories; const C = (n) => list.find((c) => c.name === n)?.id;
  const sp = [["Beli Kopi", 45000, "bca", "Kopi"], ["Makan di Luar", 120000, "gopay", "Makan malam"], ["Belanja Dapur dan Rumah Tangga", 650000, "cc", "Belanja mingguan"], ["Biaya Listrik", 400000, "mandiri", "Token listrik"], ["Biaya Bensin", 150000, "cash", "Bensin"]];
  for (let i = 3; i >= 0; i--) {
    const m = sm(N, -i), last = i === 0 ? Number(today.slice(8)) : 28;
    await j("POST", "transactions", { kind: "income", amount: "15.000.000", accountId: A.bca.id, categoryId: C("Gaji") ?? C("Gaji Bulanan") ?? list.find((c) => c.kind === "income").id, description: "Gaji", on: `${m}-01` });
    for (let d = 2; d <= last; d += 3) { const [c, a, acc, desc] = sp[d % sp.length]; await j("POST", "transactions", { kind: "spend", amount: String(a + d * 1000), accountId: A[acc].id, categoryId: C(c) ?? list.find((x) => x.kind === "expense").id, description: desc, on: `${m}-${String(d).padStart(2, "0")}` }); }
    await j("POST", "transactions", { kind: "transfer", amount: "2.000.000", accountId: A.bca.id, toAccountId: A.cc.id, description: "Bayar kartu", on: `${m}-${String(Math.min(5, last)).padStart(2, "0")}` });
    await j("POST", "transactions", { kind: "transfer", amount: "1.500.000", accountId: A.bca.id, toAccountId: A.rdpu.id, description: "Nabung RDPU", on: `${m}-01` });
  }
  for (const c of ["Beli Kopi", "Makan di Luar", "Belanja Dapur dan Rumah Tangga", "Biaya Listrik", "Biaya Bensin"]) if (C(c)) await j("PUT", "budgets", { categoryId: C(c), month: "*", amountSen: c === "Belanja Dapur dan Rumah Tangga" ? 250000000 : 60000000 });
  await j("PUT", "budgets/income", { month: "*", amount: "15.000.000" });
  await j("PUT", `accounts/${A.cc.id}/terms`, { interest: "1,75", interestPer: "month", minPct: "5", minFloor: "50.000" });
  await j("PUT", `accounts/${A.loan.id}/terms`, { interest: "2,5", interestPer: "month", minFixed: "850.000" });
  await j("PUT", `accounts/${A.rdpu.id}/holding`, { kind: "fund" }); await j("PUT", `accounts/${A.saham.id}/holding`, { kind: "stock" });
  await j("POST", "assets/values", { on: today, values: [{ accountId: A.rdpu.id, value: "26.400.000" }, { accountId: A.saham.id, value: "13.800.000" }] });
  await j("POST", "things", { name: "Motor Vario", kind: "vehicle", boughtOn: "2024-03-01", cost: "24.000.000" });
  await j("PUT", "emergency", { stability: "fair", dependents: 1 }); await j("PUT", "emergency/sources", { sources: [{ accountId: A.mandiri.id }, { accountId: A.rdpu.id, part: "10.000.000" }] }); await j("PUT", "emergency", { monthly: "2.000.000" });
  const g = await j("POST", "goals", { name: "DP rumah", kind: "save", target: "150.000.000", byMonth: sm(N, 20), sources: [{ accountId: A.bca.id, part: "30.000.000" }] });
  await j("POST", "goals", { name: "Net worth Rp 500 jt", kind: "networth", target: "500.000.000", byMonth: sm(N, 36) });
  const M = sm(N, -1);
  await j("POST", "recurring", { name: "Netflix", kind: "spend", amount: "54.900", accountId: A.cc.id, categoryId: list.find((c) => c.kind === "expense").id, every: "month", anchorOn: today });
  const pages = ["/", "/budget", "/accounts", "/transactions", "/reports", "/reports?view=balance", "/debts", "/assets", "/assets/emergency", "/assets/emergency/plan", "/assets/goals", `/assets/goals/${g.id}`, "/review", `/review/${M}`, `/review/${M}/close`, "/settings", "/settings/recurring", "/categories", "/import/statements"];

  await s.check("1 · keyboard up (390 × 500): every sheet keeps its title and Save (and Delete) in view", async () => {
    await p.setViewportSize({ width: 390, height: 500 });
    const sheets = [
      ["/", async () => p.getByRole("button", { name: "Add a transaction" }).last().click(), [/^Save$/]],
      ["/", async () => p.locator('button[aria-label^="Edit "]').first().click(), [/^Save changes$/, /^Delete$/]],
      ["/accounts", async () => p.getByRole("button", { name: "New account" }).click(), [/^Add account$/]],
      ["/categories", async () => p.getByRole("button", { name: "New category" }).click(), [/^Add category$/]],
      ["/settings/recurring", async () => p.getByRole("button", { name: "Add recurring" }).click(), [/^Save/]],
      ["/assets/goals", async () => p.getByRole("button", { name: /Add a goal|New goal/ }).first().click(), [/^Save goal$/]],
      ["/assets/emergency", async () => p.getByRole("button", { name: /^Change$/ }).first().click(), [/^Save target$/]],
    ];
    for (const [where, open, buttons] of sheets) {
      await go(where); await open(); const d = p.getByRole("dialog"); await d.waitFor(); await p.waitForTimeout(450);
      const h = await d.locator(".fy-sheet-h").boundingBox(); ok(h && h.y >= 0 && h.y < 500, `${where}: title row at ${h && Math.round(h.y)}`);
      for (const re of buttons) { const bb = await d.getByRole("button", { name: re }).first().boundingBox(); ok(bb && bb.y >= 0 && bb.y + bb.height <= 500, `${where}: ${re} at ${bb && Math.round(bb.y)}–${bb && Math.round(bb.y + bb.height)}`); }
      if (where === "/" && buttons.length === 1) await p.screenshot({ path: path.join(shots, "s19-01-keyboard-add.png") });
      await p.keyboard.press("Escape"); await d.waitFor({ state: "detached" });
    }
    await p.setViewportSize({ width: 390, height: 844 });
  });

  await s.check("2 · no field under 16 px on a phone (an iPhone would zoom)", async () => {
    const bad = [];
    for (const path_ of pages) { await go(path_); bad.push(...(await p.evaluate(() => [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), select, textarea")].filter((e) => e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => `${location.pathname} ${e.getAttribute("aria-label") || e.name || e.tagName} ${getComputedStyle(e).fontSize}`)))); }
    await go("/"); await p.getByRole("button", { name: "Add a transaction" }).last().click(); await p.getByRole("dialog").waitFor();
    bad.push(...(await p.evaluate(() => [...document.querySelectorAll("[role=dialog] input:not([type=hidden]):not([type=checkbox]):not([type=radio]), [role=dialog] select, [role=dialog] textarea")].filter((e) => e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => `sheet ${e.getAttribute("aria-label")} ${getComputedStyle(e).fontSize}`))));
    await p.keyboard.press("Escape");
    ok(!bad.length, bad.join(" | "));
  });

  await s.check("3/9/10 · nothing cut at 360 px; Nov 2026 on the filter; a scrolling chip row fades", async () => {
    await p.setViewportSize({ width: 360, height: 740 });
    const bad = [];
    for (const path_ of pages) {
      await go(path_);
      bad.push(...(await p.evaluate(() => [...document.querySelectorAll("main .fy-row .t, main .fy-row .s, main .fy-amt")].filter((e) => e.getClientRects().length && (e.scrollHeight > e.clientHeight + 2 || e.scrollWidth > e.clientWidth + 1) && /\d/.test(e.textContent)).map((e) => `${location.pathname} "${e.textContent.trim().slice(0, 40)}"`))));
    }
    ok(!bad.length, bad.slice(0, 8).join(" | "));
    await go("/assets/emergency"); ok((await p.locator("main").innerText()).includes("Rp 10.000.000 of 26.400.000"), "emergency source line whole");
    await shot(p, shots, "s19-02-emergency-360");
    await go("/transactions"); const sel = p.getByLabel("Month", { exact: true });
    ok((await sel.evaluate((e) => e.options[e.selectedIndex].text)).match(/^[A-Z][a-z]{2} \d{4}$/), await sel.evaluate((e) => e.options[e.selectedIndex].text));
    ok((await p.locator(".fy-chips").first().evaluate((e) => getComputedStyle(e).maskImage || getComputedStyle(e).webkitMaskImage)) !== "none", "no fade");
    await shot(p, shots, "s19-03-transactions-360");
    await p.setViewportSize({ width: 390, height: 844 });
  });

  await s.check("4 · offline: every screen says so, not only Home", async () => {
    for (const path_ of ["/", "/budget", "/accounts", "/transactions", "/settings/recurring"]) await go(path_);
    await p.evaluate(() => navigator.serviceWorker.ready); await go("/budget"); await p.waitForFunction(() => !!navigator.serviceWorker.controller);
    for (const path_ of ["/budget", "/accounts", "/transactions", "/settings/recurring"]) await go(path_);
    await ctx.setOffline(true);
    for (const path_ of ["/budget", "/accounts", "/transactions", "/settings/recurring", "/"]) {
      await p.goto(base + path_); await p.getByTestId("offline-banner").waitFor({ timeout: 15000 }).catch(() => { throw new Error(`no offline line on ${path_}`); });
      ok(/^Offline · numbers as of \d\d:\d\d/.test((await p.getByTestId("offline-banner").innerText()).replace(/\s+/g, " ")), `${path_}: ${await p.getByTestId("offline-banner").innerText()}`);
      if (path_ === "/budget") await p.screenshot({ path: path.join(shots, "s19-04-offline-budget.png") });
    }
    await ctx.setOffline(false);
  });

  await s.check("5/6 · every tap target reaches 44 × 44 on a phone (touched 21 px out from its centre)", async () => {
    const bad = [];
    for (const path_ of pages) {
      await go(path_);
      bad.push(...(await p.evaluate(() => {
        const out = [];
        for (const e of document.querySelectorAll("main a[href], main button, main input:not([type=hidden]), main select, main textarea, main [role=slider], .fy-tabbar a, .fy-tabbar button")) {
          const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
          if (!r.width || !r.height || cs.visibility === "hidden" || r.top < 70 || r.bottom > innerHeight - 100 || r.left < 0 || r.right > innerWidth) continue;
          if (e.matches("input[type=file]") || e.closest(".fy-chips") && (r.right > innerWidth - 30)) continue; // hidden file inputs (their label is the target); chips half off a scrolling row
          const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const pts = [[cx, cy - 21], [cx, cy + 21]]; if (r.width < 44) pts.push([cx - 21, cy], [cx + 21, cy]);
          const miss = pts.filter(([x, y]) => { const h = document.elementFromPoint(x, y); return !h || !(h === e || e.contains(h)); });
          if (miss.length) out.push(`${location.pathname} ${e.tagName.toLowerCase()}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 28)} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
        return out;
      })));
    }
    ok(!bad.length, `${bad.length}: ${bad.slice(0, 10).join(" | ")}`);
    await go("/reports"); await shot(p, shots, "s19-05-reports-390");
  });

  await s.check("7/8 · Select by the list; chart labels 12 px", async () => {
    await go("/transactions");
    const sel = await p.getByRole("button", { name: "Select" }).boundingBox(), chips = await p.locator(".fy-chips").first().boundingBox();
    ok(sel && Math.abs(sel.y + sel.height / 2 - (chips.y + chips.height / 2)) < 12 && sel.y > 150, `Select at ${sel && Math.round(sel.y)}, chips at ${Math.round(chips.y)}`); // in the chip row, by the list, not the top corner
    const small = [];
    for (const path_ of ["/reports", "/reports?view=balance", "/reports?view=pace", `/assets/goals/${g.id}`, "/assets/emergency/plan", "/"]) { await go(path_); small.push(...(await p.evaluate(() => [...document.querySelectorAll("main svg text, main .fy-bars-axis span")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => `${location.pathname} "${e.textContent}" ${getComputedStyle(e).fontSize}`)))); }
    ok(!small.length, small.slice(0, 6).join(" | "));
  });

  await s.check("axe (WCAG 2.2 AA) and no sideways scroll at 360, 390 and 430 px", async () => {
    const bad = [];
    for (const [w, h] of [[390, 844], [360, 740], [430, 932]]) {
      await p.setViewportSize({ width: w, height: h });
      for (const path_ of pages) { await go(path_); if (await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) bad.push(`${w} ${path_} sideways`);
        if (w === 390) for (const v of (await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact))) bad.push(`${path_} ${v.id} ${v.nodes[0]?.target.join(" ")}`); }
    }
    ok(!bad.length, bad.join(" | "));
    await p.setViewportSize({ width: 390, height: 844 });
  });

  await s.check("no page errors", async () => ok(!errors.length, errors.join(" | ")));
  await j("DELETE", "me/data", { confirm: "DELETE" });
  await b.close();
  s.done();
};
