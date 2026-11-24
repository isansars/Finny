// FINNY-171: every transaction, to check: the table's rows for a filter, with Finny's guesses, the count and totals.
import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { filterFrom, tableTransactions } from "@/lib/txn-table";
export const GET = (req: NextRequest) => withMe((me) => tableTransactions(me.id, filterFrom(req.nextUrl.searchParams)));
