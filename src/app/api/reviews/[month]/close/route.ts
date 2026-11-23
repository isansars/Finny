import { withMe } from "@/lib/session";
import { closeMonth } from "@/lib/reviews";
type P = { params: Promise<{ month: string }> };
export const POST = async (req: Request, { params }: P) => { const { month } = await params; return withMe(async (me) => closeMonth(me.id, month, await req.json().catch(() => ({})))); };
