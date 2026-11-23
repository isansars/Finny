// The emergency fund (FINNY-103). Figures from emergency-rule.ts; account values from asset-rule.ts. Scoped to the owner.
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories, emergencyFunds, emergencySources, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { parseRupiah } from "@/lib/money";
import { monthRange, shiftMonth, todayIn } from "@/lib/dates";
import { loadWealth } from "@/lib/assets";
import { balanceAt, holdingAt, OWED } from "@/lib/asset-rule";
import { emergencyFund, type Stability } from "@/lib/emergency-rule";

const bad = (m: string): never => { throw new HttpError(400, m); };
function senOrNull(v: unknown, label: string): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : bad(`${label} must be whole sen.`);
  const s = parseRupiah(String(v)); return s === null || s < 0 ? bad(`"${String(v)}" isn't an amount for ${label}.`) : s;
}

/** Spending (expense categories, like Home's "Spent") over the last three full months, averaged. */
async function averageSpending(userId: string, thisMonth: string) {
  const from = monthRange(shiftMonth(thisMonth, -3))[0], to = monthRange(thisMonth)[0];
  const [r] = await db.select({ total: sql<string>`coalesce(sum(${transactions.amountSen}), 0)` }).from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(and(eq(transactions.userId, userId), eq(transactions.kind, "spend"), eq(categories.kind, "expense"), gte(transactions.on, from), lt(transactions.on, to)));
  return Math.round(Number(r.total) / 3 / 100) * 100;
}

export async function emergencyOverview(userId: string) {
  const today = todayIn(), thisMonth = today.slice(0, 7);
  const [[fund], srcs, w, avg] = await Promise.all([
    db.select().from(emergencyFunds).where(eq(emergencyFunds.userId, userId)),
    db.select().from(emergencySources).where(eq(emergencySources.userId, userId)),
    loadWealth(userId), averageSpending(userId, thisMonth),
  ]);
  const settings = { stability: (fund?.stability ?? "fair") as Stability, dependents: fund?.dependents ?? 0, spendingSen: fund?.spendingSen ?? null, target: fund?.target ?? "low", ownTargetSen: fund?.ownTargetSen ?? null, monthlySen: fund?.monthlySen ?? 0 };
  const valueOf = (id: string) => { const a = w.accs.find((x) => x.id === id); if (!a) return 0; return a.type === "investment" ? holdingAt(a, w.txns, w.vals, today).valueSen : balanceAt(a, w.txns, today); };
  const candidates = w.accs.filter((a) => !OWED.has(a.type) && !a.archived).map((a) => ({ id: a.id, name: a.name, type: a.type, holdingKind: a.holdingKind, valueSen: valueOf(a.id) }));
  const sources = srcs.map((s) => { const a = w.accs.find((x) => x.id === s.accountId); const v = valueOf(s.accountId); return { accountId: s.accountId, name: a?.name ?? "", type: a?.type ?? "", holdingKind: a?.holdingKind ?? null, maturityOn: a?.maturityOn ?? null, valueSen: v, partSen: s.partSen }; });
  const spending = settings.spendingSen ?? avg;
  const figures = emergencyFund({ ...settings, spendingSen: spending, target: settings.target as "low" | "high" | "own" }, sources, thisMonth);
  return { today, thisMonth, configured: !!fund, settings, averageSpendingSen: avg, spendingSen: spending, ...figures, sources: sources.map((s) => ({ ...s, amountSen: Math.max(0, s.partSen == null ? s.valueSen : Math.min(s.partSen, s.valueSen)) })), candidates };
}

export async function setEmergency(userId: string, body: Record<string, unknown>) {
  const [cur] = await db.select().from(emergencyFunds).where(eq(emergencyFunds.userId, userId));
  const v: typeof emergencyFunds.$inferInsert = { userId, stability: cur?.stability ?? "fair", dependents: cur?.dependents ?? 0, spendingSen: cur?.spendingSen ?? null, target: cur?.target ?? "low", ownTargetSen: cur?.ownTargetSen ?? null, monthlySen: cur?.monthlySen ?? 0 };
  if ("stability" in body) v.stability = ["stable", "fair", "uncertain"].includes(String(body.stability)) ? body.stability as Stability : bad("Pick how steady your income is.");
  if ("dependents" in body) { const d = Number(body.dependents); v.dependents = Number.isInteger(d) && d >= 0 && d <= 3 ? d : bad("Dependents is 0 to 3 (3 means 3 or more)."); }
  if ("spending" in body) v.spendingSen = senOrNull(body.spending, "monthly spending");
  if ("target" in body) v.target = ["low", "high", "own"].includes(String(body.target)) ? body.target as "low" | "high" | "own" : bad("Pick the low end, the high end or your own amount.");
  if ("ownTarget" in body) v.ownTargetSen = senOrNull(body.ownTarget, "your own target");
  if ("monthly" in body) v.monthlySen = senOrNull(body.monthly, "the monthly amount") ?? 0;
  if (v.target === "own" && v.ownTargetSen == null) bad("Type your own target, or pick the low or high end.");
  await db.insert(emergencyFunds).values(v).onConflictDoUpdate({ target: emergencyFunds.userId, set: v });
  return emergencyOverview(userId);
}

/** Replaces where the fund sits: each account all of it (part empty) or a part. */
export async function setSources(userId: string, body: Record<string, unknown>) {
  const rows = (Array.isArray(body.sources) ? body.sources : []) as { accountId: string; part?: unknown }[];
  const w = await loadWealth(userId);
  const clean = rows.map((r) => {
    const a = w.accs.find((x) => x.id === String(r.accountId));
    if (!a) throw new HttpError(404, "Account not found.");
    if (OWED.has(a.type)) bad("A card or loan can't hold your emergency fund.");
    return { userId, accountId: a.id, partSen: senOrNull(r.part, `the part of ${a.name}`) };
  });
  if (new Set(clean.map((c) => c.accountId)).size !== clean.length) bad("Each account once.");
  await db.delete(emergencySources).where(eq(emergencySources.userId, userId));
  if (clean.length) await db.insert(emergencySources).values(clean);
  return emergencyOverview(userId);
}

/** Puts the monthly amount in this month's budget as a saving line "Dana Darurat" (made if missing). */
export async function addToBudget(userId: string) {
  const [fund] = await db.select().from(emergencyFunds).where(eq(emergencyFunds.userId, userId));
  if (!fund?.monthlySen) bad("Set a monthly amount first.");
  let [cat] = await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.kind, "saving"), sql`lower(${categories.name}) = 'dana darurat'`));
  if (!cat) [cat] = await db.insert(categories).values({ userId, kind: "saving", name: "Dana Darurat", icon: "shield-check", color: "mint" }).returning();
  const month = todayIn().slice(0, 7);
  await db.insert(budgets).values({ userId, categoryId: cat.id, month, amountSen: fund!.monthlySen }).onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId, budgets.month], set: { amountSen: fund!.monthlySen } });
  return { categoryId: cat.id, month, amountSen: fund!.monthlySen };
}
