import { requireMe } from "@/lib/session";
import { Accounts } from "@/components/Accounts";
export const dynamic = "force-dynamic";
export const metadata = { title: "Accounts" };
export default async function Page() { await requireMe("/accounts"); return <Accounts />; }
