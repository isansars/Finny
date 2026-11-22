// One category tree (FINNY-10): kinds at the top, then up to 3 levels. Pure; tests/unit/category-rule.test.mts.
export const MAX_DEPTH = 3;
export type Cat = { id: string; kind: string; parentId: string | null; name: string; active?: boolean };

export function depthOf(id: string, cats: Cat[]): number {
  const by = new Map(cats.map((c) => [c.id, c]));
  let d = 0, cur = by.get(id), guard = 0;
  while (cur && guard++ < 50) { d++; cur = cur.parentId ? by.get(cur.parentId) : undefined; }
  return d;
}
/** How many levels a category and its descendants span (1 for a leaf). */
export function heightOf(id: string, cats: Cat[]): number {
  const kids = cats.filter((c) => c.parentId === id);
  return 1 + (kids.length ? Math.max(...kids.map((k) => heightOf(k.id, cats))) : 0);
}
export function descendants(id: string, cats: Cat[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => { for (const c of cats) if (c.parentId === p) { out.push(c.id); walk(c.id); } };
  walk(id); return out;
}

/** Why `id` can't go under `parentId` (null = top level), or null when it can. A new category passes id = "". */
export function placeProblem(id: string, kind: string, parentId: string | null, cats: Cat[]): string | null {
  if (!parentId) return null;
  const parent = cats.find((c) => c.id === parentId);
  if (!parent) return "That parent category doesn't exist.";
  if (parent.kind !== kind) return "A category can only sit under one of the same kind.";
  if (id && (parentId === id || descendants(id, cats).includes(parentId))) return "A category can't go under itself.";
  const height = id ? heightOf(id, cats) : 1;
  if (depthOf(parentId, cats) + height > MAX_DEPTH) return `Categories go at most ${MAX_DEPTH} levels deep.`;
  return null;
}

/** Why `from` can't be merged into `into`, or null. */
export function mergeProblem(from: string, into: string, cats: Cat[]): string | null {
  const a = cats.find((c) => c.id === from), b = cats.find((c) => c.id === into);
  if (!a || !b) return "Category not found.";
  if (a.id === b.id) return "Pick a different category to merge into.";
  if (a.kind !== b.kind) return "Only categories of the same kind can be merged.";
  if (descendants(a.id, cats).includes(b.id)) return "Can't merge a category into one of its own sub-categories.";
  return null;
}

/** The tree in display order: each node with its depth (0-based), parents before children, siblings by name. */
export function flattenTree<T extends Cat & { position?: number }>(cats: T[], kind?: string): (T & { depth: number })[] {
  const list = kind ? cats.filter((c) => c.kind === kind) : cats;
  const ids = new Set(list.map((c) => c.id));
  const sort = (a: T, b: T) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name, "id");
  const out: (T & { depth: number })[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of list.filter((x) => (parent ? x.parentId === parent : !x.parentId || !ids.has(x.parentId))).sort(sort)) {
      out.push({ ...c, depth }); walk(c.id, depth + 1);
    }
  };
  walk(null, 0); return out;
}
