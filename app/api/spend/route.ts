// GET /api/spend — every spend class in one window view (lib/spendView.ts).
//
// Gated with guardAccessOnly, as app/api/imaging/budget/route.ts: a read spends
// nothing, and counting it against the origin rate limiter would let polling
// starve real generation requests (lib/apiAuth.ts).

import { guardAccessOnly } from "@/lib/apiAuth";
import { spendView } from "@/lib/spendView";

export async function GET(req: Request): Promise<Response> {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  return Response.json(await spendView());
}
