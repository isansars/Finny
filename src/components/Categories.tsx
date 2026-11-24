"use client";
// Categories (FINNY-30, restyled in FINNY-40): a segmented control per kind, the tree as a grouped list with icon tiles;
// a row opens a sheet to rename, pick an icon and a colour, move, merge, switch off or delete.
import { useState } from "react";
import { ChevronDown, ChevronRight, Plus, ChevronLeft } from "lucide-react";
import { api, useFinny, type Category } from "./store";
import { CategoryOptions, Sheet } from "./ui";
import { CatTile, ICON_KEYS, Tile } from "./icons";
import { flattenTree, descendants } from "@/lib/category-rule";
import { lookOf, PALETTE_KEYS } from "@/lib/category-look";

const KINDS = [["expense", "Expense"], ["income", "Income"], ["saving", "Saving"], ["investment", "Investment"]] as const;

function CategorySheet({ c, kind, onDone }: { c: Category | null; kind: string; onDone: () => void }) {
  const { categories, reload } = useFinny();
  const [name, setName] = useState(c?.name ?? "");
  const guess = lookOf({ name: name || "x", kind, icon: null, color: null });
  const [icon, setIcon] = useState<string | null>(c?.icon ?? null);
  const [color, setColor] = useState<string | null>(c?.color ?? null);
  const [parentId, setParentId] = useState(c?.parentId ?? "");
  const [into, setInto] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const blocked = c ? new Set([c.id, ...descendants(c.id, categories)]) : new Set<string>();
  const parents = categories.filter((x) => x.kind === kind && !blocked.has(x.id));
  const run = async (fn: () => Promise<unknown>) => { setErr(""); setBusy(true); try { await fn(); await reload(); onDone(); } catch (x) { setErr((x as Error).message); setBusy(false); } };
  const shownIcon = icon ?? guess.icon, shownColor = color ?? guess.color;
  return (
    <div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <form onSubmit={(e) => { e.preventDefault(); run(() => api(c ? `categories/${c.id}` : "categories", { method: c ? "PATCH" : "POST", json: { kind, name, icon, color, parentId: parentId || null } })); }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <Tile icon={shownIcon} color={shownColor} size={46} />
          <label className="fy-field" style={{ flex: 1, margin: 0 }}><span className="fy-label">Name</span><input className="fy-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus /></label>
        </div>
        <div className="fy-subhead" style={{ marginTop: 14 }}><span>Colour</span>{color && <button type="button" onClick={() => setColor(null)}>Automatic</button>}</div>
        <div className="fy-swatches" role="radiogroup" aria-label="Colour">{PALETTE_KEYS.map((k) => <button type="button" key={k} role="radio" aria-checked={shownColor === k} aria-label={k} onClick={() => setColor(k)}><Tile icon={shownIcon} color={k} size={34} /></button>)}</div>
        <div className="fy-subhead" style={{ marginTop: 12 }}><span>Icon</span>{icon && <button type="button" onClick={() => setIcon(null)}>Automatic</button>}</div>
        <div className="fy-icons" role="radiogroup" aria-label="Icon">{ICON_KEYS.map((k) => <button type="button" key={k} role="radio" aria-checked={shownIcon === k} aria-label={k} onClick={() => setIcon(k)}><Tile icon={k} color={shownColor} size={34} /></button>)}</div>
        <label className="fy-field" style={{ marginTop: 12 }}><span className="fy-label">Inside</span>
          <select className="fy-input" aria-label="Parent category" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— top level —</option>
            {flattenTree(parents, kind).filter((x) => x.depth < 2).map((x) => <option key={x.id} value={x.id}>{"  ".repeat(x.depth)}{x.name}</option>)}
          </select>
        </label>
        <div className="fy-sheet-foot"><button className="fy-btn primary block" disabled={busy}>{c ? "Save" : "Add category"}</button></div>
      </form>
      {c && (<>
        <div className="fy-section"><span>More</span></div>
        <button className="fy-btn block" disabled={busy} onClick={() => run(() => api(`categories/${c.id}`, { method: "PATCH", json: { active: !c.active } }))}>{c.active ? "Switch off (hide it, keep its history)" : "Switch back on"}</button>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 8, alignItems: "end" }}>
          <label className="fy-field" style={{ margin: 0 }}><span className="fy-label">Merge into…</span>
            <select className="fy-input" aria-label="Merge into" value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="">Choose…</option><CategoryOptions cats={categories} kinds={[c.kind]} includeOff exclude={c.id} />
            </select>
          </label>
          <button className="fy-btn" disabled={busy || !into} onClick={() => { const t = categories.find((x) => x.id === into); if (confirm(`Move every "${c.name}" transaction to "${t?.name}" and remove "${c.name}"?`)) run(() => api(`categories/${c.id}/merge`, { method: "POST", json: { into } })); }}>Merge</button>
        </div>
        <button className="fy-btn danger block" style={{ marginTop: 8 }} disabled={busy} onClick={() => { if (confirm(`Delete "${c.name}"?`)) run(() => api(`categories/${c.id}`, { method: "DELETE" })); }}>Delete (only if unused)</button>
      </>)}
    </div>
  );
}

