// The workbook match check (FINNY-127): Finny's side of a month, and the saved result. The workbook itself is read on
// the phone and never reaches this file; only counts are saved. Every query is scoped to the owner.
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { categories, monthReviews, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { monthRange, todayIn } from "@/lib/dates";
import { loadWealth } from "@/lib/assets";
import { balanceAt } from "@/lib/asset-rule";
import { monthEnd } from "@/lib/report-rule";

const bad = (m: string): never => { throw new HttpError(400, m); };
function monthOf(v: unknown): string {
  const m = typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : bad("month must look like 2026-10");
  if (m > todayIn().slice(0, 7)) bad("That month hasn't happened yet.");
  return m;
}

/** Finny's accounts with their balance at the month end (the book balance, as the workbook's Saldo is), categories,
 *  and the month's rows. */
export async function matchData(userId: string, monthIn: unknown) {
  const month = monthOf(monthIn), [from, to] = monthRange(month), end = monthEnd(month);
  const [w, cats, txns] = await Promise.all([
    loadWealth(userId),
    db.select({ id: categories.id, name: categories.name, kind: categories.kind }).from(categories).where(eq(categories.userId, userId)),
    db.select({ id: transactions.id, on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId, toAccountId: transactions.toAccountId, categoryId: transactions.categoryId, description: transactions.description })
      .from(transactions).where(and(eq(transactions.userId, userId), gte(transactions.on, from), lt(transactions.on, to))).orderBy(asc(transactions.on)),
  ]);
  return {
    month,
    accounts: w.accs.map((a) => ({ id: a.id, name: a.name, type: a.type, archived: a.archived, balanceSen: balanceAt(a, w.txns, end) })),
    categories: cats, txns,
  };
}

const count = (v: unknown, label: string) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 10_000 ? v : bad(`${label} must be a whole number.`));

/** Saves the result of a check on the month's review: counts and the date, nothing from the workbook. */
export async function saveMatch(userId: string, monthIn: unknown, body: Record<string, unknown>) {
  const month = monthOf(monthIn);
  const s = {
    accountsOk: count(body.accountsOk, "accountsOk"), accountsTotal: count(body.accountsTotal, "accountsTotal"),
    categoriesOk: count(body.categoriesOk, "categoriesOk"), categoriesTotal: count(body.categoriesTotal, "categoriesTotal"),
    withLog: body.withLog === true, checkedAt: new Date().toISOString(),
  };
  if (s.accountsOk > s.accountsTotal || s.categoriesOk > s.categoriesTotal) bad("More matching than checked.");
  if (!s.accountsTotal && !s.categoriesTotal) bad("Nothing was checked.");
  const matches = s.accountsOk === s.accountsTotal && s.categoriesOk === s.categoriesTotal;
  const set = { matchSummary: { ...s, matches } };
  await db.insert(monthReviews).values({ userId, month, ...set }).onConflictDoUpdate({ target: [monthReviews.userId, monthReviews.month], set });
  return set.matchSummary;
}
