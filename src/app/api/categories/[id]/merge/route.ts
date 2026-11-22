import { withMe } from "@/lib/session";
import { mergeCategory } from "@/lib/data";
type P = { params: Promise<{ id: string }> };
export const POST = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => mergeCategory(me.id, id, String((await req.json().catch(() => ({}))).into ?? ""))); };
