"use client";
// Read a bank e-statement (FINNY-73), as approved in "Sprint 4 · Design notes (e-statements)": choose the PDF → (password)
// → check each line → fix a line → save the new ones as one batch. The PDF is read in this tab (pdf-text.ts) and never
// uploaded; only the confirmed lines are sent.
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeftRight, CalendarDays, Check, ChevronLeft, CircleAlert, CreditCard, Eye, EyeOff, FileText, Landmark, LoaderCircle, Lock, ShieldCheck, Smartphone, Undo2, Upload } from "lucide-react";
import { api, remember, useFinny, type Account, type Category } from "./store";
import { CatTile } from "./icons";
import { CategoryOptions, Money, Sheet } from "./ui";
import { formatRupiah } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { BANK_NAMES, readStatement, type Bank, type Statement } from "@/lib/statement-rule";
import { balanceCheck, foldCashback, matchStatement, type Checked, type Existing, type Status } from "@/lib/statement-match";
import { readPdfText, fingerprint, PdfLocked } from "@/lib/pdf-text";

type Batch = { id: string; source: string; kind: string; bank: string | null; accountId: string | null; periodFrom: string | null; periodTo: string | null; createdAt: string; txns: number };
type Context = { balanceEndSen: number; existing: Existing[]; history: { description: string; categoryId: string | null; on: string }[]; ownerName: string | null; alreadyRead: { id: string; createdAt: string } | null };
type Choice = { status: Status | "skip"; categoryId: string | null; otherAccountId: string | null; note: string };
type Step = "start" | "reading" | "password" | "check";

const BANK_LOOK: Record<Bank, { color: string; card?: boolean; sub: string }> = {
  bca: { color: "sky", sub: "Tahapan savings · monthly mutasi" },
  "bca-card": { color: "pink", card: true, sub: "Monthly bill · every BCA card on it" },
  mandiri: { color: "peach", sub: "Consolidated statement · savings" },
  krom: { color: "mint", sub: "Monthly statement · main account" },
  "bri-card": { color: "lavender", card: true, sub: "Billing statement · locked PDF" },
};
const PILL: Record<Status | "skip", { label: string; color: string }> = {
  new: { label: "New", color: "pink" }, in: { label: "Already in", color: "mint" }, xfer: { label: "Transfer", color: "lavender" }, check: { label: "Check", color: "lemon" }, skip: { label: "Skip", color: "slate" },
};
const dayMonth = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const monthName = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const monthYear = (iso: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
const dayHead = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));

/** The account a statement most likely belongs to: the one chosen last time for these digits, else one named like the bank. */
function guessAccount(st: Statement, accounts: Account[]): string {
  const live = accounts.filter((a) => !a.archived);
  const saved = remember.get(`stmt.${st.bank}.${st.accountDigits}`);
  if (saved && live.some((a) => a.id === saved)) return saved;
  const word = st.bank.replace(/-card$/, "");
  const card = st.bank.endsWith("-card");
  const named = live.filter((a) => a.name.toLowerCase().includes(word) && (card ? a.type === "card" : a.type !== "card"));
  return (named.find((a) => a.name.includes(st.accountDigits)) ?? named[0] ?? live.find((a) => (card ? a.type === "card" : a.type === "bank")))?.id ?? "";
}

function Pill({ s }: { s: Status | "skip" }) {
  const p = PILL[s];
  return <span className="fy-pill" style={{ background: `var(--${p.color}-s)`, color: `var(--${p.color}-i)` }}>{p.label}</span>;
}

