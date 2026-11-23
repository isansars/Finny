// FINNY-62: the annual budget from the "Personal Wealth Management" workbook (sheet Budgeting), read in the browser.
// Its lines are the template's English names (Housing, Food, …); each is matched to one of the owner's categories,
// first by what the owner actually did (Transaction Log rows that are also in Finny, and the category they got),
// then by meaning (Food → makan, Bills → listrik/tagihan…). Pure; tests/unit/budget-import-rule.test.mts.
import type { Sheet, LogRow } from "./import-rule.ts";

export type BudgetLine = { name: string; section: "income" | "expense" | "saving" | "investment"; months: number[] }; // 12 amounts in sen
export type WorkbookBudget = { year: number | null; income: BudgetLine[]; lines: BudgetLine[] };
type Cell = Sheet["data"][number][number];

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const norm = (v: Cell) => String(v ?? "").trim();
const sen = (v: Cell) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : typeof v === "string" && /^[\d.,]+$/.test(v.trim()) ? Math.round(Number(v.replace(/,/g, "")) * 100) : 0);
const SECTIONS: [RegExp, BudgetLine["section"]][] = [[/^expected income/i, "income"], [/^expenses? budget/i, "expense"], [/^saving budget/i, "saving"], [/^investment budget/i, "investment"]];

export function readWorkbookBudget(sheets: Sheet[]): WorkbookBudget | null {
  const s = sheets.find((x) => x.sheet.trim().toLowerCase() === "budgeting");
  if (!s) return null;
  // The header: "Annual Budget" then January … December.
  let hr = -1, label = -1, first = -1;
  s.data.forEach((r, i) => { if (hr >= 0 || !r) return; const j = r.findIndex((v) => /^annual budget$/i.test(norm(v))); if (j >= 0 && norm(r[j + 1]).toLowerCase() === "january") { hr = i; label = j; first = j + 1; } });
  if (hr < 0) return null;
  for (let m = 0; m < 12; m++) if (norm(s.data[hr][first + m]).toLowerCase() !== MONTHS[m]) return null;
  let section: BudgetLine["section"] | null = null;
  const out: BudgetLine[] = [];
  for (const r of s.data.slice(hr + 1)) {
    const name = norm(r?.[label]); if (!name) continue;
    const sec = SECTIONS.find(([re]) => re.test(name)); if (sec) { section = sec[1]; continue; }
    if (!section || /\btotal\b|^allocated|^left to allocate|% of income/i.test(name)) continue;
    const months = Array.from({ length: 12 }, (_, m) => Math.max(0, sen(r?.[first + m] ?? null)));
    if (months.some(Boolean)) out.push({ name, section, months });
  }
  return { year: yearOf(sheets), income: out.filter((l) => l.section === "income"), lines: out.filter((l) => l.section !== "income") };
}

/** The year the workbook's dashboard is set to (the budget sheet itself has no year). */
function yearOf(sheets: Sheet[]): number | null {
  const d = sheets.find((x) => x.sheet.trim().toLowerCase() === "dashboard"); if (!d) return null;
  for (let i = 0; i < Math.min(d.data.length - 1, 30); i++) {
    const j = (d.data[i] ?? []).findIndex((v) => norm(v).toLowerCase() === "year");
    if (j < 0) continue;
    const y = Number(d.data[i + 1]?.[j]); if (Number.isInteger(y) && y >= 2000 && y <= 2100) return y;
  }
  return null;
}

// Meaning: the template's English line → words in the owner's (Indonesian) category names.
const MEANS: Record<string, string[]> = {
  housing: ["rumah tangga", "rumah", "sewa", "kos", "properti"], food: ["makan", "makanan", "dapur"], utilities: ["listrik", "air", "internet", "pulsa"],
  healthcare: ["kesehatan", "obat", "dokter"], transportation: ["transport", "bensin", "parkir", "ojek"], debt: ["cicilan", "utang", "hutang"],
  "personal care": ["pribadi", "perawatan"], education: ["pendidikan", "kursus", "buku"], childcare: ["anak"], household: ["rumah tangga", "dapur", "belanja"],
  pets: ["hewan", "kucing", "anjing"], clothing: ["pakaian", "baju"], insurance: ["asuransi", "bpjs"], "work expenses": ["kerja", "kantor"],
  entertainment: ["hiburan", "nonton", "film", "musik", "game"], gift: ["hadiah", "kado"], travel: ["liburan", "jalan", "travel"], subscription: ["langganan"],
  bills: ["tagihan", "listrik", "air"], coffee: ["kopi"], snacks: ["jajan", "camilan"], cash: ["tunai"], cigarettes: ["rokok"], "bank fees": ["biaya admin", "admin bank", "biaya bank"],
  "general savings": ["tabungan"], "emergency fund": ["dana darurat"], "retirement savings": ["pensiun"], stock: ["saham"], gold: ["emas"], "time deposit": ["deposito"],
};

type Cat = { id: string; kind: string; name: string; parentId: string | null; active?: boolean };
type Known = { on: string; sen: number; categoryId: string | null };

/** For each workbook category, the Finny category its rows most often got (Transaction Log rows also in Finny). */
export function learnedMatches(log: LogRow[], known: Known[]): Map<string, string> {
  const byKey = new Map<string, string[]>();
  for (const k of known) if (k.categoryId) { const key = `${k.on}|${Math.round(k.sen / 100)}`; byKey.set(key, [...(byKey.get(key) ?? []), k.categoryId]); }
  const votes = new Map<string, Map<string, number>>();
  for (const r of log) {
    const ids = byKey.get(`${r.on}|${Math.round(r.sen / 100)}`); if (!ids || ids.length !== 1 || !r.category) continue;
    const v = votes.get(r.category.toLowerCase()) ?? new Map(); v.set(ids[0], (v.get(ids[0]) ?? 0) + 1); votes.set(r.category.toLowerCase(), v);
  }
  const out = new Map<string, string>();
  for (const [c, v] of votes) out.set(c, [...v].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

/** The suggested category for one budget line (null: the owner picks, or leaves it out). */
export function suggestFor(line: BudgetLine, cats: Cat[], learned: Map<string, string>): string | null {
  const want = (c: Cat) => c.active !== false && (line.section === "expense" ? c.kind === "expense" : c.kind === line.section);
  const ok = cats.filter(want);
  const fromHistory = learned.get(line.name.toLowerCase());
  if (fromHistory && ok.some((c) => c.id === fromHistory)) return fromHistory;
  const key = Object.keys(MEANS).find((k) => line.name.toLowerCase().startsWith(k));
  const words = [...(key ? MEANS[key] : []), line.name.toLowerCase()];
  for (const w of words) {
    // Prefer a group (a parent), then any category, whose name holds the word.
    const hits = ok.filter((c) => c.name.toLowerCase().includes(w));
    const group = hits.find((c) => !c.parentId) ?? hits[0];
    if (group) return group.id;
  }
  return null;
}

/** "2025" + the line's 12 amounts → { "2025-01": sen, … }; with `copyTo`, the same amounts for that year too. */
export function monthsOf(year: number, months: number[], copyTo?: number | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const y of copyTo ? [year, copyTo] : [year]) months.forEach((v, i) => { if (v > 0) out[`${y}-${String(i + 1).padStart(2, "0")}`] = v; });
  return out;
}
