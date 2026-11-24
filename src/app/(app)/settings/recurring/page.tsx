import { requireMe } from "@/lib/session";
import { RecurringPage } from "@/components/Recurring";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/settings/recurring"); return <div className="fy-narrow"><RecurringPage /></div>; }
