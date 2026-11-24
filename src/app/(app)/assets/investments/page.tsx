import { requireMe } from "@/lib/session";
import { Investments } from "@/components/Assets";
export const dynamic = "force-dynamic";
export const metadata = { title: "Investments" };
export default async function Page() { await requireMe("/assets/investments"); return <div className="fy-narrow"><Investments /></div>; }
