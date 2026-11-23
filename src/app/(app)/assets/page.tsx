import { requireMe } from "@/lib/session";
import { Assets } from "@/components/Assets";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/assets"); return <Assets />; }
