import { withMe } from "@/lib/session";
import { addToBudget } from "@/lib/emergency";
export const POST = () => withMe((me) => addToBudget(me.id));
