// Assets (FINNY-95): holdings, market values, things, and net worth with everything. Figures from asset-rule.ts.
// Every query is scoped to the owner.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { accountValues, moneyAccounts, things, transactions, THING_KINDS } from "@/db/schema";
import { HttpError } from "@/lib/session";
import { parseRupiah } from "@/lib/money";
import { todayIn } from "@/lib/dates";
import { holdingAt, thingAt, thingCost, wealthAt, type Thing } from "@/lib/asset-rule";
import type { RTxn } from "@/lib/report-rule";

const bad = (m: string): never => { throw new HttpError(400, m); };
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const HOLDINGS = ["stock", "fund", "crypto", "gold", "bond", "deposit", "p2p", "other"] as const;
function sen(v: unknown, label: string, allowNull = false): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return allowNull ? null : bad(`Enter ${label}.`);
  if (typeof v === "number") return Number.isSafeInteger(v) && v >= 0 ? v : bad(`${label} must be whole sen.`);
  const s = parseRupiah(String(v)); return s === null || s < 0 ? bad(`"${String(v)}" isn't an amount for ${label}.`) : s;
}
function pctBp(v: unknown, min: number, max: number, label: string): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).trim().replace("%", "").replace(",", "."));
  if (!Number.isFinite(n) || n * 100 < min || n * 100 > max) bad(`${label} must be between ${min / 100}% and ${max / 100}%.`);
  return Math.round(n * 100);
}

export async function loadWealth(userId: string) {
  const [accs, txns, vals, ts] = await Promise.all([
    db.select().from(moneyAccounts).where(eq(moneyAccounts.userId, userId)).orderBy(asc(moneyAccounts.position)),
    db.select({ id: transactions.id, on: transactions.on, kind: transactions.kind, amountSen: transactions.amountSen, accountId: transactions.accountId, toAccountId: transactions.toAccountId, categoryId: transactions.categoryId })
      .from(transactions).where(eq(transactions.userId, userId)).orderBy(asc(transactions.on)),
    db.select({ accountId: accountValues.accountId, on: accountValues.on, valueSen: accountValues.valueSen }).from(accountValues).where(eq(accountValues.userId, userId)),
    db.select().from(things).where(eq(things.userId, userId)).orderBy(asc(things.boughtOn)),
  ]);
  return { accs, txns: txns as RTxn[], vals, things: ts as Thing[] };
}

const monthEndBefore = (day: string) => { const [y, m] = day.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10); };

export async function assetsOverview(userId: string) {
  const today = todayIn();
  const w = await loadWealth(userId);
  const now = wealthAt(w.accs, w.txns, w.vals, w.things, today), lastMonth = wealthAt(w.accs, w.txns, w.vals, w.things, monthEndBefore(today));
  const holdings = w.accs.filter((a) => a.type === "investment" && !a.archived).map((a) => holdingAt(a, w.txns, w.vals, today));
  const items = w.things.map((t) => ({ ...t, worthSen: thingAt(t, today), myCostSen: thingCost(t) }));
  const lastValued = holdings.filter((h) => !h.fixed).map((h) => h.valuedOn).filter(Boolean).sort().pop() ?? null;
  return { today, ...now, changeSen: now.netSen - lastMonth.netSen, holdings, things: items, lastValued };
}

