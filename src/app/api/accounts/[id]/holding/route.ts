import { withMe } from "@/lib/session";
import { setHolding } from "@/lib/assets";
type P = { params: Promise<{ id: string }> };
export const PUT = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => setHolding(me.id, id, await req.json().catch(() => ({})))); };
