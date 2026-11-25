// FINNY-212: a statement saved before v0.23.0, uploaded again: add its dates only.
import { withMe } from "@/lib/session";
import { addStatementDates } from "@/lib/statements";
export const POST = (req: Request) => withMe(async (me) => addStatementDates(me.id, await req.json().catch(() => ({}))));
