import { requireMe } from "@/lib/session";
import { Categories } from "@/components/Categories";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/categories"); return <Categories />; }
