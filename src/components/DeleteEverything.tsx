"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "./store";
export function DeleteEverything() {
  const [typed, setTyped] = useState(""); const [err, setErr] = useState(""); const [done, setDone] = useState(false);
  const router = useRouter();
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setErr(""); try { await api("me/data", { method: "DELETE", json: { confirm: typed } }); setDone(true); setTyped(""); router.refresh(); } catch (x) { setErr((x as Error).message); } }}>
      <div style={{ fontWeight: 900, marginBottom: 4, color: "var(--spend)" }}>🗑️ Delete everything</div>
      <p style={{ color: "var(--muted)", fontWeight: 700, margin: "0 0 10px", fontSize: 14 }}>Removes every account, category and transaction. Export first if you want a copy. This can&apos;t be undone.</p>
      {err && <div className="fy-err" role="alert">{err}</div>}
      {done && <div className="fy-note" role="status" style={{ marginBottom: 10 }}>Everything was deleted.</div>}
      <label className="fy-field"><span>Type DELETE to confirm</span><input className="fy-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
      <button className="fy-btn danger" disabled={typed !== "DELETE"}>Delete everything</button>
    </form>
  );
}
