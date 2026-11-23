import { withMe } from "@/lib/session";
import { saveMatch } from "@/lib/match";
type P = { params: Promise<{ month: string }> };
export const POST = async (req: Request, { params }: P) => { const { month } = await params; return withMe(async (me) => saveMatch(me.id, month, await req.json().catch(() => ({})))); };
