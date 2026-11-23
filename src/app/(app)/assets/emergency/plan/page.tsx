import { requireMe } from "@/lib/session";
import { EmergencyPlan } from "@/components/Emergency";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/assets/emergency/plan"); return <EmergencyPlan />; }
