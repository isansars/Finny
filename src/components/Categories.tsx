"use client";
// Categories (FINNY-30): one tree per kind; each row's ⋯ renames, moves, merges, switches off or deletes.
import { useState } from "react";
import { api, useFinny, type Category } from "./store";
import { CategoryOptions, Sheet } from "./ui";
import { flattenTree, descendants } from "@/lib/category-rule";

const KINDS = [["expense", "Expense"], ["income", "Income"], ["saving", "Saving"], ["investment", "Invest"]] as const;

function CategorySheet({ c, kind, onDone }: { c: Category | null; kind: string; onDone: () => void }) {
  const { categories, reload } = useFinny();
  const [name, setName] = useState(c?.name ?? "");
  const [emoji, setEmoji] = useState(c?.emoji ?? "");
  const [parentId, setParentId] = useState(c?.parentId ?? "");
  const [into, setInto] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const blocked = c ? new Set([c.id, ...descendants(c.id, categories)]) : new Set<string>();
  const parents = categories.filter((x) => x.kind === kind && !blocked.has(x.id));
  const run = async (fn: () => Promise<unknown>) => { setErr(""); setBusy(true); try { await fn(); await reload(); onDone(); } catch (x) { setErr((x as Error).message); setBusy(false); } };
  return (
    <div>
      {err && <div className="fy-err" role="alert">{err}</div>}
      <form onSubmit={(e) => { e.preventDefault(); run(() => api(c ? `categories/${c.id}` : "categories", { method: c ? "PATCH" : "POST", json: { kind, name, emoji, parentId: parentId || null } })); }}>
        <div className="fy-row2">
          <label className="fy-field"><span>Name</span><input className="fy-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoFocus /></label>
          <label className="fy-field"><span>Emoji (optional)</span><input className="fy-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} /></label>
        </div>
        <label className="fy-field"><span>Inside</span>
          <select className="fy-input" aria-label="Parent category" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">— top level —</option>
            {flattenTree(parents, kind).filter((x) => x.depth < 2).map((x) => <option key={x.id} value={x.id}>{"  ".repeat(x.depth)}{x.name}</option>)}
          </select>
        </label>
        <button className="fy-btn block" disabled={busy}>{c ? "Save" : "Add category"}</button>
      </form>
      {c && (<>
        <div className="fy-grp"><span>More</span></div>
        <button className="fy-btn ghost block" disabled={busy} onClick={() => run(() => api(`categories/${c.id}`, { method: "PATCH", json: { active: !c.active } }))}>{c.active ? "Switch off (hide from the form, keep history)" : "Switch back on"}</button>
        <div className="fy-row2" style={{ marginTop: 8, alignItems: "end" }}>
          <label className="fy-field" style={{ margin: 0 }}><span>Merge into…</span>
            <select className="fy-input" aria-label="Merge into" value={into} onChange={(e) => setInto(e.target.value)}>
              <option value="">Choose…</option><CategoryOptions cats={categories} kinds={[c.kind]} includeOff exclude={c.id} />
            </select>
          </label>
          <button className="fy-btn ghost" disabled={busy || !into} onClick={() => { const t = categories.find((x) => x.id === into); if (confirm(`Move every "${c.name}" transaction to "${t?.name}" and remove "${c.name}"?`)) run(() => api(`categories/${c.id}/merge`, { method: "POST", json: { into } })); }}>Merge</button>
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
      <div className="fy-h1"><span>Categories</span><button className="fy-btn small" onClick={() => setEdit(null)}>＋ Add</button></div>
      <div className="fy-tabs" role="tablist">{KINDS.map(([k, l]) => <button key={k} role="tab" aria-selected={kind === k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
      {loaded && !categories.length && (
        <div className="fy-empty"><b>No categories yet</b>Start with a set in your own words (Makan di Luar, Beli Kopi, Gaji Bulanan…) and change anything after.
          <div style={{ marginTop: 12 }}><button className="fy-btn" disabled={busy} onClick={async () => { setBusy(true); await api("categories/starter", { method: "POST" }).catch(() => {}); await reload(); setBusy(false); }}>Add starter categories</button></div></div>
      )}
      {loaded && categories.length > 0 && !tree.length && <div className="fy-empty">No categories of this kind yet.</div>}
      <div data-testid="category-tree">
        {tree.filter((c) => !hidden.has(c.id)).map((c) => {
          const hasKids = categories.some((x) => x.parentId === c.id);
          return (
            <div key={c.id} className={`fy-cat ${c.active ? "" : "off"}`} style={{ paddingLeft: 4 + c.depth * 18 }} data-testid={`cat-${c.name}`}>
              <span className="nm">
                {hasKids ? <button className="fy-link" style={{ padding: "0 6px 0 0", color: "var(--muted)" }} aria-label={`${folded.has(c.id) ? "Open" : "Fold"} ${c.name}`} onClick={() => { const f = new Set(folded); if (f.has(c.id)) f.delete(c.id); else f.add(c.id); setFolded(f); }}>{folded.has(c.id) ? "▸" : "▾"}</button> : null}
                {c.emoji ? c.emoji + " " : ""}{c.name}{c.active ? "" : " (off)"}
              </span>
              <button className="more" aria-label={`Change ${c.name}`} onClick={() => setEdit(c)}>⋯</button>
            </div>
          );
        })}
      </div>
      {edit !== undefined && <Sheet title={edit ? edit.name : "Add a category"} onClose={() => setEdit(undefined)}><CategorySheet c={edit} kind={edit?.kind ?? kind} onDone={() => setEdit(undefined)} /></Sheet>}
    </>
  );
}
