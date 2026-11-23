import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { accountReport } from "@/lib/reports";
type P = { params: Promise<{ id: string }> };
export const GET = async (req: NextRequest, { params }: P) => { const { id } = await params; return withMe((me) => accountReport(me.id, id, req.nextUrl.searchParams)); };
