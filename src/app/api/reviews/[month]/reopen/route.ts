import { withMe } from "@/lib/session";
import { reopenMonth } from "@/lib/reviews";
type P = { params: Promise<{ month: string }> };
export const POST = async (_req: Request, { params }: P) => { const { month } = await params; return withMe((me) => reopenMonth(me.id, month)); };
