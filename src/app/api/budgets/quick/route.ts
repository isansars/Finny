import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { budgetQuick } from "@/lib/budgets";
export const GET = (req: NextRequest) => withMe((me) => budgetQuick(me.id, req.nextUrl.searchParams));
