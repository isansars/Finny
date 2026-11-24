import { requireMe } from "@/lib/session";
import { Emergency } from "@/components/Emergency";
export const dynamic = "force-dynamic";
export const metadata = { title: "Emergency fund" };
export default async function Page() { await requireMe("/assets/emergency"); return <div className="fy-narrow"><Emergency /></div>; }
