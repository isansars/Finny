"use client";
// Home (Sprint 1, before the dashboard): the total across open accounts, the month's income and spending, then the
// month's transactions by day, filterable by account, category and text (FINNY-9 AC 6).
import { useEffect, useMemo, useState } from "react";
import { api, useFinny, type Txn } from "./store";
import { Money, CategoryOptions } from "./ui";
import { QuickAddForm } from "./QuickAdd";
import { formatRupiah } from "@/lib/money";
import { dayLabel, monthLabel, shiftMonth, todayIn } from "@/lib/dates";

type Totals = { incomeSen: number; spendSen: number; savedSen: number; investedSen: number };

export function Home() {
  const { accounts, categories, version, loaded, openAdd } = useFinny();
  const today = todayIn();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [accountF, setAccountF] = useState("");
  const [categoryF, setCategoryF] = useState("");
  const [q, setQ] = useState("");
  const [list, setList] = useState<{ items: Txn[]; more: boolean } | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    const p = new URLSearchParams({ month }); if (accountF) p.set("account", accountF); if (categoryF) p.set("category", categoryF); if (q.trim()) p.set("q", q.trim());
    const t = setTimeout(() => {
      api<{ items: Txn[]; more: boolean }>(`transactions?${p}`).then((r) => { setList(r); setErr(""); }).catch((e) => setErr(e.message));
      api<Totals>(`summary?month=${month}`).then(setTotals).catch(() => {});
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [month, accountF, categoryF, q, version]);

  const acc = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const cat = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const net = accounts.filter((a) => !a.archived).reduce((s, a) => s + a.balanceSen, 0);
  const days = useMemo(() => {
    const m = new Map<string, Txn[]>();
    for (const t of list?.items ?? []) { const d = m.get(t.on) ?? []; d.push(t); m.set(t.on, d); }
    return [...m.entries()];
  }, [list]);

  return (
    <div className="fy-split home">
      <section>
        <div className="fy-h1"><span>Home</span>
          <span className="fy-month" aria-label="Month">
            <button aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>◀</button>
            <span data-testid="month">{monthLabel(month)}</span>
            <button aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))}>▶</button>
          </span>
        </div>
        <div className="fy-hero">
          <small>Net across accounts</small><b data-testid="net">{formatRupiah(net)}</b>
          <div className="fy-tiles">
            <div className="fy-tile">Income<b className="fy-amt income" data-testid="income">{formatRupiah(totals?.incomeSen ?? 0)}</b></div>
            <div className="fy-tile">Spent<b className="fy-amt spend" data-testid="spent">{formatRupiah(totals?.spendSen ?? 0)}</b></div>
            {(totals?.savedSen ?? 0) > 0 && <div className="fy-tile">Saved<b>{formatRupiah(totals!.savedSen)}</b></div>}
            {(totals?.investedSen ?? 0) > 0 && <div className="fy-tile">Invested<b>{formatRupiah(totals!.investedSen)}</b></div>}
          </div>
        </div>
        <div className="fy-filters">
          <input className="fy-input" type="search" placeholder="Search" aria-label="Search transactions" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="fy-input" aria-label="Filter by account" value={accountF} onChange={(e) => setAccountF(e.target.value)}>
            <option value="">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? " (closed)" : ""}</option>)}
          </select>
          <select className="fy-input" aria-label="Filter by category" value={categoryF} onChange={(e) => setCategoryF(e.target.value)}>
            <option value="">All categories</option><CategoryOptions cats={categories} kinds={["expense", "income", "saving", "investment"]} includeOff />
          </select>
        </div>
        {err && <div className="fy-err">{err}</div>}
        {loaded && list && !list.items.length && (
          <div className="fy-empty">
            {accounts.length ? <><b>Nothing here yet</b>{q || accountF || categoryF ? "No transactions match." : `No transactions in ${monthLabel(month)}.`}
              {!q && !accountF && !categoryF && <div style={{ marginTop: 12 }}><button className="fy-btn" onClick={() => openAdd()}>＋ Add a transaction</button></div>}</>
            : <><b>Welcome to Finny 👋</b>Start with your accounts: cash, banks, e-wallets and cards.<div style={{ marginTop: 12 }}><a className="fy-btn" href="/accounts?add=1">＋ Add an account</a></div></>}
          </div>
        )}
        <div data-testid="txn-list">
          {days.map(([day, items]) => {
            const out = items.reduce((s, t) => s + (t.kind === "spend" ? -t.amountSen : t.kind === "income" ? t.amountSen : 0), 0);
            return (
              <div key={day}>
                <div className="fy-grp"><span>{dayLabel(day, today)}</span><span>{out ? formatRupiah(out, { sign: "always" }) : ""}</span></div>
                {items.map((t) => {
                  const c = t.categoryId ? cat.get(t.categoryId) : undefined;
                  const sub = t.kind === "transfer" ? `${acc.get(t.accountId)?.name ?? "?"} → ${t.toAccountId ? acc.get(t.toAccountId)?.name ?? "?" : "?"}` : `${c?.name ?? "—"} · ${acc.get(t.accountId)?.name ?? "?"}`;
                  return (
                    <div key={t.id} className="fy-row tap" role="button" tabIndex={0} aria-label={`Edit ${t.description || sub}`} onClick={() => openAdd(t)} onKeyDown={(e) => { if (e.key === "Enter") openAdd(t); }}>
                      <div className="grow"><div className="t">{t.kind === "transfer" ? "🔁 " : c?.emoji ? c.emoji + " " : ""}{t.description || (t.kind === "transfer" ? "Transfer" : c?.name ?? "")}</div>
                        <div className="s">{sub}{t.entity ? ` · ${t.entity}` : ""}</div></div>
                      <Money sen={t.amountSen} kind={t.kind} />
                    </div>
                  );
                })}
              </div>
            );
          })}
          {list?.more && <p className="fy-empty">Showing the latest 200: narrow the filters to see more.</p>}
        </div>
      </section>
      <aside className="side fy-side-only"><div className="fy-card"><div className="fy-sheet-h"><span>Add</span></div><QuickAddForm inline /></div></aside>
    </div>
  );
}
