// Export everything (FINNY-24): a zip with one CSV per table, amounts in rupiah.
import { NextResponse } from "next/server";
import { withMe } from "@/lib/session";
import { exportRows } from "@/lib/data";
import { toCsv, senToPlain } from "@/lib/csv";
import { zip } from "@/lib/zip";
import { todayIn } from "@/lib/dates";

export const GET = () => withMe(async (me) => {
  const { accs, cats, ents, txns, buds, plans } = await exportRows(me.id);
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
  };
  return new NextResponse(Buffer.from(zip(files)), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="finny-export-${todayIn()}.zip"`, "cache-control": "no-store" } });
});
