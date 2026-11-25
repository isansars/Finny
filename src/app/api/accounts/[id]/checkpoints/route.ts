// FINNY-212: each statement date with the bank's balance and Finny's, and where they first parted.
import { withMe } from "@/lib/session";
import { accountCheckpoints } from "@/lib/checkpoints";
type P = { params: Promise<{ id: string }> };
export const GET = async (_req: Request, { params }: P) => { const { id } = await params; return withMe((me) => accountCheckpoints(me.id, id)); };
