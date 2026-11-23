import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { statementContext } from "@/lib/statements";
export const GET = (req: NextRequest) => withMe((me) => statementContext(me.id, me.name, req.nextUrl.searchParams));
