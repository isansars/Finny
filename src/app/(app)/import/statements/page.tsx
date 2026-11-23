import { Suspense } from "react";
import { requireMe } from "@/lib/session";
import { StatementReader } from "@/components/StatementReader";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/import/statements"); return <Suspense><StatementReader /></Suspense>; }
