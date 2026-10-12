// POST /api/sound/suno/propose { lane, count, riffOf? } -> 201 { proposals }
//
// A lib/text turn (pipeline/SUNO-PROPOSE-PROMPT.md, lib/sound/suno/propose.ts):
// N prompts drafted for a lane, or N riffs of one prompt, persisted with origin
// "llm" / "riff". COMPUTE ROUTE - it spends a reasoning turn - so guardRequest,
// and imaging-auth.probe.spec.ts drives it: an empty body is a 400 from the
// lane check before the prompt file is read or any engine is reached.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { SoundError } from "@/lib/sound/store";
import { proposeSuno } from "@/lib/sound/suno/propose";
import { parseLane } from "@/lib/sound/suno/store";

export const runtime = "nodejs";
/** Over the router's ceiling for the turn (lib/text/router.ts, 300 s). */
export const maxDuration = 320;

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { lane?: unknown; count?: unknown; riffOf?: unknown } | null;
    const lane = parseLane(body?.lane);
    const count = typeof body?.count === "number" && Number.isFinite(body.count) ? body.count : null;
    if (count === null || count < 1) throw new SoundError('"count" must be a number of prompts, at least 1', 400);
    const riffOf = typeof body?.riffOf === "string" && body.riffOf ? body.riffOf : undefined;
    return Response.json({ proposals: await proposeSuno({ lane, count, riffOf }) }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
