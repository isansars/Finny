import { withMe } from "@/lib/session";
import { assetsOverview } from "@/lib/assets";
export const GET = () => withMe((me) => assetsOverview(me.id));
