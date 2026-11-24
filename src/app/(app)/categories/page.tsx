import { requireMe } from "@/lib/session";
import { Categories } from "@/components/Categories";
export const dynamic = "force-dynamic";
export const metadata = { title: "Categories" };
export default async function Page() { await requireMe("/categories"); return <Categories />; }
