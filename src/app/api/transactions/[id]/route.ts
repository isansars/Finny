import { withMe } from "@/lib/session";
import { deleteTransaction, updateTransaction } from "@/lib/data";
type P = { params: Promise<{ id: string }> };
export const PATCH = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => updateTransaction(me.id, id, await req.json().catch(() => ({})))); };
export const DELETE = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => deleteTransaction(me.id, id)); };
