import { withMe } from "@/lib/session";
import { deleteGoal, getGoal, updateGoal } from "@/lib/goals";
type P = { params: Promise<{ id: string }> };
export const GET = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => getGoal(me.id, id)); };
export const PATCH = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => updateGoal(me.id, id, await req.json().catch(() => ({})))); };
export const DELETE = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => deleteGoal(me.id, id)); };
