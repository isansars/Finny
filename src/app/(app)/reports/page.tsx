import { Suspense } from "react";
import { requireMe } from "@/lib/session";
import { Reports } from "@/components/Reports";
export const dynamic = "force-dynamic";
export default async function Page() { await requireMe("/reports"); return <Suspense><Reports /></Suspense>; }
