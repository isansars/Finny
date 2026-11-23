import { withMe } from "@/lib/session";
import { emergencyOverview, setEmergency } from "@/lib/emergency";
export const GET = () => withMe((me) => emergencyOverview(me.id));
export const PUT = (req: Request) => withMe(async (me) => setEmergency(me.id, await req.json().catch(() => ({}))));
