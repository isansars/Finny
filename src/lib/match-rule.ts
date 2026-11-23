// FINNY-126: the workbook match check. Pure; runs on the phone (the workbook never leaves it). Tests:
// tests/unit/match-rule.test.mts. Money is integer sen.
// The workbook side is read exactly as the import reads it (import-rule.ts), so its accounts and categories mean the
// same thing as when they came into Finny. Balances are the workbook's own Saldo at the month end.
import { buildPlan, defaultChoices, type Books, type LogRow, type Plan } from "./import-rule.ts";

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const monthEnd = (m: string) => { const [y, mm] = m.split("-").map(Number); return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`; };
const inMonth = (on: string, m: string) => on.slice(0, 7) === m;
const owes = (t: string) => t === "card" || t === "loan";

export type Row = { ref: string; on: string; kind: "spend" | "income" | "transfer"; sen: number; account: string; toAccount?: string; category?: string; categoryKind?: "income" | "expense"; description: string };
export type WAccount = { name: string; type: string; balanceSen: number | null };
export type WCategory = { name: string; kind: "income" | "expense"; sen: number };
export type WorkbookSide = { accounts: WAccount[]; categories: WCategory[]; rows: Row[] };

/** The workbook's month: each account's Saldo at the month end (cards and loans: Saldo − limit, like the import),
 *  each category's total (the last part of its chart-of-accounts path), and the month's rows, named. */
export function workbookSide(b: Books, month: string, plan: Plan = buildPlan(b, defaultChoices(b))): WorkbookSide {
  const end = monthEnd(month);
  const acc = new Map(plan.accounts.map((a) => [a.key, a]));
  const catOf = new Map(plan.categories.map((c) => [c.key, c]));
  const accounts: WAccount[] = plan.accounts.filter((a) => a.fromSheet).map((a) => {
    const s = b.sheets.find((x) => x.sheet === a.fromSheet)!;
    const last = s.rows.filter((r) => r.on <= end && r.saldoSen !== null).pop();
    const bal = last ? last.saldoSen! - (owes(a.type) ? a.limitSen ?? 0 : 0) : null;
    return { name: a.name, type: a.type, balanceSen: s.firstOn && s.firstOn > end ? null : bal };
  });
  const rows: Row[] = plan.txns.filter((t) => inMonth(t.on, month)).map((t) => {
    const c = t.category ? catOf.get(t.category) : undefined;
    return { ref: t.ref, on: t.on, kind: t.kind, sen: t.sen, account: acc.get(t.account)?.name ?? t.account, toAccount: t.toAccount ? acc.get(t.toAccount)?.name ?? t.toAccount : undefined,
      category: c ? c.path[c.path.length - 1] : undefined, categoryKind: c?.kind, description: t.description };
  });
  return { accounts, categories: totals(rows), rows };
}

/** The Transaction Log's month, by category (Expense / Income rows only). */
export function logSide(log: LogRow[], month: string): WorkbookSide {
  const rows: Row[] = log.filter((r) => inMonth(r.on, month) && /^(expense|income)$/i.test(r.type)).map((r) => ({
    ref: r.ref, on: r.on, kind: /^income$/i.test(r.type) ? "income" : "spend", sen: r.sen, account: r.account, category: r.category, categoryKind: /^income$/i.test(r.type) ? "income" : "expense", description: r.description,
  }));
  return { accounts: [], categories: totals(rows), rows };
}

function totals(rows: Row[]): WCategory[] {
  const m = new Map<string, WCategory>();
  for (const r of rows) {
    if (!r.category || !r.categoryKind) continue;
    const k = `${r.categoryKind}|${key(r.category)}`;
    const c = m.get(k) ?? { name: r.category, kind: r.categoryKind, sen: 0 };
    c.sen += r.sen; m.set(k, c);
  }
  return [...m.values()];
}

export type FAcc = { id: string; name: string; type: string; balanceSen: number; archived?: boolean };
export type FCat = { id: string; name: string; kind: string };
export type FTxn = { id: string; on: string; kind: "spend" | "income" | "transfer"; amountSen: number; accountId: string; toAccountId: string | null; categoryId: string | null; description: string };
export type FinnySide = { accounts: FAcc[]; categories: FCat[]; txns: FTxn[] };

/** Finny's side as rows named like the workbook's (category kinds: saving and investment count as spending). */
export function finnyRows(f: FinnySide): Row[] {
  const acc = new Map(f.accounts.map((a) => [a.id, a.name])), cat = new Map(f.categories.map((c) => [c.id, c]));
  return f.txns.map((t) => {
    const c = t.categoryId ? cat.get(t.categoryId) : undefined;
    return { ref: t.id, on: t.on, kind: t.kind, sen: t.amountSen, account: acc.get(t.accountId) ?? "", toAccount: t.toAccountId ? acc.get(t.toAccountId) ?? "" : undefined,
      category: c?.name, categoryKind: c ? (c.kind === "income" ? "income" : "expense") : undefined, description: t.description };
  });
}

export type AccountLine = { name: string; type: string; workbookSen: number | null; finnySen: number | null; finnyId: string | null; diffSen: number; ok: boolean };
export type CategoryLine = { name: string; kind: "income" | "expense"; workbookSen: number; finnySen: number; diffSen: number; ok: boolean };

/** Every workbook account next to the Finny account of the same name (or the one paired by hand). */
export function compareAccounts(w: WAccount[], f: FAcc[], pairs: Record<string, string> = {}): AccountLine[] {
  return w.filter((a) => a.balanceSen !== null).map((a) => {
    const fa = pairs[a.name] ? f.find((x) => x.id === pairs[a.name]) : f.find((x) => key(x.name) === key(a.name));
    const finnySen = fa ? fa.balanceSen : null;
    const diffSen = finnySen === null ? 0 : finnySen - a.balanceSen!;
    return { name: a.name, type: a.type, workbookSen: a.balanceSen, finnySen, finnyId: fa?.id ?? null, diffSen, ok: finnySen !== null && diffSen === 0 };
  });
}

/** Every category in either side's month, workbook vs Finny. */
export function compareCategories(w: WCategory[], f: WCategory[]): CategoryLine[] {
  const all = new Map<string, CategoryLine>();
  const at = (c: WCategory) => { const k = `${c.kind}|${key(c.name)}`; const l = all.get(k) ?? { name: c.name, kind: c.kind, workbookSen: 0, finnySen: 0, diffSen: 0, ok: true }; all.set(k, l); return l; };
  for (const c of w) at(c).workbookSen += c.sen;
  for (const c of f) at(c).finnySen += c.sen;
  return [...all.values()].map((l) => ({ ...l, diffSen: l.finnySen - l.workbookSen, ok: l.finnySen === l.workbookSen }))
    .sort((a, b) => Number(a.ok) - Number(b.ok) || Math.abs(b.diffSen) - Math.abs(a.diffSen) || b.workbookSen - a.workbookSen);
}

/** A row's effect on an account (in +, out −); 0 when it doesn't touch it. */
export function signedFor(r: Row, account: string): number {
  const a = key(account);
  if (r.kind === "transfer") return key(r.account) === a ? -r.sen : r.toAccount && key(r.toAccount) === a ? r.sen : 0;
  if (key(r.account) !== a) return 0;
  return r.kind === "income" ? r.sen : -r.sen;
}

/** The rows behind a difference: matched one to one by amount, the same day first, then within 3 days (a transfer
 *  can carry the other side's date). What's left is only in the workbook or only in Finny. */
export function rowsBehind(w: Row[], f: Row[], pick: (r: Row) => number) {
  const ws = w.map((r) => ({ r, v: pick(r) })).filter((x) => x.v !== 0), fs = f.map((r) => ({ r, v: pick(r) })).filter((x) => x.v !== 0);
  const used = new Set<number>();
  const left: typeof ws = [];
  const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
  for (const pass of [0, 3]) {
    const still = pass === 0 ? ws : left.splice(0);
    for (const x of still) {
      const i = fs.findIndex((y, j) => !used.has(j) && y.v === x.v && days(y.r.on, x.r.on) <= pass);
      if (i >= 0) used.add(i); else left.push(x);
    }
  }
  return { onlyWorkbook: left.map((x) => ({ ...x.r, signedSen: x.v })), onlyFinny: fs.filter((_, j) => !used.has(j)).map((y) => ({ ...y.r, signedSen: y.v })) };
}

export const forAccount = (name: string) => (r: Row) => signedFor(r, name);
export const forCategory = (name: string, kind: "income" | "expense") => (r: Row) => (r.category && r.categoryKind === kind && key(r.category) === key(name) ? r.sen : 0);

/** The counts saved on the month's review (never names or rows). */
export function matchCounts(accounts: AccountLine[], categories: CategoryLine[]) {
  return { accountsOk: accounts.filter((a) => a.ok).length, accountsTotal: accounts.length, categoriesOk: categories.filter((c) => c.ok).length, categoriesTotal: categories.length };
}
