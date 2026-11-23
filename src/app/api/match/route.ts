import { withMe } from "@/lib/session";
import { matchData } from "@/lib/match";
export const GET = (req: Request) => withMe((me) => matchData(me.id, new URL(req.url).searchParams.get("month")));
