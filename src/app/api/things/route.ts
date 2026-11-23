import { withMe } from "@/lib/session";
import { createThing } from "@/lib/assets";
export const POST = (req: Request) => withMe(async (me) => createThing(me.id, await req.json().catch(() => ({}))));
