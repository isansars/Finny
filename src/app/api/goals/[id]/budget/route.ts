import { withMe } from "@/lib/session";
import { goalToBudget } from "@/lib/goals";
type P = { params: Promise<{ id: string }> };
export const POST = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => goalToBudget(me.id, id)); };
