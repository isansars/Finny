import { withMe } from "@/lib/session";
import { createAccount, listAccounts } from "@/lib/data";
export const GET = () => withMe((me) => listAccounts(me.id));
export const POST = (req: Request) => withMe(async (me) => createAccount(me.id, await req.json().catch(() => ({}))));
