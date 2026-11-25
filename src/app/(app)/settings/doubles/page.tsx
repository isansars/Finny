import { requireMe } from "@/lib/session";
import { Doubles } from "@/components/Balances";
export const dynamic = "force-dynamic";
export const metadata = { title: "Possible doubles" };
export default async function Page() { await requireMe("/settings/doubles"); return <div className="fy-narrow"><Doubles /></div>; }
