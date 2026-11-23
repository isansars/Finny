import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { existingKeys } from "@/lib/imports";
export const GET = (req: NextRequest) => withMe((me) => existingKeys(me.id, req.nextUrl.searchParams.get("from") ?? "", req.nextUrl.searchParams.get("to") ?? ""));
