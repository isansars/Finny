// Export everything (FINNY-24): a zip with one CSV per table, amounts in rupiah.
import { NextResponse } from "next/server";
import { withMe } from "@/lib/session";
import { exportRows } from "@/lib/data";
import { toCsv, senToPlain } from "@/lib/csv";
import { zip } from "@/lib/zip";
import { todayIn } from "@/lib/dates";

export const GET = () => withMe(async (me) => {
  const { accs, cats, ents, txns, buds, plans, vals, thingRows, reviews, goalRows } = await exportRows(me.id);
  const accName = new Map(accs.map((a) => [a.id, a.name])), catName = new Map(cats.map((c) => [c.id, c.name])), entName = new Map(ents.map((e) => [e.id, e.name]));
  const files = {
    "accounts.csv": toCsv(["id", "name", "type", "opening_rupiah", "opening_on", "limit_rupiah", "statement_day", "archived"],
      accs.map((a) => ({ id: a.id, name: a.name, type: a.type, opening_rupiah: senToPlain(a.openingSen), opening_on: a.openingOn, limit_rupiah: senToPlain(a.limitSen), statement_day: a.statementDay, archived: a.archived }))),
    "categories.csv": toCsv(["id", "kind", "name", "parent", "active"], cats.map((c) => ({ id: c.id, kind: c.kind, name: c.name, parent: c.parentId ? catName.get(c.parentId) : "", active: c.active }))),
    "entities.csv": toCsv(["id", "name"], ents),
    "transactions.csv": toCsv(["date", "kind", "amount_rupiah", "account", "to_account", "category", "entity", "description", "note", "id"],
      txns.map((t) => ({ date: t.on, kind: t.kind, amount_rupiah: senToPlain(t.amountSen), account: accName.get(t.accountId), to_account: t.toAccountId ? accName.get(t.toAccountId) : "", category: t.categoryId ? catName.get(t.categoryId) : "", entity: t.entityId ? entName.get(t.entityId) : "", description: t.description, note: t.note, id: t.id }))),
    // FINNY-61: budgets ("*" = every month) and expected income.
    "budgets.csv": toCsv(["month", "category", "amount_rupiah"], buds.map((b) => ({ month: b.month === "*" ? "every month" : b.month, category: catName.get(b.categoryId), amount_rupiah: senToPlain(b.amountSen) }))),
    "income_plans.csv": toCsv(["month", "amount_rupiah"], plans.map((p) => ({ month: p.month === "*" ? "every month" : p.month, amount_rupiah: senToPlain(p.amountSen) }))),
    // FINNY-95: market values and things.
    "market_values.csv": toCsv(["date", "account", "value_rupiah"], vals.map((v) => ({ date: v.on, account: accName.get(v.accountId), value_rupiah: senToPlain(v.valueSen) }))),
    "things.csv": toCsv(["name", "kind", "bought_on", "cost_rupiah", "yearly_percent", "share_percent", "value_rupiah", "value_on", "sold_on"],
      thingRows.map((t) => ({ name: t.name, kind: t.kind, bought_on: t.boughtOn, cost_rupiah: senToPlain(t.costSen), yearly_percent: t.yearlyBp / 100, share_percent: t.shareBp / 100, value_rupiah: senToPlain(t.valueSen), value_on: t.valueOn, sold_on: t.soldOn }))),
    // FINNY-109: month-end reviews (the saved summary as JSON).
    "month_reviews.csv": toCsv(["month", "budget_done", "wealth_done", "closed_at", "note", "summary_json"],
      reviews.map((r) => ({ month: r.month, budget_done: r.budgetDone, wealth_done: r.wealthDone, closed_at: r.closedAt ? r.closedAt.toISOString() : "", note: r.note ?? "", summary_json: r.summary ? JSON.stringify(r.summary) : "" }))),
    // FINNY-117: goals.
    "goals.csv": toCsv(["name", "kind", "target_rupiah", "by_month"], goalRows.map((g) => ({ name: g.name, kind: g.kind, target_rupiah: senToPlain(g.targetSen), by_month: g.byMonth ?? "" }))),
  };
  return new NextResponse(Buffer.from(zip(files)), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="finny-export-${todayIn()}.zip"`, "cache-control": "no-store" } });
});
