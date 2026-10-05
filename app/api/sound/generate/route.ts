// POST /api/sound/generate  GenerateRequest -> 201 { take }
//
// MONEY ROUTE. Renders through lib/music (lib/sound/generate.ts says which call
// for which op), so the music engine's own spend ceiling refuses an over-budget
// render with 402 BEFORE the vendor is asked, and every vendor failure arrives
// as `{ error, code }` with the engine's sentence and kind. guardRequest, not
// guardAccessOnly: this route spends, so it takes the rate bucket the other
// money routes take, and tests/golden-path/imaging-auth.probe.spec.ts drives it.

import { guardRequest } from "@/lib/apiAuth";
import { generateTake, parseGenerateRequest } from "@/lib/sound/generate";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";

export const runtime = "nodejs";
/** No shorter than the vendor deadline it depends on (lib/music/elevenlabs.ts
 *  TIMEOUT_MS = 240s; app/api/music/plan/route.ts states the rule). */
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await asContractDenial(guardRequest(req));
  if (denied) return denied;
  try {
    const take = await generateTake(parseGenerateRequest(await readJson(req)));
    return Response.json({ take }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
