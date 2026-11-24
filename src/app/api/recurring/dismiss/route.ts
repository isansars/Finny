import { withMe } from "@/lib/session";
import { dismissSuggestion } from "@/lib/recurring";
export const POST = (req: Request) => withMe(async (me) => dismissSuggestion(me.id, await req.json().catch(() => ({}))));
