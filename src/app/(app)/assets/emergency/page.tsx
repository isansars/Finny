import { requireMe } from "@/lib/session";
import { Emergency } from "@/components/Emergency";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/assets/emergency"); return <div className="fy-narrow"><Emergency /></div>; }
