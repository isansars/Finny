import { withMe } from "@/lib/session";
import { saveStatement } from "@/lib/statements";
export const POST = (req: Request) => withMe(async (me) => saveStatement(me.id, await req.json().catch(() => ({}))));
