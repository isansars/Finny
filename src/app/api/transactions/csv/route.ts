// FINNY-171: the table's filtered rows as a spreadsheet.
import { NextResponse, type NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { filterFrom, tableCsv } from "@/lib/txn-table";
import { todayIn } from "@/lib/dates";
export const GET = (req: NextRequest) => withMe(async (me) => new NextResponse(await tableCsv(me.id, filterFrom(req.nextUrl.searchParams)),
  { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="finny-transactions-${todayIn()}.csv"`, "cache-control": "no-store" } }));
