import { notFound } from "next/navigation";
import { requireMe } from "@/lib/session";
import { MatchCheck } from "@/components/Match";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  await requireMe(`/review/${month}/match`);
  return <div className="fy-narrow"><MatchCheck month={month} /></div>;
}
