import { withMe } from "@/lib/session";
import { deleteThing, updateThing } from "@/lib/assets";
type P = { params: Promise<{ id: string }> };
export const PATCH = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => updateThing(me.id, id, await req.json().catch(() => ({})))); };
export const DELETE = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => deleteThing(me.id, id)); };
