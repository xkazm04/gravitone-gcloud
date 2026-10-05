// POST /api/ads/scenarios — round 2 of the ads discipline: the brief plus the
// ONE picked idea in, AD_SCENARIO_COUNT timed shot lists out
// (pipeline/ADS-SCENARIOS-PROMPT.md, validated in lib/ads/validate.ts — the
// runtime arithmetic, the motion line's shape, the super's hold). A `TurnClass`
// of its own: "ad-scenarios".
//
//   200 AdScenariosResponse   { options, engine } — every scenario's `ideaId`
//                             is the request's idea, stamped here
//   400 bad-request           a brief, format or idea this round cannot use
//   502 bad-response          it answered, and the answer is not a round ({ findings })
//   503/504                   no engine, or it timed out
//
// GET — who would serve, before the button is pressed (a free probe).
//
// MONEY/COMPUTE ROUTE: `guardRequest` first, in this file, on both verbs.

import { guardRequest } from "@/lib/apiAuth";
import { conceptPreflight, scenariosResponse } from "@/lib/ads/concepts";

export const runtime = "nodejs";
/** Over the router's "ad-scenarios" ceiling (300s). */
export const maxDuration = 320;

export async function GET(req: Request): Promise<Response> {
  const denied = guardRequest(req);
  if (denied) return denied;
  return conceptPreflight("ad-scenarios");
}

export async function POST(req: Request): Promise<Response> {
  const denied = guardRequest(req);
  if (denied) return denied;
  return scenariosResponse(req);
}
