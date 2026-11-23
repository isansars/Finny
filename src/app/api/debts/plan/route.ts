import { withMe } from "@/lib/session";
import { debtPlan, setDebtPlan } from "@/lib/debts";
export const GET = () => withMe((me) => debtPlan(me.id));
export const PUT = (req: Request) => withMe(async (me) => setDebtPlan(me.id, await req.json().catch(() => ({}))));
