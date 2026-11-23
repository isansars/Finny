import { withMe } from "@/lib/session";
import { getReview, markSteps } from "@/lib/reviews";
type P = { params: Promise<{ month: string }> };
export const GET = async (_req: Request, { params }: P) => { const { month } = await params; return withMe((me) => getReview(me.id, month)); };
export const PATCH = async (req: Request, { params }: P) => { const { month } = await params; return withMe(async (me) => markSteps(me.id, month, await req.json().catch(() => ({})))); };
