import { withMe } from "@/lib/session";
import { deleteRecurring, updateRecurring } from "@/lib/recurring";
type P = { params: Promise<{ id: string }> };
export const PATCH = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => updateRecurring(me.id, id, await req.json().catch(() => ({})))); };
export const DELETE = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => deleteRecurring(me.id, id)); };
