import { requireMe } from "@/lib/session";
import { Debts } from "@/components/Debts";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/debts"); return <Debts />; }
