import { withMe } from "@/lib/session";
import { addStarterCategories } from "@/lib/data";
export const POST = () => withMe((me) => addStarterCategories(me.id));
