import { requireMe } from "@/lib/session";
import { StatementCheck } from "@/components/Balances";
export const dynamic = "force-dynamic";
export const metadata = { title: "Check with statements" };
type P = { params: Promise<{ id: string }> };
export default async function Page({ params }: P) { const { id } = await params; await requireMe(`/accounts/${id}/check`); return <div className="fy-narrow"><StatementCheck id={id} /></div>; }
