// FINNY-206: which months have transactions, for the month picker.
import { withMe } from "@/lib/session";
import { transactionMonths } from "@/lib/data";
export const dynamic = "force-dynamic";
export const GET = () => withMe((me) => transactionMonths(me.id));
