// Net worth goals (FINNY-119). Figures from goal-rule.ts; account values from asset-rule.ts. Every query is scoped to
// the owner.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets, categories, goalSources, goals } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { parseRupiah } from "@/lib/money";
import { todayIn } from "@/lib/dates";
import { loadWealth } from "@/lib/assets";
import { emergencyOverview } from "@/lib/emergency";
import { OWED, balanceAt, holdingAt, wealthAt } from "@/lib/asset-rule";
import { monthEnd } from "@/lib/report-rule";
import { goalFigures, pctChange, projection, savedFrom } from "@/lib/goal-rule";
import { shiftMonth } from "@/lib/review-rule";

const bad = (m: string): never => { throw new HttpError(400, m); };
const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
type W = Awaited<ReturnType<typeof loadWealth>>;
type GoalRow = typeof goals.$inferSelect;
type SrcRow = typeof goalSources.$inferSelect;
const monthsBetween = (a: string, b: string) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + (m2 - m1); };

function valueAt(w: W, accountId: string, on: string): number {
  const a = w.accs.find((x) => x.id === accountId); if (!a) return 0;
  return a.type === "investment" ? holdingAt(a, w.txns, w.vals, on).valueSen : balanceAt(a, w.txns, on);
}
const netAt = (w: W, on: string) => wealthAt(w.accs, w.txns, w.vals, w.things, on).netSen;
/** Saved for a goal on a day: its accounts (all or a part) or the whole net worth. */
function savedAt(w: W, g: GoalRow, srcs: SrcRow[], on: string): number {
  if (g.kind === "networth") return netAt(w, on);
  return savedFrom(srcs.filter((s) => s.goalId === g.id).map((s) => ({ valueSen: valueAt(w, s.accountId, on), partSen: s.partSen })));
}
/** The month-end the pace starts from: 6 months back, or the first month the goal's accounts existed. */
function paceStart(w: W, g: GoalRow, srcs: SrcRow[], thisMonth: string): string {
  const ids = g.kind === "networth" ? w.accs.map((a) => a.id) : srcs.filter((s) => s.goalId === g.id).map((s) => s.accountId);
  const starts = w.accs.filter((a) => ids.includes(a.id)).map((a) => a.openingOn.slice(0, 7)).sort();
  const six = shiftMonth(thisMonth, -6);
  return starts.length && starts[0] > six ? starts[0] : six;
}

function figures(w: W, g: GoalRow, srcs: SrcRow[], today: string) {
  const thisMonth = today.slice(0, 7), from = paceStart(w, g, srcs, thisMonth), months = Math.max(0, monthsBetween(from, thisMonth));
  const saved = savedAt(w, g, srcs, today), then = months ? savedAt(w, g, srcs, monthEnd(from)) : saved;
  const f = goalFigures({ targetSen: g.targetSen, byMonth: g.byMonth, savedSen: saved, thenSen: then, paceMonths: months }, thisMonth);
  const sources = srcs.filter((s) => s.goalId === g.id).map((s) => {
    const a = w.accs.find((x) => x.id === s.accountId), v = valueAt(w, s.accountId, today);
    return { accountId: s.accountId, name: a?.name ?? "", type: a?.type ?? "", valueSen: v, partSen: s.partSen, amountSen: Math.max(0, s.partSen == null ? v : Math.min(s.partSen, v)) };
  });
  return { id: g.id, name: g.name, kind: g.kind, icon: g.icon, byMonth: g.byMonth, ...f, sources, from };
}

async function load(userId: string) {
  const [w, rows] = await Promise.all([loadWealth(userId), db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.createdAt))]);
  const srcs = rows.length ? await db.select().from(goalSources).where(inArray(goalSources.goalId, rows.map((g) => g.id))) : [];
  return { w, rows, srcs };
}

export async function goalsOverview(userId: string) {
  const today = todayIn(), thisMonth = today.slice(0, 7);
  const [{ w, rows, srcs }, ef] = await Promise.all([load(userId), emergencyOverview(userId)]);
  const firstOpen = w.accs.map((a) => a.openingOn.slice(0, 7)).sort()[0];
  const from = firstOpen && firstOpen > shiftMonth(thisMonth, -6) ? firstOpen : shiftMonth(thisMonth, -6), months = Math.max(0, monthsBetween(from, thisMonth));
  const net = netAt(w, today), then = months ? netAt(w, monthEnd(from)) : net;
  return {
    today, netSen: net, netPaceSen: months ? Math.round((net - then) / months / 100) * 100 : 0, netPaceMonths: months,
    goals: rows.map((g) => figures(w, g, srcs, today)),
    emergency: { configured: ef.configured, pct: ef.pct, setAsideSen: ef.setAsideSen, targetSen: ef.targetSen, reached: ef.reached },
    candidates: w.accs.filter((a) => !OWED.has(a.type) && !a.archived).map((a) => ({ id: a.id, name: a.name, type: a.type, valueSen: valueAt(w, a.id, today) })),
  };
}

async function own(userId: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(404, "Goal not found.");
  const [g] = await db.select().from(goals).where(and(eq(goals.userId, userId), eq(goals.id, id)));
  return g ?? (() => { throw new HttpError(404, "Goal not found."); })();
}

/** One goal with its chart: saved at each month-end since the pace start and today, then the needed and pace lines. */
export async function getGoal(userId: string, id: string) {
  await own(userId, id);
  const today = todayIn(), thisMonth = today.slice(0, 7);
  const { w, rows, srcs } = await load(userId);
  const g = rows.find((x) => x.id === id)!;
  const f = figures(w, g, srcs, today);
  const history: { month: string; sen: number }[] = [];
  for (let m = f.from; m < thisMonth; m = shiftMonth(m, 1)) history.push({ month: m, sen: savedAt(w, g, srcs, monthEnd(m)) });
  history.push({ month: thisMonth, sen: f.savedSen });
  return { ...f, history, projection: projection(f.savedSen, f.targetSen, f.neededSen, f.paceSen, g.byMonth, thisMonth) };
}