export function Categories() {
  const { categories, loaded, reload } = useFinny();
  const [kind, setKind] = useState<string>("expense");
  const [edit, setEdit] = useState<Category | null | undefined>(undefined);
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const tree = flattenTree(categories, kind);
  const hidden = new Set<string>(); for (const id of folded) for (const d of descendants(id, categories)) hidden.add(d);
  return (
    <>
      <a className="fy-back" href="/settings"><ChevronLeft size={20} />Settings</a>
      <div className="fy-large"><div><div className="sub">{categories.length} in all</div><h1>Categories</h1></div><button className="fy-btn primary small" onClick={() => setEdit(null)} aria-label="New category"><Plus size={16} />New category</button></div>
      <div className="fy-seg" role="tablist" style={{ marginBottom: 6 }}>{KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
      {loaded && !categories.length && (
        <div className="fy-card fy-empty" style={{ marginTop: 12 }}><Tile icon="shapes" color="lavender" size={52} /><b>No categories yet</b>Start with a set in your own words (Makan di Luar, Beli Kopi, Gaji Bulanan…) and change anything after.
          <div style={{ marginTop: 14 }}><button className="fy-btn primary" disabled={busy} onClick={async () => { setBusy(true); await api("categories/starter", { method: "POST" }).catch(() => {}); await reload(); setBusy(false); }}>Add starter categories</button></div></div>
      )}
      {loaded && categories.length > 0 && !tree.length && <div className="fy-card fy-empty" style={{ marginTop: 12 }}>No categories of this kind yet.</div>}
      {tree.length > 0 && <div className="fy-list" style={{ marginTop: 12 }} data-testid="category-tree">
        {tree.filter((c) => !hidden.has(c.id)).map((c) => {
          const hasKids = categories.some((x) => x.parentId === c.id);
          return (
            <div key={c.id} className="fy-row" style={{ padding: 0, opacity: c.active ? 1 : .5 }} data-testid={`cat-${c.name}`}>
              {/* 11. tap the row to edit it, like Settings; folding has its own button */}
              <button className="fy-row" style={{ flex: 1, paddingLeft: 16 + c.depth * 22 }} aria-label={`Change ${c.name}`} onClick={() => setEdit(c)}>
                <CatTile c={c} />
                <div className="main"><div className="t">{c.name}{c.active ? "" : " (off)"}</div>{hasKids && <div className="s">{categories.filter((x) => x.parentId === c.id).length} inside</div>}</div>
                {!hasKids && <ChevronRight className="chev" size={18} />}
              </button>
              {hasKids && <button className="fy-more" style={{ width: 48, height: 56, justifyContent: "center" }} aria-label={`${folded.has(c.id) ? "Open" : "Fold"} ${c.name}`} onClick={() => { const f = new Set(folded); if (f.has(c.id)) f.delete(c.id); else f.add(c.id); setFolded(f); }}>{folded.has(c.id) ? <ChevronRight size={20} /> : <ChevronDown size={20} />}</button>}
            </div>
          );
        })}
      </div>}
      {edit !== undefined && <Sheet title={edit ? edit.name : "New category"} onClose={() => setEdit(undefined)}><CategorySheet c={edit} kind={edit?.kind ?? kind} onDone={() => setEdit(undefined)} /></Sheet>}
    </>
  );
}
