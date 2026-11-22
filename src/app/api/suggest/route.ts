import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { suggest } from "@/lib/data";
export const GET = (req: NextRequest) => withMe((me) => suggest(me.id, req.nextUrl.searchParams.get("q") ?? ""));
