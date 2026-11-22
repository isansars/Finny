// Delete everything (FINNY-24): all of the owner's money data, after they type DELETE. They stay signed in.
import { withMe, HttpError } from "@/lib/session";
import { deleteEverything } from "@/lib/data";
export const DELETE = (req: Request) => withMe(async (me) => {
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== "DELETE") throw new HttpError(400, 'Type DELETE to confirm.');
  return deleteEverything(me.id);
});
