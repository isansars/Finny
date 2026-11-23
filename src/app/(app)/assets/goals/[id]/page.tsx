import { requireMe } from "@/lib/session";
import { GoalDetail } from "@/components/Goals";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireMe(`/assets/goals/${id}`);
  return <div className="fy-narrow"><GoalDetail id={id} /></div>;
}
