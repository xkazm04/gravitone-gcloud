// POST /api/imaging/generate — a prompt in, plate images out.
//
// The seam exists because the API key must never reach the browser. Which
// vendor answers is the router's decision — Google in both environments, with
// Leonardo behind it in dev. A caller may steer that with `prefer`/`avoid`
// (`avoid` is the move after a safety refusal), but it cannot name a vendor
// outright: the plan still decides, and provenance reports who served.

import { generateHandler } from "@/lib/imaging/handlers";
import { guardRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";
/** Leonardo polls for up to three minutes; give the handler room past that. */
export const maxDuration = 300;

export async function POST(req: Request) {
  // Money route — auth + rate limit before anything is read or spent.
  const denied = await guardRequest(req);
  if (denied) return denied;
  return generateHandler(req);
}
