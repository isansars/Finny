import { withMe } from "@/lib/session";
import { updateAccount } from "@/lib/data";
type P = { params: Promise<{ id: string }> };
export const PATCH = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => updateAccount(me.id, id, await req.json().catch(() => ({})))); };
