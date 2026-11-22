import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { monthDashboard } from "@/lib/data";
import { todayIn } from "@/lib/dates";
export const GET = (req: NextRequest) => withMe((me) => monthDashboard(me.id, req.nextUrl.searchParams.get("month") || todayIn().slice(0, 7), req.nextUrl.searchParams.get("account")));
