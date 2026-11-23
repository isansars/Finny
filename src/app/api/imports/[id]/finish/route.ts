import { withMe } from "@/lib/session";
import { finishImport } from "@/lib/imports";
type P = { params: Promise<{ id: string }> };
export const POST = async (req: Request, { params }: P) => { const { id } = await params; return withMe(async (me) => finishImport(me.id, id, await req.json().catch(() => ({})))); };
