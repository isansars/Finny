import { withMe } from "@/lib/session";
import { setTerms } from "@/lib/debts";
type P = { params: Promise<{ id: string }> };
export const PUT = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => setTerms(me.id, id, await req.json().catch(() => ({})))); };