function amount(v: unknown, label: string): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : bad(`${label} must be whole sen.`);
  const s = parseRupiah(String(v)); return s === null || s < 0 ? bad(`"${String(v)}" isn't an amount for ${label}.`) : s;
}

async function clean(userId: string, body: Record<string, unknown>, cur?: GoalRow) {
  const thisMonth = todayIn().slice(0, 7);
  const name = "name" in body ? String(body.name ?? "").trim() : cur?.name ?? "";
  if (!name) bad("Give the goal a name.");
  if (name.length > 60) bad("Keep the name under 60 characters.");
  const kind = ("kind" in body ? body.kind : cur?.kind ?? "save") as string;
  if (kind !== "save" && kind !== "networth") bad("A goal is saving for something or a net worth.");
  const target = "target" in body ? amount(body.target, "the target") : cur?.targetSen ?? null;
  if (!target || target <= 0) bad("Enter a target above 0.");
  let byMonth = "byMonth" in body ? (body.byMonth == null || body.byMonth === "" ? null : String(body.byMonth)) : cur?.byMonth ?? null;
  if (byMonth != null && !isMonth(byMonth)) bad("The month must look like 2028-06.");
  if (byMonth != null && byMonth < thisMonth && byMonth !== cur?.byMonth) bad("Pick this month or a later one.");
  if (byMonth === "") byMonth = null;
  let sources: { accountId: string; partSen: number | null }[] | null = null;
  if (kind === "save" && ("sources" in body || !cur)) {
    const rows = (Array.isArray(body.sources) ? body.sources : []) as { accountId: string; part?: unknown }[];
    if (!rows.length) bad("Pick the accounts that hold this goal.");
    const w = await loadWealth(userId);
    sources = rows.map((r) => {
      const a = w.accs.find((x) => x.id === String(r.accountId));
      if (!a) throw new HttpError(404, "Account not found.");
      if (OWED.has(a.type)) bad("A card or loan can't hold a goal.");
      return { accountId: a.id, partSen: amount(r.part, `the part of ${a.name}`) };
    });
    if (new Set(sources.map((s) => s.accountId)).size !== sources.length) bad("Each account once.");
  }
  if (kind === "networth") sources = [];
  return { name, kind: kind as "save" | "networth", targetSen: target!, byMonth, icon: kind === "networth" ? "gem" : "piggy-bank", sources };
}

export async function createGoal(userId: string, body: Record<string, unknown>) {
  const c = await clean(userId, body);
  const [g] = await db.insert(goals).values({ userId, name: c.name, kind: c.kind, targetSen: c.targetSen, byMonth: c.byMonth, icon: c.icon }).returning();
  if (c.sources?.length) await db.insert(goalSources).values(c.sources.map((s) => ({ goalId: g.id, ...s })));
  return getGoal(userId, g.id);
}

export async function updateGoal(userId: string, id: string, body: Record<string, unknown>) {
  const cur = await own(userId, id);
  const c = await clean(userId, body, cur);
  await db.update(goals).set({ name: c.name, kind: c.kind, targetSen: c.targetSen, byMonth: c.byMonth, icon: c.icon }).where(eq(goals.id, id));
  if (c.sources) {
    await db.delete(goalSources).where(eq(goalSources.goalId, id));
    if (c.sources.length) await db.insert(goalSources).values(c.sources.map((s) => ({ goalId: id, ...s })));
  }
  return getGoal(userId, id);
}

export async function deleteGoal(userId: string, id: string) {
  await own(userId, id);
  await db.delete(goals).where(eq(goals.id, id));
  return { ok: true };
}

/** Puts the goal's needed-a-month in this month's budget as a saving line named after the goal (made if missing). */
export async function goalToBudget(userId: string, id: string) {
  const g = await getGoal(userId, id);
  if (g.neededSen == null) bad("Give the goal a month to reach it by first.");
  if (!g.neededSen) bad("This goal is reached: nothing more to put aside.");
  let [cat] = await db.select().from(categories).where(and(eq(categories.userId, userId), eq(categories.kind, "saving"), sql`lower(${categories.name}) = lower(${g.name})`));
  if (!cat) [cat] = await db.insert(categories).values({ userId, kind: "saving", name: g.name, icon: g.kind === "networth" ? "gem" : "piggy-bank", color: "lavender" }).returning();
  const month = todayIn().slice(0, 7);
  await db.insert(budgets).values({ userId, categoryId: cat.id, month, amountSen: g.neededSen! }).onConflictDoUpdate({ target: [budgets.userId, budgets.categoryId, budgets.month], set: { amountSen: g.neededSen! } });
  return { categoryId: cat.id, name: cat.name, month, amountSen: g.neededSen! };
}

/** For the month-end review: each goal's % at the month's end and its change since the month before. */
export async function goalsForMonth(userId: string, month: string) {
  const { w, rows, srcs } = await load(userId);
  const end = monthEnd(month), before = monthEnd(shiftMonth(month, -1));
  return rows.map((g) => {
    const a = savedAt(w, g, srcs, end), b = savedAt(w, g, srcs, before);
    return { id: g.id, name: g.name, pct: Math.max(0, Math.min(100, Math.round((a / g.targetSen) * 100))), change: pctChange(a, b, g.targetSen) };
  });
}
