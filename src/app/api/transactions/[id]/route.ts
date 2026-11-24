import { withMe } from "@/lib/session";
import { checkSeen, deleteTransaction, updateTransaction } from "@/lib/data";
import { deleteOneToTrash, nowFor } from "@/lib/undo";
type P = { params: Promise<{ id: string }> };
export const PATCH = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => updateTransaction(me.id, id, await req.json().catch(() => ({})))); };
// FINNY-186: the Transactions page sends ?undo=1 and gets an undo id back; Home's edit dialog deletes for good, as before.
// FINNY-193: a delete made offline sends {expect}: refused (409) if the row changed since, 404 if it's already gone.
export const DELETE = async (req: Request, { params }: P) => {
  const { id } = await params; const undo = new URL(req.url).searchParams.get("undo") === "1";
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  return withMe(async (me) => { await checkSeen(me.id, id, body); return undo ? deleteOneToTrash(me.id, id, nowFor(req)) : deleteTransaction(me.id, id); });
};