export function StatementReader() {
  const { accounts, categories, reload, loaded } = useFinny();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>("start");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [file, setFile] = useState<{ name: string; bytes: ArrayBuffer; hash: string } | null>(null);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwWrong, setPwWrong] = useState(false);
  const [st, setSt] = useState<Statement | null>(null);
  const [accountId, setAccountId] = useState("");
  const [ctx, setCtx] = useState<Context | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [filter, setFilter] = useState<"all" | "new" | "in" | "check">("all");
  const [open, setOpen] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [batches, setBatches] = useState<Batch[]>([]);

  const loadBatches = () => api<Batch[]>("imports").then((b) => setBatches(b.filter((x) => x.kind === "statement"))).catch(() => {});
  useEffect(() => { loadBatches(); }, []);

  const account = accounts.find((a) => a.id === accountId);
  const lines = useMemo(() => (st ? foldCashback(st.lines.map((l) => ({ ...l }))) : []), [st]);
  const rows: Checked[] = useMemo(() => (st && ctx && accountId
    ? matchStatement({ statement: st, lines, accountId, accounts, categories, existing: ctx.existing, history: ctx.history, ownerName: ctx.ownerName })
    : []), [st, ctx, accountId, lines, accounts, categories]);

  /** The owner's choice for a line, or what the rule suggested. */
  const pick = (r: Checked): Choice => choices[r.i] ?? { status: r.status, categoryId: r.categoryId, otherAccountId: r.otherAccountId, note: "" };
  const saving_ = (c: Choice) => c.status === "new" || c.status === "xfer";
  const effective = rows.map((r) => ({ ...r, status: pick(r).status === "skip" ? ("in" as Status) : (pick(r).status as Status) }));
  const toSave = rows.filter((r) => saving_(pick(r)));
  const missing = toSave.filter((r) => { const c = pick(r); return c.status === "new" ? !c.categoryId : !c.otherAccountId; });
  const bal = st && account && ctx ? balanceCheck(st, account.type, ctx.balanceEndSen, effective) : null;
  const counts = { all: rows.length, new: rows.filter((r) => saving_(pick(r))).length, in: rows.filter((r) => ["in", "skip"].includes(pick(r).status)).length, check: rows.filter((r) => pick(r).status === "check").length };

  async function choose(f: File) {
    setErr(""); setMsg(""); setStep("reading");
    try {
      if (f.size > 20 * 1024 * 1024) throw new Error("That file is over 20 MB; a monthly statement is much smaller.");
      const bytes = await f.arrayBuffer();
      const hash = await fingerprint(bytes);
      setFile({ name: f.name, bytes, hash });
      await read(bytes, hash);
    } catch (e) { setErr((e as Error).message); setStep("start"); }
  }

  async function read(bytes: ArrayBuffer, hash: string, pw?: string) {
    setStep("reading");
    try {
      const pages = await readPdfText(bytes, pw);
      setPassword(""); setPwWrong(false);
      const r = readStatement(pages);
      if (!r.ok) { setErr(r.message); setStep("start"); return; }
      const acc = params.get("account") && accounts.some((a) => a.id === params.get("account")) ? params.get("account")! : guessAccount(r.statement, accounts);
      setSt(r.statement); setChoices({}); setFilter("all");
      await openFor(r.statement, acc, hash);
    } catch (e) {
      if (e instanceof PdfLocked) { setPwWrong(e.wrong); setStep("password"); return; }
      setErr((e as Error).message); setStep("start");
    }
  }

  async function openFor(s: Statement, acc: string, hash: string) {
    setAccountId(acc); setCtx(null); setChoices({});
    if (!acc) { setStep("check"); return; }
    const c = await api<Context>(`statements/context?accountId=${acc}&from=${s.periodFrom}&to=${s.periodTo}&hash=${hash}`);
    setCtx(c); setStep("check");
  }

  async function save() {
    if (!st || !file || !account) return;
    setSaving(true); setErr("");
    try {
      const out = toSave.map((r) => {
        const c = pick(r), l = r.line;
        const extra = [l.currency ? `${l.currency} ${l.foreignAmount} × ${l.rate}` : "", l.instalment ?? "", c.note.trim()].filter(Boolean).join(" · ");
        const base = { on: l.on, sen: Math.abs(l.amountSen), description: l.description, note: extra || null };
        if (c.status === "xfer") return l.amountSen < 0 ? { ...base, kind: "transfer", accountId: account.id, toAccountId: c.otherAccountId } : { ...base, kind: "transfer", accountId: c.otherAccountId, toAccountId: account.id };
        return { ...base, kind: l.amountSen < 0 ? "spend" : "income", accountId: account.id, categoryId: c.categoryId };
      });
      const r = await api<{ added: number; skipped: number }>("statements", { method: "POST", json: { accountId: account.id, bank: st.bank, bankName: BANK_NAMES[st.bank], periodFrom: st.periodFrom, periodTo: st.periodTo, fileHash: file.hash, lines: out } });
      remember.set(`stmt.${st.bank}.${st.accountDigits}`, account.id);
      setMsg(`Saved ${r.added} line${r.added === 1 ? "" : "s"} from ${BANK_NAMES[st.bank]} · ${monthYear(st.periodTo)}.${r.skipped ? ` ${r.skipped} were already in.` : ""}`);
      setSt(null); setFile(null); setCtx(null); setStep("start"); await reload(); loadBatches();
      scrollTo({ top: 0 });
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function undo(b: Batch) {
    if (!confirm(`Undo "${b.source}"? This removes its ${b.txns} saved lines.`)) return;
    try { const r = await api<{ removed: number }>(`imports/${b.id}`, { method: "DELETE" }); await reload(); loadBatches(); setErr(""); setMsg(`Removed ${r.removed} lines.`); }
    catch (e) { setErr((e as Error).message); }
  }

  const back = (label: string, onClick: () => void) => <button className="fy-back" onClick={onClick}><ChevronLeft size={20} />{label}</button>;
  const head = (sub: string, title: string) => <div className="fy-large"><div><div className="sub">{sub}</div><h1>{title}</h1></div></div>;
  const errBox = err && <div className="fy-err" role="alert">{err}</div>;

  // ---------------------------------------------------------------- start (and reading, and the password sheet over it)
  if (step !== "check" || !st) {
    const acc = (id: string | null) => accounts.find((a) => a.id === id)?.name;
    return (
      <>
        <a className="fy-back" href="/settings"><ChevronLeft size={20} />Settings</a>
        {head("Import", "Bank statements")}{errBox}
        {msg && <div className="fy-ok" role="status"><Check size={16} /> {msg}</div>}
        <div className="fy-card fy-pad fy-drop">
          <span className="fy-tile" data-color="pink" style={{ width: 52, height: 52, borderRadius: 16 }}><Upload size={28} /></span>
          <div style={{ fontWeight: 800, fontSize: 18, margin: "10px 0 2px" }}>Choose this month&apos;s PDF</div>
          <div className="fy-hint" style={{ margin: "0 0 14px" }}>The e-statement your bank emails you</div>
          <label className="fy-btn primary block" style={{ position: "relative" }} aria-busy={step === "reading"}>
            {step === "reading" ? <><LoaderCircle size={18} className="fy-spin" /> Reading {file?.name ?? "the PDF"}…</> : !loaded ? <><LoaderCircle size={18} className="fy-spin" /> Loading your accounts…</> : <><FileText size={18} /> Choose a PDF</>}
            <input type="file" accept="application/pdf,.pdf" aria-label="Choose a PDF statement" disabled={step === "reading" || !loaded}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) choose(f); e.target.value = ""; }} />
          </label>
        </div>
        <div className="fy-note fy-iconnote"><Smartphone size={16} /><span>Read on this device. The PDF and its password never leave it; only the lines you confirm are saved.</span></div>
        <div className="fy-section"><span>Works with</span><span>{Object.keys(BANK_LOOK).length} statements</span></div>
        <div className="fy-list" data-testid="banks">
          {(Object.keys(BANK_LOOK) as Bank[]).map((b) => (
            <div className="fy-row" key={b}><span className="fy-tile" data-color={BANK_LOOK[b].color} style={{ width: 32, height: 32, borderRadius: 10 }}>{BANK_LOOK[b].card ? <CreditCard size={18} /> : <Landmark size={18} />}</span>
              <div className="main"><div className="t">{BANK_NAMES[b]}</div><div className="s">{BANK_LOOK[b].sub}</div></div></div>
          ))}
        </div>
        <div className="fy-section"><span>Read before</span></div>
        <div className="fy-list" data-testid="statements">
          {!batches.length && <div className="fy-row plain"><div className="main"><div className="t">None yet</div><div className="s">Each statement can be undone in one tap</div></div></div>}
          {batches.map((b) => (
            <div className="fy-row" key={b.id}><span className="fy-tile" data-color={b.bank && b.bank in BANK_LOOK ? BANK_LOOK[b.bank as Bank].color : "slate"} style={{ width: 32, height: 32, borderRadius: 10 }}><FileText size={18} /></span>
              <div className="main"><div className="t">{b.bank && b.bank in BANK_NAMES ? BANK_NAMES[b.bank as Bank] : b.source} · {b.periodTo ? monthYear(b.periodTo) : ""}</div>
                <div className="s">{b.txns} added{acc(b.accountId) ? ` to ${acc(b.accountId)}` : ""} · {shortDate(b.createdAt.slice(0, 10))}</div></div>
              <button className="fy-btn small" onClick={() => undo(b)} aria-label={`Undo ${b.source}`}><Undo2 size={15} />Undo</button></div>
          ))}
        </div>
        {step === "password" && file && (
          <Sheet title="Locked PDF" onClose={() => { setStep("start"); setPassword(""); }}>
            <form onSubmit={(e) => { e.preventDefault(); if (password) read(file.bytes, file.hash, password); }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", margin: "6px 0 16px" }}>
                <span className="fy-tile" data-color="lavender" style={{ width: 56, height: 56, borderRadius: 17 }}><Lock size={30} /></span>
                <div style={{ fontWeight: 800, fontSize: 19, marginTop: 12 }}>This statement is locked</div>
                <div className="fy-hint" style={{ margin: "4px 8px 0" }}>Banks lock some statements with a password they gave you. Type it here to open the file.</div>
              </div>
              <div className="fy-list" style={{ marginBottom: 14 }}><div className="fy-row"><span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><FileText size={18} /></span>
                <div className="main"><div className="t">{file.name}</div><div className="s">Locked PDF</div></div></div></div>
              <label className="fy-field"><span className="fy-label">PDF password</span>
                <span style={{ position: "relative", display: "block" }}>
                  <input className="fy-input" type={showPw ? "text" : "password"} autoComplete="off" autoFocus value={password} onChange={(e) => { setPassword(e.target.value); setPwWrong(false); }} aria-invalid={pwWrong} style={{ paddingRight: 48 }} />
                  <button type="button" className="fy-eye" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </span>
              </label>
              {pwWrong && <div className="fy-err" role="alert">That password didn&apos;t open it. Try again.</div>}
              <div className="fy-hint fy-iconnote" style={{ background: "none", padding: 0, margin: "-4px 0 16px" }}><ShieldCheck size={16} /><span>Used once on this device, then forgotten. Never saved, never sent.</span></div>
              <button className="fy-btn primary block" disabled={!password}>Open statement</button>
            </form>
          </Sheet>
        )}
      </>
    );
  }

  // ---------------------------------------------------------------- check
  const card = account?.type === "card" || st.bank.endsWith("-card");
  const shown = [...rows].filter((r) => {
    const s = pick(r).status;
    return filter === "all" || (filter === "new" && saving_(pick(r))) || (filter === "in" && (s === "in" || s === "skip")) || (filter === "check" && s === "check");
  }).reverse();
  const days = [...new Set(shown.map((r) => r.line.on))];
  const pickedLine = open === null ? null : rows.find((r) => r.i === open) ?? null;
  const candidates = accounts.filter((a) => !a.archived && (card ? a.type === "card" : a.type !== "card"));
  return (
    <>
      {back("Back", () => { setStep("start"); setSt(null); setCtx(null); })}
      {head(`${BANK_NAMES[st.bank]}${account && account.name.toLowerCase() !== BANK_NAMES[st.bank].toLowerCase() ? ` · ${account.name}` : ""}`, card ? `${monthName(st.periodTo)} bill` : monthYear(st.periodTo))}
      {errBox}
      <label className="fy-field" style={{ marginBottom: 10 }}><span className="fy-label">Into account</span>
        <select className="fy-input" value={accountId} aria-label="Into account" onChange={(e) => { if (file) openFor(st, e.target.value, file.hash); }}>
          {!accountId && <option value="">Pick an account…</option>}
          {candidates.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          {accounts.filter((a) => !a.archived && !candidates.includes(a)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {!accountId && <div className="fy-note">Pick the account this statement belongs to. Finny remembers it for next month.</div>}
      {ctx?.alreadyRead && <div className="fy-err" role="alert">You saved this statement on {shortDate(ctx.alreadyRead.createdAt.slice(0, 10))}. Undo it under Read before to read it again.</div>}
      {bal && (bal.gapSen === 0
        ? <div className="fy-ok" data-testid="balance"><Check size={16} /> {card ? `Bill ${formatRupiah(bal.statementSen)} matches Finny` : `Ending balance ${formatRupiah(bal.statementSen)} matches Finny on ${shortDate(st.periodTo)}`}</div>
        : <div className="fy-card fy-pad fy-gap" data-testid="balance"><div className="h"><CircleAlert size={18} /> {formatRupiah(Math.abs(bal.gapSen))} apart</div>
          <div className="b">{card ? `The bank's bill is ${formatRupiah(bal.statementSen)}; Finny has ${formatRupiah(bal.finnySen)} for this card` : `The statement ends at ${formatRupiah(bal.statementSen)}; Finny would have ${formatRupiah(bal.finnySen)} on ${shortDate(st.periodTo)}`} after saving.{counts.check ? ` ${counts.check} line${counts.check > 1 ? "s" : ""} marked Check need${counts.check > 1 ? "" : "s"} a look.` : ""}</div></div>)}
      {st.dueOn && <div className="fy-note fy-iconnote" data-testid="due" style={{ marginTop: 8 }}><CalendarDays size={16} /><span>Due {dayMonth(st.dueOn)}{st.minimumSen !== undefined ? ` · minimum ${formatRupiah(st.minimumSen)}` : ""}</span></div>}
      {accountId && ctx && <>
        <div className="fy-seg" role="tablist" aria-label="Show" style={{ margin: "10px 0 2px" }}>
          {(["all", "new", "in", "check"] as const).map((f) => <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>{{ all: "All", new: "New", in: "In", check: "Check" }[f]} {counts[f]}</button>)}
        </div>
        {!shown.length && <div className="fy-empty" style={{ padding: 24 }}>Nothing here.</div>}
        {days.map((d) => (
          <div key={d}>
            <div className="fy-section"><span>{dayHead(d)}</span></div>
            <div className="fy-list">
              {shown.filter((r) => r.line.on === d).map((r) => {
                const c = pick(r), cat = categories.find((x) => x.id === c.categoryId), other = accounts.find((a) => a.id === c.otherAccountId);
                const faded = c.status === "in" || c.status === "skip";
                const sub = c.status === "xfer" ? (other ? (r.line.amountSen < 0 ? `To ${other.name}` : `From ${other.name}`) : "Between your accounts: pick the other one")
                  : c.status === "new" ? `${r.line.type ? `${r.line.type} · ` : ""}${cat ? cat.name + (choices[r.i] ? "" : r.hint ? " (suggested)" : "") : "Pick a category"}`
                  : c.status === "skip" ? "Won't be saved" : r.hint;
                return (
                  <button className={`fy-row${faded ? " fy-faded" : ""}`} key={r.i} onClick={() => setOpen(r.i)} data-testid="stmt-line" data-status={c.status}>
                    {c.status === "xfer" ? <span className="fy-tile" data-color="lavender" style={{ width: 32, height: 32, borderRadius: 10 }}><ArrowLeftRight size={18} /></span>
                      : c.status === "check" ? <span className="fy-tile" data-color="lemon" style={{ width: 32, height: 32, borderRadius: 10 }}><CircleAlert size={18} /></span>
                      : cat ? <CatTile c={cat} /> : <span className="fy-tile" data-color="slate" style={{ width: 32, height: 32, borderRadius: 10 }}><FileText size={18} /></span>}
                    <div className="main"><div className="t">{r.line.description || r.line.type || "Line"}</div><div className="s">{r.line.card ? `${r.line.card} · ` : ""}{r.line.instalment ? `${r.line.instalment} · ` : ""}{r.line.currency ? `${r.line.currency} ${r.line.foreignAmount} · ` : ""}{sub}</div></div>
                    <div style={{ textAlign: "right", flex: "none" }}><Money sen={Math.abs(r.line.amountSen)} kind={c.status === "xfer" ? "transfer" : r.line.amountSen < 0 ? "spend" : "income"} /><div style={{ marginTop: 3 }}><Pill s={c.status} /></div></div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {st.warnings.length > 0 && <div className="fy-note" style={{ marginTop: 12 }}>{st.warnings.length} line{st.warnings.length > 1 ? "s" : ""} couldn&apos;t be read and {st.warnings.length > 1 ? "are" : "is"} left out: {st.warnings.join("; ")}.</div>}
        <div className="fy-savebar">
          {missing.length > 0 && <div className="fy-hint" style={{ margin: "0 0 6px", textAlign: "center" }}>{missing.length} line{missing.length > 1 ? "s need" : " needs"} a category or account first</div>}
          <button className="fy-btn primary block" disabled={!toSave.length || !!missing.length || saving || !!ctx.alreadyRead} onClick={save}>
            {saving ? <><LoaderCircle size={18} className="fy-spin" /> Saving…</> : toSave.length ? `Save ${toSave.length} new line${toSave.length > 1 ? "s" : ""}` : "Nothing new to save"}
          </button>
        </div>
      </>}
      {pickedLine && <LineSheet r={pickedLine} c={pick(pickedLine)} accounts={accounts} account={account!} categories={categories} bank={st.bank}
        onClose={() => setOpen(null)} onSave={(c) => { setChoices({ ...choices, [pickedLine.i]: c }); setOpen(null); }} />}
    </>
  );
}

function LineSheet({ r, c, accounts, account, categories, bank, onClose, onSave }: { r: Checked; c: Choice; accounts: Account[]; account: Account; categories: Category[]; bank: Bank; onClose: () => void; onSave: (c: Choice) => void }) {
  const [x, setX] = useState<Choice>(c);
  const l = r.line;
  const transfer = x.status === "xfer" || (r.kind === "transfer" && x.status !== "new");
  const wantKinds = l.amountSen < 0 ? ["expense", "saving", "investment"] : ["income"];
  const sugg = r.categoryId ? categories.find((k) => k.id === r.categoryId) : null;
  const cat = categories.find((k) => k.id === x.categoryId);
  const others = accounts.filter((a) => a.id !== account.id && !a.archived);
  const options: { s: Choice["status"]; label: string }[] = [{ s: transfer ? "xfer" : "new", label: transfer ? "Transfer" : "New" }, { s: "in", label: "Already in" }, { s: "skip", label: "Skip" }];
  const when = `${shortDate(l.on)}${l.time ? `, ${l.time.replace(":", ".")}` : ""}${l.card ? ` · ${l.card}` : ""}${l.type ? ` · ${l.type}` : ""} · ${BANK_NAMES[bank]}`;
  return (
    <Sheet title="Statement line" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        {cat && !transfer ? <CatTile c={cat} size={44} /> : <span className="fy-tile" data-color={transfer ? "lavender" : "slate"} style={{ width: 44, height: 44, borderRadius: 13 }}>{transfer ? <ArrowLeftRight size={24} /> : <FileText size={24} />}</span>}
        <div style={{ minWidth: 0 }}><div style={{ fontWeight: 800, overflowWrap: "anywhere" }}>{l.description || l.type}</div><div className="fy-hint" style={{ margin: 0 }}>{when}</div></div>
      </div>
      <div className="fy-amount" style={{ margin: "14px 0 4px" }}><small>Rp</small><span style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-.02em" }}>{formatRupiah(Math.abs(l.amountSen), { prefix: false })}</span></div>
      <div className="fy-hint" style={{ textAlign: "center", margin: "0 0 14px" }}>{l.amountSen < 0 ? (account.type === "card" ? "charged to the card" : "money out") : account.type === "card" ? "paid to the card" : "money in"}{l.currency ? ` · ${l.currency} ${l.foreignAmount} at ${l.rate}` : ""}{l.instalment ? ` · instalment ${l.instalment}` : ""}</div>
      {r.hint && (r.status === "in" || r.status === "check") && <div className="fy-note" style={{ marginBottom: 12 }}>{r.hint}</div>}
      <div className="fy-subhead"><span>This line is</span></div>
      <div className="fy-seg" style={{ marginBottom: 14 }} role="radiogroup" aria-label="This line is">
        {options.map((o) => <button key={o.s} type="button" role="radio" aria-checked={x.status === o.s} className={x.status === o.s ? "on" : ""} onClick={() => setX({ ...x, status: o.s })}>{o.label}</button>)}
      </div>
      {x.status === "new" && <>
        <div className="fy-subhead"><span>Category</span></div>
        {sugg && <div className="fy-chips wrap" style={{ marginBottom: 8 }}><button type="button" className={`fy-chip ${x.categoryId === sugg.id ? "on" : ""}`} onClick={() => setX({ ...x, categoryId: sugg.id })}>{sugg.name} · suggested</button></div>}
        <select className="fy-input" aria-label="Category" value={x.categoryId ?? ""} onChange={(e) => setX({ ...x, categoryId: e.target.value || null })} style={{ marginBottom: 12 }}>
          <option value="">Pick a category…</option><CategoryOptions cats={categories} kinds={wantKinds} />
        </select>
      </>}
      {x.status === "xfer" && <label className="fy-field"><span className="fy-label">{l.amountSen < 0 ? "To account" : "From account"}</span>
        <select className="fy-input" value={x.otherAccountId ?? ""} onChange={(e) => setX({ ...x, otherAccountId: e.target.value || null })}>
          <option value="">Pick an account…</option>{others.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select></label>}
      {(x.status === "new" || x.status === "xfer") && <label className="fy-field"><span className="fy-label">Note</span><input className="fy-input" value={x.note} maxLength={120} placeholder="Optional" onChange={(e) => setX({ ...x, note: e.target.value })} /></label>}
      <button className="fy-btn primary block" disabled={(x.status === "new" && !x.categoryId) || (x.status === "xfer" && !x.otherAccountId)} onClick={() => onSave(x)}>
        {x.status === "new" ? "Keep as new" : x.status === "xfer" ? "Keep as transfer" : x.status === "in" ? "Mark as already in" : "Skip this line"}</button>
      {x.status === "xfer" && <button className="fy-btn block" style={{ marginTop: 8 }} onClick={() => setX({ ...x, status: "new", categoryId: x.categoryId ?? r.categoryId })}>Not a transfer: it&apos;s {l.amountSen < 0 ? "spending" : "income"}</button>}
      {x.status === "new" && <button className="fy-btn block" style={{ marginTop: 8 }} onClick={() => setX({ ...x, status: "xfer" })}>It&apos;s a transfer between my accounts</button>}
    </Sheet>
  );
}
