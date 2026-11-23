import { requireMe } from "@/lib/session";
import { Goals } from "@/components/Goals";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/assets/goals"); return <Goals />; }
