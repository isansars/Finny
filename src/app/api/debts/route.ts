import { withMe } from "@/lib/session";
import { debtsOverview } from "@/lib/debts";
export const GET = () => withMe((me) => debtsOverview(me.id));
