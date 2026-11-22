import { withMe } from "@/lib/session";
import { createCategory, listCategories } from "@/lib/data";
export const GET = () => withMe((me) => listCategories(me.id));
export const POST = (req: Request) => withMe(async (me) => createCategory(me.id, await req.json().catch(() => ({}))));
