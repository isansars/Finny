// What a transaction must look like (FINNY-9). Pure; tests/unit/txn-rule.test.mts. The database enforces the same shape.
export type TxnInput = { kind?: string; amountSen?: number | null; on?: string; accountId?: string; toAccountId?: string | null; categoryId?: string | null };
type Acc = { id: string; archived: boolean };
type Cat = { id: string; kind: string; active: boolean };

export const CATEGORY_KINDS_FOR: Record<string, string[]> = { spend: ["expense", "saving", "investment"], income: ["income"] };
const isDate = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));

/** The first problem with a transaction, or null. `editing` lets an existing transaction keep an archived account. */
export function txnProblem(t: TxnInput, accounts: Acc[], cats: Cat[], editing = false): string | null {
  if (!["spend", "income", "transfer"].includes(String(t.kind))) return "Choose Spend, Income or Transfer.";
  if (!Number.isSafeInteger(t.amountSen) || (t.amountSen as number) <= 0) return "Enter an amount above zero.";
  if (!isDate(t.on)) return "Pick a date.";
  const acc = accounts.find((a) => a.id === t.accountId);
  if (!acc) return "Pick an account.";
  if (acc.archived && !editing) return "That account is closed.";
  if (t.kind === "transfer") {
    const to = accounts.find((a) => a.id === t.toAccountId);
    if (!to) return "Pick the account the money goes to.";
    if (to.id === acc.id) return "A transfer needs two different accounts.";
    if (to.archived && !editing) return "That account is closed.";
    if (t.categoryId) return "A transfer has no category.";
    return null;
  }
  if (t.toAccountId) return "Only a transfer goes to a second account.";
  const cat = cats.find((c) => c.id === t.categoryId);
  if (!cat) return "Pick a category.";
  if (!CATEGORY_KINDS_FOR[t.kind as string].includes(cat.kind)) return t.kind === "income" ? "Pick an income category." : "Pick a spending, saving or investment category.";
  if (!cat.active && !editing) return "That category is switched off.";
  return null;
}
