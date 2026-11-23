import { withMe } from "@/lib/session";
import { planNextMonth } from "@/lib/reviews";
type P = { params: Promise<{ month: string }> };
export const POST = async (_req: Request, { params }: P) => { const { month } = await params; return withMe((me) => planNextMonth(me.id, month)); };
