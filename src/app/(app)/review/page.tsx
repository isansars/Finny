import { requireMe } from "@/lib/session";
import { Reviews } from "@/components/Review";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/review"); return <div className="fy-narrow"><Reviews /></div>; }
