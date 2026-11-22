import { withMe } from "@/lib/session";
import { deleteCategory, updateCategory } from "@/lib/data";
type P = { params: Promise<{ id: string }> };
export const PATCH = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => updateCategory(me.id, id, await req.json().catch(() => ({})))); };
export const DELETE = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => deleteCategory(me.id, id)); };
