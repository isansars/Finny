import { requireMe } from "@/lib/session";
import { Things } from "@/components/Assets";
export const dynamic = "force-dynamic";
export const metadata = { title: "Property and vehicles" };
export default async function Page() { await requireMe("/assets/things"); return <div className="fy-narrow"><Things /></div>; }
