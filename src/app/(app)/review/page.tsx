import { requireMe } from "@/lib/session";
import { Reviews } from "@/components/Review";
export const dynamic = "force-dynamic";
export const metadata = { title: "Month-end reviews" };
export default async function Page() { await requireMe("/review"); return <div className="fy-narrow"><Reviews /></div>; }
