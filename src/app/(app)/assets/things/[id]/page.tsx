import { requireMe } from "@/lib/session";
import { ThingDetail } from "@/components/Assets";
export const dynamic = "force-dynamic";
export const metadata = { title: "Property and vehicles" };
type P = { params: Promise<{ id: string }> };
export default async function Page({ params }: P) { const { id } = await params; await requireMe(`/assets/things/${id}`); return <ThingDetail id={id} />; }
