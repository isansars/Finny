import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { paceReport } from "@/lib/reports";
export const GET = (req: NextRequest) => withMe((me) => paceReport(me.id, req.nextUrl.searchParams));
