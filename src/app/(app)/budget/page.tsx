import { requireMe } from "@/lib/session";
import { Budget } from "@/components/Budget";
export const dynamic = "force-dynamic";
export const metadata = { title: "Budget" };
export default async function Page() { await requireMe("/budget"); return <Budget />; }
