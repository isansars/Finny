import { withMe } from "@/lib/session";
import { importBudget } from "@/lib/budgets";
export const POST = (req: Request) => withMe(async (me) => importBudget(me.id, await req.json().catch(() => ({}))));
