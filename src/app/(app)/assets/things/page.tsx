import { requireMe } from "@/lib/session";
import { Things } from "@/components/Assets";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/assets/things"); return <Things />; }
