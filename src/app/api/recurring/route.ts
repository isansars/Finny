import { withMe } from "@/lib/session";
import { createRecurring, listRecurring } from "@/lib/recurring";
export const GET = () => withMe((me) => listRecurring(me.id));
export const POST = (req: Request) => withMe(async (me) => createRecurring(me.id, await req.json().catch(() => ({}))));
