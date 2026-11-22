import { withMe } from "@/lib/session";
import { listEntities } from "@/lib/data";
export const GET = () => withMe((me) => listEntities(me.id));
