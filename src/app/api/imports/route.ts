import { withMe } from "@/lib/session";
import { listImports, startImport } from "@/lib/imports";
export const GET = () => withMe((me) => listImports(me.id));
export const POST = (req: Request) => withMe(async (me) => startImport(me.id, await req.json().catch(() => ({}))));
