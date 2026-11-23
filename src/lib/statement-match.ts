// FINNY-71: sort a statement's lines against what Finny already has. Pure; tests/unit/statement-match.test.mts.
//   Already in: an entry on this account with the same effect (amount and direction), within ±2 days, one for one.
//   Transfer:   money between the owner's own accounts (the other bank named in the line, the owner's own name, or a card payment).
//   Check:      the same amount a few days further off, or the other side of a transfer already typed as spend/income.
//   New:        everything else, with a category suggested from history.
import type { Statement, StatementLine } from "./statement-rule.ts";
import { suggestCategory, type Past } from "./suggest-rule.ts";

export type Existing = { id: string; on: string; kind: "spend" | "income" | "transfer"; amountSen: number; accountId: string; toAccountId: string | null; description: string };
export type Acc = { id: string; name: string; type: string; archived?: boolean };
export type Cat = { id: string; kind: string; name: string; active?: boolean };
export type Status = "new" | "in" | "xfer" | "check";
export type Checked = {
  i: number;
  line: StatementLine;
  status: Status;
  kind: "spend" | "income" | "transfer";
  otherAccountId: string | null; // the other side of a transfer
  categoryId: string | null;
  matchId: string | null; // the Finny entry it matches (in) or resembles (check)
  hint: string;
};

const DAY = 86_400_000;
const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);
/** What an entry does to one account's balance: money in is positive. */
export function effectOn(e: Existing, accountId: string): number {
  if (e.kind === "income" && e.accountId === accountId) return e.amountSen;
  if (e.kind === "spend" && e.accountId === accountId) return -e.amountSen;
  if (e.kind === "transfer" && e.accountId === accountId) return -e.amountSen;
  if (e.kind === "transfer" && e.toAccountId === accountId) return e.amountSen;
  return 0;
}

