import { notFound } from "next/navigation";
import { requireMe } from "@/lib/session";
import { Review } from "@/components/Review";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) notFound();
  await requireMe(`/review/${month}`);
  return <Review month={month} />;
}
