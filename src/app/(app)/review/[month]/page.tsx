import { notFound } from "next/navigation";
import { requireMe } from "@/lib/session";
import { Review } from "@/components/Review";
export const dynamic = "force-dynamic";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export async function generateMetadata({ params }: { params: Promise<{ month: string }> }) { const [y, m] = (await params).month.split("-").map(Number); return { title: MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y} review` : "Month-end review" }; }
export default async function Page({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  await requireMe(`/review/${month}`);
  return <div className="fy-narrow"><Review month={month} /></div>;
}
