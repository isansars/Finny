import { requireMe } from "@/lib/session";
import { DebtDetail } from "@/components/Debts";
export const dynamic = "force-dynamic";
export const metadata = { title: "Debt" };
type P = { params: Promise<{ id: string }> };
export default async function Page({ params }: P) { const { id } = await params; await requireMe(`/debts/${id}`); return <div className="fy-narrow"><DebtDetail id={id} /></div>; }
