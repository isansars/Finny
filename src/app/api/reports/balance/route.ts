import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { balanceReport } from "@/lib/reports";
export const GET = (req: NextRequest) => withMe((me) => balanceReport(me.id, req.nextUrl.searchParams));
