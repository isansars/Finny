// Debts (FINNY-87): terms on cards and loans, the debts overview, bills coming up and the payoff plan. Figures come
// from debt-rule.ts and report-rule.ts. Every query is scoped to the owner.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { debtPlans, moneyAccounts, transactions } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { parseRupiah } from "@/lib/money";
import { todayIn } from "@/lib/dates";
import { listAccounts } from "@/lib/data";
import { accountMonths, monthsBetween, shift, type RTxn } from "@/lib/report-rule";
import { daysBetween, hasTerms, minimumFor, monthlyRate, nextDue, progressPct, simulate, type Debt, type Method } from "@/lib/debt-rule";

const bad = (m: string): never => { throw new HttpError(400, m); };
const DEBT_TYPES = new Set(["card", "loan"]);

/** "1,75" or "1.75" (percent) → 175 basis points; "" → null. */
function pctToBp(v: unknown, max: number, label: string): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).trim().replace("%", "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n * 100 > max) bad(`${label} must be a percentage from 0 to ${max / 100}.`);
  return Math.round(n * 100);
}
function senOrNull(v: unknown, label: string): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : bad(`${label} must be whole sen.`);
  const s = parseRupiah(String(v)); return s === null || s < 0 ? bad(`"${String(v)}" isn't an amount for ${label}.`) : s;
}
const dayOrNull = (v: unknown, label: string) => { if (v === null || v === undefined || v === "") return null; const d = Number(v); return Number.isInteger(d) && d >= 1 && d <= 31 ? d : bad(`${label} is a day of the month (1–31).`); };

/** Saves a card's or loan's terms (FINNY-87); any field left out stays as it is. */
export async function setTerms(userId: string, id: string, body: Record<string, unknown>) {
  const [acc] = await db.select().from(moneyAccounts).where(and(eq(moneyAccounts.userId, userId), eq(moneyAccounts.id, id)));
  if (!acc) throw new HttpError(404, "Account not found.");
  if (!DEBT_TYPES.has(acc.type)) bad("Terms are for credit cards and loans.");
  const out: Partial<typeof moneyAccounts.$inferInsert> = {};
  if ("interest" in body) out.interestBp = pctToBp(body.interest, 100000, "Interest");
  if ("interestPer" in body) out.interestPer = body.interestPer === "year" ? "year" : body.interestPer === "month" ? "month" : bad("Interest is per month or per year.");
  if ("minFixed" in body) out.minFixedSen = senOrNull(body.minFixed, "the minimum");
  if ("minPct" in body) out.minPctBp = pctToBp(body.minPct, 10000, "The minimum");
  if ("minFloor" in body) out.minFloorSen = senOrNull(body.minFloor, "the floor");
  if ("statementDay" in body) out.statementDay = dayOrNull(body.statementDay, "The statement day");
  if ("dueDay" in body) out.dueDay = dayOrNull(body.dueDay, "The due day");
  if ("purpose" in body) out.purpose = body.purpose === null || body.purpose === "" ? null : body.purpose === "productive" || body.purpose === "consumptive" ? body.purpose : bad("Kind is productive or consumptive.");
  if (out.interestBp != null && !out.interestPer && !acc.interestPer) out.interestPer = acc.type === "loan" ? "year" : "month";
  const [row] = await db.update(moneyAccounts).set(out).where(eq(moneyAccounts.id, id)).returning();
  return row;
}

async function loadDebts(userId: string) {
  const today = todayIn();
  const [accs, txns, [plan]] = await Promise.all([
    listAccounts(userId),
    db.select({ id: transactions.id, on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId, toAccountId: transactions.toAccountId, categoryId: transactions.categoryId, description: transactions.description })
      .from(transactions).where(eq(transactions.userId, userId)).orderBy(asc(transactions.on)),
    db.select().from(debtPlans).where(eq(debtPlans.userId, userId)),
  ]);
  const debtAccs = accs.filter((a) => DEBT_TYPES.has(a.type) && (!a.archived || a.balanceSen < 0));
  return { today, accs, debtAccs, txns: txns as RTxn[], plan: { method: (plan?.method ?? "snowball") as Method, extraSen: plan?.extraSen ?? 0 } };
}

function asDebt(a: Awaited<ReturnType<typeof listAccounts>>[number]): Debt {
  return { id: a.id, name: a.name, owedSen: Math.max(0, -a.balanceSen), interestBp: a.interestBp, interestPer: a.interestPer, minFixedSen: a.minFixedSen, minPctBp: a.minPctBp, minFloorSen: a.minFloorSen };
}

function plansFor(debts: Debt[], extraSen: number, today: string) {
  const start = shift(today.slice(0, 7), 1);
  return { minimums: simulate(debts, "minimums", 0, start), snowball: simulate(debts, "snowball", extraSen, start), avalanche: simulate(debts, "avalanche", extraSen, start) };
}

