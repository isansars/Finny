import type { NextRequest } from "next/server";
import { withMe } from "@/lib/session";
import { createTransaction, listTransactions } from "@/lib/data";
export const GET = (req: NextRequest) => withMe((me) => {
  const q = req.nextUrl.searchParams;
  return listTransactions(me.id, { month: q.get("month"), accountId: q.get("account"), categoryId: q.get("category"), q: q.get("q"), limit: Number(q.get("limit")) || undefined, offset: Number(q.get("offset")) || undefined });
});
export const POST = (req: Request) => withMe(async (me) => createTransaction(me.id, await req.json().catch(() => ({}))));
