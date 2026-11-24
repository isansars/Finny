import { requireMe } from "@/lib/session";
import { Debts } from "@/components/Debts";
export const dynamic = "force-dynamic";
export const metadata = { title: "Debts" };
export default async function Page() { await requireMe("/debts"); return <div className="fy-narrow"><Debts /></div>; }