/** Saves several market values on one day (FINNY-95); a blank leaves that holding's last value. */
export async function saveValues(userId: string, body: Record<string, unknown>) {
  const on = isDay(body.on) ? body.on : todayIn();
  if (on > todayIn()) bad("A value can't be from the future.");
  const rows = (Array.isArray(body.values) ? body.values : []) as { accountId: string; value: unknown }[];
  const ids = rows.map((r) => String(r.accountId));
  const own = ids.length ? await db.select({ id: moneyAccounts.id, type: moneyAccounts.type }).from(moneyAccounts).where(and(eq(moneyAccounts.userId, userId), inArray(moneyAccounts.id, ids))) : [];
  let saved = 0;
  for (const r of rows) {
    if (r.value === null || r.value === undefined || String(r.value).trim() === "") continue;
    const a = own.find((x) => x.id === r.accountId);
    if (!a) bad("Account not found."); if (a!.type !== "investment") bad("Market values are for investment accounts.");
    const valueSen = sen(r.value, "a value")!;
    await db.insert(accountValues).values({ userId, accountId: a!.id, on, valueSen }).onConflictDoUpdate({ target: [accountValues.accountId, accountValues.on], set: { valueSen } });
    saved++;
  }
  return { saved, ...(await assetsOverview(userId)) };
}

/** An investment account's kind, and for fixed income its yearly rate and maturity. */
export async function setHolding(userId: string, id: string, body: Record<string, unknown>) {
  const [a] = await db.select().from(moneyAccounts).where(and(eq(moneyAccounts.userId, userId), eq(moneyAccounts.id, id)));
  if (!a) throw new HttpError(404, "Account not found.");
  if (a.type !== "investment") bad("Only investment accounts hold investments.");
  const out: Partial<typeof moneyAccounts.$inferInsert> = {};
  if ("kind" in body) out.holdingKind = (HOLDINGS as readonly string[]).includes(String(body.kind)) ? body.kind as (typeof HOLDINGS)[number] : bad("Unknown kind of investment.");
  if ("rate" in body) out.rateBp = pctBp(body.rate, 0, 100000, "The rate");
  if ("maturityOn" in body) out.maturityOn = body.maturityOn ? (isDay(body.maturityOn) ? body.maturityOn : bad("The maturity date looks wrong.")) : null;
  const [row] = await db.update(moneyAccounts).set(out).where(eq(moneyAccounts.id, id)).returning();
  return row;
}

function thingFields(body: Record<string, unknown>, creating: boolean) {
  const out: Partial<typeof things.$inferInsert> = {};
  if (creating || "name" in body) out.name = String(body.name ?? "").trim().slice(0, 80) || bad("Give it a name.");
  if (creating || "kind" in body) out.kind = (THING_KINDS as readonly string[]).includes(String(body.kind)) ? body.kind as (typeof THING_KINDS)[number] : bad("Pick a kind.");
  if (creating || "boughtOn" in body) out.boughtOn = isDay(body.boughtOn) ? body.boughtOn : bad("When did you get it?");
  if (creating || "cost" in body) out.costSen = sen(body.cost, "what it cost")!;
  if ("yearly" in body) out.yearlyBp = pctBp(body.yearly, -10000, 10000, "The yearly change") ?? 0;
  if ("share" in body) out.shareBp = pctBp(body.share, 1, 10000, "Your share") ?? 10000;
  if ("value" in body) { const v = sen(body.value, "its value", true); out.valueSen = v; out.valueOn = v === null ? null : isDay(body.valueOn) ? body.valueOn : todayIn(); }
  if ("soldOn" in body) out.soldOn = body.soldOn ? (isDay(body.soldOn) ? body.soldOn : bad("The sale date looks wrong.")) : null;
  return out;
}
export async function createThing(userId: string, body: Record<string, unknown>) {
  const [row] = await db.insert(things).values({ userId, ...thingFields(body, true) } as typeof things.$inferInsert).returning();
  return row;
}
export async function updateThing(userId: string, id: string, body: Record<string, unknown>) {
  const [row] = await db.update(things).set(thingFields(body, false)).where(and(eq(things.userId, userId), eq(things.id, id))).returning();
  return row ?? (() => { throw new HttpError(404, "Not found."); })();
}
export async function deleteThing(userId: string, id: string) {
  const gone = await db.delete(things).where(and(eq(things.userId, userId), eq(things.id, id))).returning({ id: things.id });
  if (!gone.length) throw new HttpError(404, "Not found.");
  return { ok: true };
}
