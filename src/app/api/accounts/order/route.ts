import { withMe } from "@/lib/session";
import { reorderAccounts } from "@/lib/data";
export const PUT = (req: Request) => withMe(async (me) => reorderAccounts(me.id, (await req.json().catch(() => ({}))).ids));
