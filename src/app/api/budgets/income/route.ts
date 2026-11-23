import { withMe } from "@/lib/session";
import { setIncomePlan } from "@/lib/budgets";
export const PUT = (req: Request) => withMe(async (me) => setIncomePlan(me.id, await req.json().catch(() => ({}))));
