import { Suspense } from "react";
import { requireMe } from "@/lib/session";
import { Transactions } from "@/components/Transactions";
export const dynamic = "force-dynamic";
export const metadata = { title: "Transactions" };
export default async function Page() { await requireMe("/transactions"); return <Suspense><Transactions /></Suspense>; }
