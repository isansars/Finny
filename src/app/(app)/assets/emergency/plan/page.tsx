import { requireMe } from "@/lib/session";
import { EmergencyPlan } from "@/components/Emergency";
export const dynamic = "force-dynamic";
export const metadata = { title: "Emergency fund plan" };
export default async function Page() { await requireMe("/assets/emergency/plan"); return <div className="fy-narrow"><EmergencyPlan /></div>; }
