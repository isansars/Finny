import { withMe } from "@/lib/session";
import { setSources } from "@/lib/emergency";
export const PUT = (req: Request) => withMe(async (me) => setSources(me.id, await req.json().catch(() => ({}))));
