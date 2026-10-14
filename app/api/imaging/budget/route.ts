// GET /api/imaging/budget — forecast affordability and window reset timing.
//
// Gated with guardAccessOnly (lib/apiAuth.ts) rather than guardRequest:
// a caller checking budget before a click spends nothing, and counting it
// against the origin rate limiter would let pre-flight polling starve real
// generation requests (apiAuth.ts:422-433).

import { guardAccessOnly } from "@/lib/apiAuth";
import { budgetHandler } from "@/lib/imaging/handlers";

export async function GET(req: Request): Promise<Response> {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  return budgetHandler(req);
}
