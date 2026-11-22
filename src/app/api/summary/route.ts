import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { monthTotals } from "@/lib/data";
import { todayIn } from "@/lib/dates";
export const GET = (req: NextRequest) => withMe((me) => monthTotals(me.id, req.nextUrl.searchParams.get("month") || todayIn().slice(0, 7)));
