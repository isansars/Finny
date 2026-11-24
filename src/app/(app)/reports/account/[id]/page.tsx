import { Suspense } from "react";
import { requireMe } from "@/lib/session";
import { AccountReport } from "@/components/Reports";
export const dynamic = "force-dynamic";
export const metadata = { title: "Account report" };
type P = { params: Promise<{ id: string }> };
export default async function Page({ params }: P) { const { id } = await params; await requireMe(`/reports/account/${id}`); return <Suspense><div className="fy-narrow"><AccountReport id={id} /></div></Suspense>; }