function bills(d: Awaited<ReturnType<typeof loadDebts>>, days: number) {
  const out = [];
  for (const a of d.debtAccs) {
    if (!a.dueDay) continue;
    const n = nextDue(d.today, a.dueDay, a.statementDay);
    const inDays = daysBetween(d.today, n.due); if (inDays > days) continue;
    // What was owed at the statement date (or now, without one), and its minimum.
    const upTo = n.statement ?? d.today;
    let bal = a.openingSen;
    for (const t of d.txns) {
      if (t.on > upTo) break;
      if (t.accountId === a.id) bal += t.kind === "income" ? t.amountSen : -t.amountSen;
      else if (t.kind === "transfer" && t.toAccountId === a.id) bal += t.amountSen;
    }
    // Payments made since the statement count against the bill.
    const paidSince = d.txns.filter((t) => n.statement && t.on > n.statement && t.on <= d.today && ((t.kind === "transfer" && t.toAccountId === a.id) || (t.kind === "income" && t.accountId === a.id))).reduce((s, t) => s + t.amountSen, 0);
    const billSen = Math.max(0, -bal), leftSen = Math.max(0, billSen - paidSince);
    if (!billSen) continue;
    out.push({ id: a.id, name: a.name, type: a.type, due: n.due, statement: n.statement, inDays, billSen, paidSen: paidSince, leftSen, minimumSen: minimumFor(asDebt(a), leftSen) });
  }
  return out.sort((x, y) => x.due.localeCompare(y.due));
}

export async function debtsOverview(userId: string) {
  const d = await loadDebts(userId);
  const debts = d.debtAccs.map(asDebt);
  const plans = plansFor(debts, d.plan.extraSen, d.today);
  const chosen = plans[d.plan.method];
  const months = monthsBetween(shift(d.today.slice(0, 7), -11), d.today.slice(0, 7));
  const yearStart = `${d.today.slice(0, 4)}-01-01`;
  const list = d.debtAccs.map((a) => {
    const debt = asDebt(a);
    const hist = accountMonths({ id: a.id, name: a.name, type: a.type, openingSen: a.openingSen, openingOn: a.openingOn }, d.txns, months)
      .map((m) => ({ month: m.month, paymentsSen: m.inSen, chargesSen: m.outSen, owedSen: m.endSen === null ? null : Math.max(0, -m.endSen) }));
    // The highest owed at any point (opening, then after every transaction), for progress.
    let bal = a.openingSen, peak = Math.max(0, -bal);
    for (const t of d.txns) {
      if (t.accountId === a.id) bal += t.kind === "income" ? t.amountSen : -t.amountSen; else if (t.kind === "transfer" && t.toAccountId === a.id) bal += t.amountSen; else continue;
      peak = Math.max(peak, -bal);
    }
    const due = a.dueDay ? nextDue(d.today, a.dueDay, a.statementDay) : null;
    const paidThisYear = d.txns.filter((t) => t.on >= yearStart && ((t.kind === "transfer" && t.toAccountId === a.id) || (t.kind === "income" && t.accountId === a.id))).reduce((s, t) => s + t.amountSen, 0);
    return { id: a.id, name: a.name, type: a.type, archived: a.archived, owedSen: debt.owedSen, peakSen: peak, progressPct: progressPct(debt.owedSen, peak), minimumSen: minimumFor(debt, debt.owedSen),
      monthlyRatePct: Math.round(monthlyRate(debt) * 10000) / 100, hasTerms: hasTerms(debt), terms: { interestBp: a.interestBp, interestPer: a.interestPer, minFixedSen: a.minFixedSen, minPctBp: a.minPctBp, minFloorSen: a.minFloorSen, statementDay: a.statementDay, dueDay: a.dueDay, purpose: a.purpose },
      nextDue: due?.due ?? null, paidThisYearSen: paidThisYear, history: hist };
  });
  const rank = new Map(chosen.order.map((o, i) => [o.id, i]));
  list.sort((x, y) => (rank.get(x.id) ?? 99) - (rank.get(y.id) ?? 99) || x.name.localeCompare(y.name));
  return {
    today: d.today, owedSen: list.reduce((n, x) => n + x.owedSen, 0), minimumsSen: list.reduce((n, x) => n + x.minimumSen, 0),
    paidThisYearSen: list.reduce((n, x) => n + x.paidThisYearSen, 0), debtFreeMonth: chosen.debtFreeMonth, plan: d.plan,
    bills: bills(d, 45), debts: list,
  };
}

export async function debtBills(userId: string, q: URLSearchParams) {
  const days = Math.min(Math.max(Number(q.get("days") ?? 14) || 14, 1), 62);
  const d = await loadDebts(userId);
  const bank = d.accs.find((a) => a.type === "bank" && !a.archived) ?? d.accs.find((a) => !DEBT_TYPES.has(a.type) && !a.archived);
  return { today: d.today, payFromId: bank?.id ?? null, bills: bills(d, days) };
}

export async function debtPlan(userId: string) {
  const d = await loadDebts(userId);
  return { ...d.plan, plans: plansFor(d.debtAccs.map(asDebt), d.plan.extraSen, d.today) };
}

export async function setDebtPlan(userId: string, body: Record<string, unknown>) {
  const method = ["minimums", "snowball", "avalanche"].includes(String(body.method)) ? (body.method as Method) : bad("Pick Minimums, Snowball or Avalanche.");
  const extraSen = senOrNull(body.extra ?? body.extraSen ?? 0, "the extra") ?? 0;
  await db.insert(debtPlans).values({ userId, method, extraSen }).onConflictDoUpdate({ target: debtPlans.userId, set: { method, extraSen } });
  return debtPlan(userId);
}
