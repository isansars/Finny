import { Suspense } from "react";
import { requireMe } from "@/lib/session";
import { StatementReader } from "@/components/StatementReader";
export const dynamic = "force-dynamic";
export const metadata = { title: "Bank statements" };
export default async function Page() { await requireMe("/import/statements"); return <div className="fy-narrow"><Suspense><StatementReader /></Suspense></div>; }
