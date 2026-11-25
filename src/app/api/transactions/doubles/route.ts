// FINNY-212: lines that look recorded twice, each with its reason. Removing them goes through POST transactions/bulk (undo for a day).
import { withMe } from "@/lib/session";
import { listDoubles } from "@/lib/checkpoints";
export const GET = () => withMe((me) => listDoubles(me.id));
