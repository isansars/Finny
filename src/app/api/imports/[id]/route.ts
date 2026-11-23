import { withMe } from "@/lib/session";
import { undoImport } from "@/lib/imports";
type P = { params: Promise<{ id: string }> };
export const DELETE = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => undoImport(me.id, id)); };
