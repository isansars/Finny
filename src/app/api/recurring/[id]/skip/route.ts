import { withMe } from "@/lib/session";
import { skipRecurring } from "@/lib/recurring";
type P = { params: Promise<{ id: string }> };
export const POST = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => skipRecurring(me.id, id, await req.json().catch(() => ({})))); };
