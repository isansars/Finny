import { requireMe } from "@/lib/session";
import { Investments } from "@/components/Assets";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/assets/investments"); return <Investments />; }
