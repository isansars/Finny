import { Suspense } from "react";
import { requireMe } from "@/lib/session";
import { Reports } from "@/components/Reports";
export const dynamic = "force-dynamic";
const VIEWS: Record<string, string> = { balance: "Balance sheet", pace: "Spending pace" };
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ view?: string }> }) { return { title: VIEWS[(await searchParams).view ?? ""] ?? "Cashflow" }; }
export default async function Page() { await requireMe("/reports"); return <Suspense><Reports /></Suspense>; }
