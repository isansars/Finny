import { withMe } from "@/lib/session";
import { createGoal, goalsOverview } from "@/lib/goals";
export const GET = () => withMe((me) => goalsOverview(me.id));
export const POST = (req: Request) => withMe(async (me) => createGoal(me.id, await req.json().catch(() => ({}))));
