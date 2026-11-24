import { requireMe } from "@/lib/session";
import { Home } from "@/components/Home";
export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };
export default async function Page() { await requireMe("/"); return <Home />; }
