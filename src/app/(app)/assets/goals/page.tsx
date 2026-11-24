import { requireMe } from "@/lib/session";
import { Goals } from "@/components/Goals";
export const dynamic = "force-dynamic";
export const metadata = { title: "Goals" };
export default async function Page() { await requireMe("/assets/goals"); return <div className="fy-narrow"><Goals /></div>; }
