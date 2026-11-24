import { requireMe } from "@/lib/session";
import { RecurringPage } from "@/components/Recurring";
export const dynamic = "force-dynamic";
export const metadata = { title: "Recurring" };
export default async function Page() { await requireMe("/settings/recurring"); return <div className="fy-narrow"><RecurringPage /></div>; }
