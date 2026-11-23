import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { debtBills } from "@/lib/debts";
export const GET = (req: NextRequest) => withMe((me) => debtBills(me.id, req.nextUrl.searchParams));
