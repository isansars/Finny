import { withMe } from "@/lib/session";
import { saveValues } from "@/lib/assets";
export const POST = (req: Request) => withMe(async (me) => saveValues(me.id, await req.json().catch(() => ({}))));
