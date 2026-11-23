// FINNY-78: the reports, worked out from transactions and accounts. Pure; tests/unit/report-rule.test.mts.
// Money in = income; money out = spending of any kind (expense, saving, investment); transfers between the owner's
// own accounts are neither. Everything stays in integer sen.

export type RTxn = { id?: string; on: string; kind: "spend" | "income" | "transfer"; amountSen: number; accountId: string; toAccountId: string | null; categoryId: string | null; description?: string };
export type RCat = { id: string; kind: string; parentId: string | null; name: string };
export type RAcc = { id: string; name: string; type: string; openingSen: number; openingOn: string; archived?: boolean };

const ym = (day: string) => day.slice(0, 7);
export function shift(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const daysIn = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const monthEnd = (month: string) => `${month}-${String(daysIn(month)).padStart(2, "0")}`;
/** The months from `from` to `to`, both included. */
export function monthsBetween(from: string, to: string): string[] { const out: string[] = []; for (let m = from; m <= to; m = shift(m, 1)) out.push(m); return out; }

// ---------------------------------------------------------------- cashflow

export function cashflow(txns: RTxn[], months: string[]) {
  const by = new Map(months.map((m) => [m, { month: m, inSen: 0, outSen: 0, keptSen: 0 }]));
  for (const t of txns) {
    const row = by.get(ym(t.on)); if (!row) continue;
    if (t.kind === "income") row.inSen += t.amountSen; else if (t.kind === "spend") row.outSen += t.amountSen;
  }
  const rows = [...by.values()].map((r) => ({ ...r, keptSen: r.inSen - r.outSen }));
  const sum = (k: "inSen" | "outSen" | "keptSen") => rows.reduce((n, r) => n + r[k], 0);
  return { months: rows, totals: { inSen: sum("inSen"), outSen: sum("outSen"), keptSen: sum("keptSen") } };
}

export type TreeNode = { id: string; name: string; kind: string; parentId: string | null; depth: number; sen: number; avg3Sen: number; hasChildren: boolean };
const SECTIONS = ["income", "expense", "saving", "investment"] as const;

/** A month's income and spending as the category tree (each node = itself + everything inside), with the 3-month average before it. */
export function categoryTree(txns: RTxn[], cats: RCat[], month: string) {
  const prev = [1, 2, 3].map((n) => shift(month, -n));
  const own = new Map<string, number>(), ownPrev = new Map<string, number>();
  for (const t of txns) {
    if (t.kind === "transfer" || !t.categoryId) continue;
    const m = ym(t.on);
    if (m === month) own.set(t.categoryId, (own.get(t.categoryId) ?? 0) + t.amountSen);
    else if (prev.includes(m)) ownPrev.set(t.categoryId, (ownPrev.get(t.categoryId) ?? 0) + t.amountSen);
  }
  const kids = new Map<string | null, RCat[]>();
  for (const c of cats) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c]);
  const total = (id: string, map: Map<string, number>): number => (map.get(id) ?? 0) + (kids.get(id) ?? []).reduce((n, k) => n + total(k.id, map), 0);
  const nodes: TreeNode[] = [];
  const walk = (c: RCat, depth: number) => {
    const sen = total(c.id, own), avg3Sen = Math.round(total(c.id, ownPrev) / 3);
    if (!sen && !avg3Sen) return;
    const ch = (kids.get(c.id) ?? []).sort((a, b) => total(b.id, own) - total(a.id, own) || a.name.localeCompare(b.name));
    nodes.push({ id: c.id, name: c.name, kind: c.kind, parentId: c.parentId, depth, sen, avg3Sen, hasChildren: ch.some((k) => total(k.id, own) || total(k.id, ownPrev)) });
    ch.forEach((k) => walk(k, depth + 1));
  };
  const sections = SECTIONS.map((kind) => {
    const roots = (kids.get(null) ?? []).filter((c) => c.kind === kind).sort((a, b) => total(b.id, own) - total(a.id, own) || a.name.localeCompare(b.name));
    const start = nodes.length; roots.forEach((r) => walk(r, 0));
    const list = nodes.slice(start);
    return { kind, sen: roots.reduce((n, r) => n + total(r.id, own), 0), avg3Sen: Math.round(roots.reduce((n, r) => n + total(r.id, ownPrev), 0) / 3), nodes: list };
  }).filter((s) => s.nodes.length);
  return { month, sections };
}

// ---------------------------------------------------------------- balances

const OWED = new Set(["card", "loan"]);
/** Each account's balance at the end of each month (opening + every flow on or before the last day). */
export function balancesAt(accounts: RAcc[], txns: RTxn[], months: string[]) {
  const ends = months.map(monthEnd);
  const sorted = [...txns].sort((a, b) => a.on.localeCompare(b.on));
  const bal = new Map(accounts.map((a) => [a.id, a.openingSen]));
  const out: { month: string; balances: Map<string, number> }[] = [];
  let i = 0;
  for (let k = 0; k < months.length; k++) {
    while (i < sorted.length && sorted[i].on <= ends[k]) {
      const t = sorted[i++];
      const add = (id: string, v: number) => { if (bal.has(id)) bal.set(id, bal.get(id)! + v); };
      if (t.kind === "income") add(t.accountId, t.amountSen);
      else if (t.kind === "spend") add(t.accountId, -t.amountSen);
      else if (t.toAccountId) { add(t.accountId, -t.amountSen); add(t.toAccountId, t.amountSen); }
    }
    const open = new Map<string, number>();
    for (const a of accounts) if (a.openingOn <= ends[k] || bal.get(a.id) !== a.openingSen) open.set(a.id, a.openingOn <= ends[k] ? bal.get(a.id)! : bal.get(a.id)! - a.openingSen);
    out.push({ month: months[k], balances: open });
  }
  return out;
}

