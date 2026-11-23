import { withMe } from "@/lib/session";
import { reviewsOverview } from "@/lib/reviews";
export const GET = () => withMe((me) => reviewsOverview(me.id));
