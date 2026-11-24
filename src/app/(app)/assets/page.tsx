import { requireMe } from "@/lib/session";
import { Assets } from "@/components/Assets";
export const dynamic = "force-dynamic";
export const metadata = { title: "Assets" };
export default async function Page() { await requireMe("/assets"); return <div className="fy-narrow"><Assets /></div>; }