/** Net worth per month, and the accounts at the last month: what you have and what you owe (cards and loans, as owed). */
export function balanceSheet(accounts: RAcc[], txns: RTxn[], month: string, history = 12) {
  const months = monthsBetween(shift(month, -(history - 1)), month);
  const at = balancesAt(accounts, txns, [shift(months[0], -1), ...months]);
  const worth = (b: Map<string, number>) => {
    let have = 0, owe = 0;
    for (const a of accounts) { const v = b.get(a.id); if (v === undefined) continue; if (OWED.has(a.type)) owe -= v; else have += v; }
    return { haveSen: have, oweSen: owe, netSen: have - owe };
  };
  const series = at.slice(1).map((x) => ({ month: x.month, ...worth(x.balances) }));
  const last = at[at.length - 1].balances, before = at[at.length - 2].balances;
  const row = (a: RAcc) => ({ id: a.id, name: a.name, type: a.type, archived: !!a.archived, sen: OWED.has(a.type) ? -(last.get(a.id) ?? 0) : last.get(a.id) ?? 0, changeSen: OWED.has(a.type) ? -((last.get(a.id) ?? 0) - (before.get(a.id) ?? 0)) : (last.get(a.id) ?? 0) - (before.get(a.id) ?? 0) });
  const shown = accounts.filter((a) => last.has(a.id) && (!a.archived || last.get(a.id) !== 0));
  const have = shown.filter((a) => !OWED.has(a.type)).map(row).sort((x, y) => y.sen - x.sen);
  const owe = shown.filter((a) => OWED.has(a.type)).map(row).sort((x, y) => y.sen - x.sen);
  const now = series[series.length - 1], prev = series.length > 1 ? series[series.length - 2] : worth(before);
  const yearAgo = series.length >= 12 ? series[0] : null;
  return { series, have, owe, ...now, month, changeSen: now.netSen - prev.netSen, yearChangeSen: yearAgo ? now.netSen - yearAgo.netSen : null };
}

// ---------------------------------------------------------------- spending pace

/** Running spending (expense categories only, like Home's "Spent") per day: this month, last month, the 3-month average. */
export function spendingPace(txns: RTxn[], cats: RCat[], month: string, today: string) {
  const expense = new Set(cats.filter((c) => c.kind === "expense").map((c) => c.id));
  const perDay = (m: string) => {
    const days = new Array(daysIn(m)).fill(0);
    for (const t of txns) if (t.kind === "spend" && t.categoryId && expense.has(t.categoryId) && ym(t.on) === m) days[Number(t.on.slice(8, 10)) - 1] += t.amountSen;
    let c = 0; return days.map((v) => (c += v));
  };
  const n = daysIn(month);
  const isNow = ym(today) === month, gone = isNow ? Number(today.slice(8, 10)) : today < month ? 0 : n;
  const thisMonth = perDay(month).slice(0, gone);
  const last = perDay(shift(month, -1));
  const three = [1, 2, 3].map((k) => perDay(shift(month, -k)));
  const at = (arr: number[], d: number) => (arr.length ? arr[Math.min(d, arr.length - 1)] : 0);
  const avg3 = Array.from({ length: n }, (_, d) => Math.round(three.reduce((s, a) => s + at(a, d), 0) / 3));
  const spentSen = thisMonth.length ? thisMonth[thisMonth.length - 1] : 0;
  // A projection is a guess: whole thousands of rupiah, never false precision.
  const projectedSen = isNow && gone > 0 ? Math.round((spentSen / gone) * n / 100_000) * 100_000 : spentSen;
  const biggest = txns.filter((t) => t.kind === "spend" && t.categoryId && expense.has(t.categoryId) && ym(t.on) === month)
    .sort((a, b) => b.amountSen - a.amountSen || b.on.localeCompare(a.on)).slice(0, 5);
  return { month, days: n, daysGone: gone, thisMonth, lastMonth: last, avg3, spentSen, projectedSen, lastMonthSen: last[last.length - 1] ?? 0, biggest };
}

// ---------------------------------------------------------------- one account

export function accountMonths(acc: RAcc, txns: RTxn[], months: string[]) {
  const ends = balancesAt([acc], txns, months);
  return months.map((m, i) => {
    let inSen = 0, outSen = 0;
    for (const t of txns) {
      if (ym(t.on) !== m) continue;
      if (t.accountId === acc.id) { if (t.kind === "income") inSen += t.amountSen; else outSen += t.amountSen; }
      else if (t.kind === "transfer" && t.toAccountId === acc.id) inSen += t.amountSen;
    }
    return { month: m, inSen, outSen, netSen: inSen - outSen, endSen: ends[i].balances.get(acc.id) ?? null };
  });
}
