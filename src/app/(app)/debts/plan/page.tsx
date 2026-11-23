import { requireMe } from "@/lib/session";
import { PayoffPlan } from "@/components/Debts";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/debts/plan"); return <div className="fy-narrow"><PayoffPlan /></div>; }
