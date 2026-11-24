// FINNY-186: bring back the last delete. POST {undoId} restores it (all or nothing); GET says what can still be brought back.
import { withMe } from "@/lib/session";
import { lastUndo, nowFor, undoDelete } from "@/lib/undo";
export const dynamic = "force-dynamic";
export const GET = (req: Request) => withMe(async (me) => ({ last: await lastUndo(me.id, nowFor(req)) }));
export const POST = (req: Request) => withMe(async (me) => undoDelete(me.id, await req.json().catch(() => ({})), nowFor(req)));
