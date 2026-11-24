// FINNY-171: several transactions at once: delete, change category, or mark as looking fine. All or nothing.
import { withMe } from "@/lib/session";
import { bulkTransactions } from "@/lib/txn-table";
export const POST = (req: Request) => withMe(async (me) => bulkTransactions(me.id, await req.json().catch(() => ({}))));
