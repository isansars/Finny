import { withMe } from "@/lib/session";
import { createCategory, listCategoriesWithUse } from "@/lib/data";
export const GET = () => withMe((me) => listCategoriesWithUse(me.id));
export const POST = (req: Request) => withMe(async (me) => createCategory(me.id, await req.json().catch(() => ({}))));
