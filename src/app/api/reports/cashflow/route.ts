import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { cashflowReport } from "@/lib/reports";
export const GET = (req: NextRequest) => withMe((me) => cashflowReport(me.id, req.nextUrl.searchParams));