/** Krom pays a little cashback after most QRIS payments: one income line per day instead of dozens. */
export function foldCashback(lines: StatementLine[]): StatementLine[] {
  const out: StatementLine[] = [];
  const byDay = new Map<string, StatementLine>();
  const count = new Map<string, number>();
  for (const l of lines) {
    if (!l.cashback) { out.push(l); continue; }
    const day = byDay.get(l.on);
    if (day) { day.amountSen += l.amountSen; count.set(l.on, (count.get(l.on) ?? 1) + 1); day.description = `Cashback × ${count.get(l.on)}`; continue; }
    const first = { ...l, description: "Cashback", type: l.type, ref: undefined };
    byDay.set(l.on, first); count.set(l.on, 1); out.push(first);
  }
  return out;
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
const STOP = new Set(["bank", "tabungan", "rekening", "card", "kartu", "kredit", "credit", "utama", "savings", "account", "the"]);
/** The words that name an account in a statement line ("BCA Tahapan" → bca, tahapan; "Kartu Kredit BRI" → bri). */
export function accountTokens(a: Acc): string[] { return words(a.name).filter((w) => w.length >= 3 && !STOP.has(w)); }
const isCard = (a?: Acc) => a?.type === "card";

export type MatchInput = {
  statement: Statement;
  lines: StatementLine[]; // after foldCashback
  accountId: string;
  accounts: Acc[];
  categories: Cat[];
  existing: Existing[]; // every entry from a week before the period to a week after, all accounts
  history: Past[];
  ownerName?: string | null;
};

export function matchStatement(inp: MatchInput): Checked[] {
  const { lines, accountId, accounts, categories, existing, history } = inp;
  const me = accounts.find((a) => a.id === accountId);
  const others = accounts.filter((a) => a.id !== accountId && !a.archived);
  const catKind = new Map(categories.map((c) => [c.id, c.kind]));
  const used = new Set<string>();
  const ownerWords = words(inp.ownerName ?? "").filter((w) => w.length >= 3).slice(0, 2);
  const onAccount = existing.filter((e) => effectOn(e, accountId) !== 0);

  // Pass 1: exact matches (±2 days), nearest day first, so two equal payments on two days each find their own entry.
  const res: Checked[] = lines.map((line, i) => ({ i, line, status: "new", kind: line.amountSen < 0 ? "spend" : "income", otherAccountId: null, categoryId: null, matchId: null, hint: "" }));
  const pairs: { r: Checked; e: Existing; d: number }[] = [];
  for (const r of res) for (const e of onAccount) {
    if (effectOn(e, accountId) !== r.line.amountSen) continue;
    const d = Math.abs(days(r.line.on, e.on));
    if (d <= 2) pairs.push({ r, e, d });
  }
  pairs.sort((a, b) => a.d - b.d || a.r.i - b.r.i);
  for (const p of pairs) {
    if (p.r.matchId || used.has(p.e.id)) continue;
    used.add(p.e.id); p.r.status = "in"; p.r.matchId = p.e.id; p.r.kind = p.e.kind;
    p.r.otherAccountId = p.e.kind === "transfer" ? (p.e.accountId === accountId ? p.e.toAccountId : p.e.accountId) : null;
    p.r.hint = p.d === 0 ? `Matches your entry on ${short(p.e.on)}` : `Matches your entry on ${short(p.e.on)} (${p.d} day${p.d > 1 ? "s" : ""} apart)`;
  }

  for (const r of res) {
    if (r.status === "in") continue;
    const l = r.line;
    // Pass 2: the same amount a little further off.
    const near = onAccount.find((e) => !used.has(e.id) && effectOn(e, accountId) === l.amountSen && Math.abs(days(l.on, e.on)) <= 7);
    if (near) { r.status = "check"; r.matchId = near.id; r.hint = `Same amount on ${short(near.on)}: is it that one?`; continue; }
    // Pass 3: a transfer between the owner's own accounts.
    const text = words(`${l.description} ${l.ref ?? ""} ${l.type ?? ""}`);
    const named = others.find((a) => accountTokens(a).some((t) => text.includes(t)));
    const mine = ownerWords.length === 2 && ownerWords.every((w) => text.includes(w));
    const cardPayment = isCard(me) && l.amountSen > 0 && /payment|pembayaran|bayar/i.test(`${l.description} ${l.type ?? ""}`);
    const toCard = !isCard(me) && l.amountSen < 0 && /kartu kredit|credit card|\bkk\b|\bcc\b/i.test(`${l.description} ${l.ref ?? ""}`);
    if (named || mine || cardPayment || toCard) {
      // The other side: the named account, else an account with the opposite amount within 3 days, else (card payments) a bank.
      const opposite = existing.find((e) => e.accountId !== accountId && e.kind !== "transfer" && Math.abs(days(l.on, e.on)) <= 3 && effectOn(e, e.accountId) === -l.amountSen);
      const card = accounts.find((a) => isCard(a) && a.id !== accountId && toCard);
      const other = named ?? card ?? (opposite ? accounts.find((a) => a.id === opposite.accountId) : undefined) ?? (cardPayment ? others.find((a) => a.type === "bank") : undefined);
      r.kind = "transfer"; r.otherAccountId = other?.id ?? null;
      if (opposite && other && opposite.accountId === other.id) {
        r.status = "check"; r.matchId = opposite.id;
        r.hint = `${other.name} already has this as ${opposite.kind === "spend" ? "spending" : "income"} on ${short(opposite.on)}`;
        continue;
      }
      r.status = "xfer";
      r.hint = other ? (l.amountSen < 0 ? `To ${other.name}` : `From ${other.name}`) : "Between your accounts: pick the other one";
      continue;
    }
    // Pass 4: new, with a suggested category of the right kind.
    const want = l.amountSen < 0 ? "spend" : "income";
    const id = suggestCategory(l.description, history);
    const fits = id && (want === "income" ? catKind.get(id) === "income" : catKind.has(id) && catKind.get(id) !== "income");
    r.categoryId = fits ? id : fallback(categories, want);
    r.hint = r.categoryId && fits ? "Suggested from your history" : "";
  }
  return res;
}

function fallback(cats: Cat[], want: "spend" | "income"): string | null {
  const ok = cats.filter((c) => c.active !== false && (want === "income" ? c.kind === "income" : c.kind !== "income"));
  return ok.find((c) => /^(lainnya|lain-lain|other|others|misc)/i.test(c.name))?.id ?? null;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;

/** The effect on the statement's account of saving these lines (New and Transfer only). */
export function savedEffect(rows: Checked[]): number {
  return rows.filter((r) => r.status === "new" || r.status === "xfer").reduce((n, r) => n + r.line.amountSen, 0);
}

/**
 * Compares the statement's figure with Finny's after saving: a savings account's ending balance, or a card's bill
 * (what's owed, so the card's balance with the sign turned). `finnyEndSen` is Finny's balance on the last day before saving.
 */
export function balanceCheck(st: Statement, accType: string, finnyEndSen: number, rows: Checked[]) {
  if (st.closingSen === undefined) return null;
  const after = finnyEndSen + savedEffect(rows);
  const finny = accType === "card" || accType === "loan" ? -after : after;
  return { statementSen: st.closingSen, finnySen: finny, gapSen: st.closingSen - finny };
}
