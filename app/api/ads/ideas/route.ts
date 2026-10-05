// POST /api/ads/ideas — round 1 of the ads discipline: an AdBrief in,
// AD_IDEA_COUNT ideas out, one per assigned angle, each with its gate verdicts
// in words and one specific risk (pipeline/ADS-IDEAS-PROMPT.md, validated in
// lib/ads/validate.ts). A `TurnClass` of its own: "ad-ideas".
//
//   200 AdIdeasResponse   { options, engine }
//   400 bad-request       a brief this round cannot start from (it names the field)
//   422 needs-brief       the model asked a question instead of inventing a claim
//   502 bad-response      it answered, and the answer is not a round ({ findings })
//   503/504               no engine, or it timed out (lib/text/errors.ts statusFor)
//
// GET — who would serve, before the button is pressed (a free probe).
//
// MONEY/COMPUTE ROUTE: `guardRequest` first, in this file, on both verbs — a
// reasoning turn on the operator's seat or a metered cloud key. The body of the
// work is lib/ads/concepts.ts so a probe can drive it with a fake engine.

import { guardRequest } from "@/lib/apiAuth";
import { conceptPreflight, ideasResponse } from "@/lib/ads/concepts";

export const runtime = "nodejs";
/** Over the router's "ad-ideas" ceiling (lib/text/router.ts, 300s), so the
 *  engine gives up and says why before the platform drops the connection. */
export const maxDuration = 320;

export async function GET(req: Request): Promise<Response> {
  const denied = guardRequest(req);
  if (denied) return denied;
  return conceptPreflight("ad-ideas");
}

export async function POST(req: Request): Promise<Response> {
  const denied = guardRequest(req);
  if (denied) return denied;
  return ideasResponse(req);
}
