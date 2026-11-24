import { requireMe } from "@/lib/session";
import { PhonePage } from "@/components/Phone";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/settings/phone"); return <div className="fy-narrow"><PhonePage /></div>; }
