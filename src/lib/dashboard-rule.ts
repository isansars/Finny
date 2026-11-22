// The month at a glance (FINNY-12/42): totals, spending by top-level category, by day, top spends and top places.
// Transfers never count. Pure; tests/unit/dashboard-rule.test.mts.
export type DTxn = { id: string; on: string; kind: string; amountSen: number; categoryId: string | null; entity: string | null; description: string; accountId: string };
export type DCat = { id: string; kind: string; parentId: string | null; name: string };

export function rootOf(id: string, cats: DCat[]): string {
  const by = new Map(cats.map((c) => [c.id, c]));
  let cur = by.get(id), guard = 0;
  while (cur?.parentId && by.has(cur.parentId) && guard++ < 20) cur = by.get(cur.parentId);
  return cur?.id ?? id;
}

export function dashboard(txns: DTxn[], cats: DCat[], daysInMonth: number) {
  const kindOf = new Map(cats.map((c) => [c.id, c.kind]));
  const totals = { incomeSen: 0, spendSen: 0, savedSen: 0, investedSen: 0 };
  const byCat = new Map<string, number>(), byDay = new Array<number>(daysInMonth).fill(0), places = new Map<string, number>();
  const spends: DTxn[] = [];
  for (const t of txns) {
    if (t.kind === "income") { totals.incomeSen += t.amountSen; continue; }
    if (t.kind !== "spend") continue;
    const k = t.categoryId ? kindOf.get(t.categoryId) : undefined;
    if (k === "saving") { totals.savedSen += t.amountSen; continue; }
    if (k === "investment") { totals.investedSen += t.amountSen; continue; }
    totals.spendSen += t.amountSen;
    const root = t.categoryId ? rootOf(t.categoryId, cats) : "none";
    byCat.set(root, (byCat.get(root) ?? 0) + t.amountSen);
    const d = Number(t.on.slice(8, 10)); if (d >= 1 && d <= daysInMonth) byDay[d - 1] += t.amountSen;
    const place = (t.entity || "").trim();
    if (place) places.set(place, (places.get(place) ?? 0) + t.amountSen);
    spends.push(t);
  }
  return {
    totals,
    byCategory: [...byCat.entries()].map(([categoryId, sen]) => ({ categoryId, sen })).sort((a, b) => b.sen - a.sen),
    byDay,
    topSpends: spends.sort((a, b) => b.amountSen - a.amountSen || b.on.localeCompare(a.on)).slice(0, 10).map((t) => ({ id: t.id, on: t.on, sen: t.amountSen, description: t.description, categoryId: t.categoryId })),
    topPlaces: [...places.entries()].map(([name, sen]) => ({ name, sen })).sort((a, b) => b.sen - a.sen).slice(0, 10),
  };
}
