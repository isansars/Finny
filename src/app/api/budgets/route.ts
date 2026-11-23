import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { getBudget, setBudget } from "@/lib/budgets";
export const GET = (req: NextRequest) => withMe((me) => getBudget(me.id, req.nextUrl.searchParams.get("month")));
export const PUT = (req: Request) => withMe(async (me) => setBudget(me.id, await req.json().catch(() => ({}))));
