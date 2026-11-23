// The reports (FINNY-79): figures from report-rule.ts, as JSON or CSV. Every query is scoped to the owner.
import { NextResponse } from "next/server";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { categories, moneyAccounts, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { toCsv, senToPlain } from "@/lib/csv";
import { todayIn } from "@/lib/dates";
import { accountMonths, balanceSheet, cashflow, categoryTree, monthEnd, monthsBetween, shift, spendingPace, type RTxn } from "@/lib/report-rule";

const bad = (m: string): never => { throw new HttpError(400, m); };
const isMonth = (v: string | null): v is string => !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const monthOr = (v: string | null): string => (v === null ? todayIn().slice(0, 7) : isMonth(v) ? v : bad("month must look like 2026-11"));

async function load(userId: string, upTo: string) {
  const [txns, cats, accs] = await Promise.all([
    db.select({ id: transactions.id, on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId, toAccountId: transactions.toAccountId, categoryId: transactions.categoryId, description: transactions.description })
      .from(transactions).where(and(eq(transactions.userId, userId), lte(transactions.on, upTo))).orderBy(asc(transactions.on)),
    db.select({ id: categories.id, kind: categories.kind, parentId: categories.parentId, name: categories.name }).from(categories).where(eq(categories.userId, userId)),
    db.select({ id: moneyAccounts.id, name: moneyAccounts.name, type: moneyAccounts.type, openingSen: moneyAccounts.openingSen, openingOn: moneyAccounts.openingOn, archived: moneyAccounts.archived })
      .from(moneyAccounts).where(eq(moneyAccounts.userId, userId)).orderBy(asc(moneyAccounts.position)),
  ]);
  return { txns: txns as RTxn[], cats, accs };
}
const csv = (name: string, body: string) => new NextResponse(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="finny-${name}.csv"`, "cache-control": "no-store" } });

export async function cashflowReport(userId: string, q: URLSearchParams) {
  const year = q.get("year");
  let months: string[];
  if (year) { if (!/^\d{4}$/.test(year)) bad("year must look like 2026"); months = monthsBetween(`${year}-01`, `${year}-12`); }
  else {
    const to = monthOr(q.get("to")); const n = Number(q.get("months") ?? 6);
    if (![3, 6, 12].includes(n)) bad("months is 3, 6 or 12");
    months = monthsBetween(shift(to, -(n - 1)), to);
  }
  const month = q.get("month") ? monthOr(q.get("month")) : months[months.length - 1];
  const last = months[months.length - 1] > month ? months[months.length - 1] : month;
  const { txns, cats } = await load(userId, monthEnd(last));
  const flow = cashflow(txns, months), tree = categoryTree(txns, cats, month);
  if (q.get("format") === "csv") {
    const rows = [
      ...flow.months.map((m) => ({ section: "month", name: m.month, in_rupiah: senToPlain(m.inSen), out_rupiah: senToPlain(m.outSen), kept_rupiah: senToPlain(m.keptSen), avg3_rupiah: "" })),
      ...tree.sections.flatMap((s) => s.nodes.map((n) => ({ section: `${month} ${s.kind}`, name: `${"  ".repeat(n.depth)}${n.name}`,
        in_rupiah: s.kind === "income" ? senToPlain(n.sen) : "", out_rupiah: s.kind === "income" ? "" : senToPlain(n.sen), kept_rupiah: "", avg3_rupiah: senToPlain(n.avg3Sen) }))),
    ];
    return csv(`cashflow-${months[0]}-to-${months[months.length - 1]}`, toCsv(["section", "name", "in_rupiah", "out_rupiah", "kept_rupiah", "avg3_rupiah"], rows));
  }
  return { ...flow, tree };
}

export async function balanceReport(userId: string, q: URLSearchParams) {
  const month = monthOr(q.get("month"));
  const { txns, accs } = await load(userId, monthEnd(month));
  const b = balanceSheet(accs, txns, month, 12);
  if (q.get("format") === "csv") {
    const rows = [
      ...b.have.map((a) => ({ group: "have", account: a.name, type: a.type, rupiah: senToPlain(a.sen), change_rupiah: senToPlain(a.changeSen) })),
      ...b.owe.map((a) => ({ group: "owe", account: a.name, type: a.type, rupiah: senToPlain(a.sen), change_rupiah: senToPlain(a.changeSen) })),
      ...b.series.map((s) => ({ group: "net worth", account: s.month, type: "", rupiah: senToPlain(s.netSen), change_rupiah: "" })),
    ];
    return csv(`balance-sheet-${month}`, toCsv(["group", "account", "type", "rupiah", "change_rupiah"], rows));
  }
  return b;
}

export async function paceReport(userId: string, q: URLSearchParams) {
  const month = monthOr(q.get("month"));
  const { txns, cats } = await load(userId, monthEnd(month));
  const p = spendingPace(txns, cats, month, todayIn());
  if (q.get("format") === "csv") {
    const rows = Array.from({ length: p.days }, (_, d) => ({ day: d + 1, this_month_rupiah: d < p.thisMonth.length ? senToPlain(p.thisMonth[d]) : "",
      last_month_rupiah: d < p.lastMonth.length ? senToPlain(p.lastMonth[d]) : "", avg3_rupiah: senToPlain(p.avg3[d]) }));
    return csv(`spending-pace-${month}`, toCsv(["day", "this_month_rupiah", "last_month_rupiah", "avg3_rupiah"], rows));
  }
  return { ...p, biggest: p.biggest.map((t) => ({ id: t.id, on: t.on, amountSen: t.amountSen, description: t.description, categoryId: t.categoryId })) };
}

export async function accountReport(userId: string, id: string, q: URLSearchParams) {
  const to = monthOr(q.get("to")); const n = Number(q.get("months") ?? 6);
  if (![6, 12].includes(n)) bad("months is 6 or 12");
  const { txns, accs } = await load(userId, monthEnd(to));
  const acc = accs.find((a) => a.id === id);
  if (!acc) throw new HttpError(404, "Account not found.");
  const months = accountMonths(acc, txns, monthsBetween(shift(to, -(n - 1)), to));
  if (q.get("format") === "csv") return csv(`${acc.name.replace(/[^\w-]+/g, "-")}-${to}`, toCsv(["month", "in_rupiah", "out_rupiah", "net_rupiah", "end_balance_rupiah"],
    months.map((m) => ({ month: m.month, in_rupiah: senToPlain(m.inSen), out_rupiah: senToPlain(m.outSen), net_rupiah: senToPlain(m.netSen), end_balance_rupiah: senToPlain(m.endSen) }))));
  return { account: { id: acc.id, name: acc.name, type: acc.type }, months };
}
