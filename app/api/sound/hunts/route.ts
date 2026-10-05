// GET  /api/sound/hunts?kind -> { hunts }  (newest first)
// POST /api/sound/hunts { kind, idea } -> 201 { hunt }
//
// The POST is a lib/text turn ("sound-hunt", pipeline/SOUND-HUNT-PROMPT.md):
// the engine drafts a map of variations, validated in lib/sound/hunt.ts before
// a node is kept. COMPUTE ROUTE — it spends a reasoning turn on the operator's
// seat or a metered cloud key — so guardRequest and the rate bucket, and
// tests/golden-path/imaging-auth.probe.spec.ts drives it. The GET reads disk
// and is access-gated only.

import { guardAccessOnly, guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { draftHunt, listHunts } from "@/lib/sound/hunt";
import { SoundError } from "@/lib/sound/store";

export const runtime = "nodejs";
/** Over the router's "sound-hunt" ceiling (lib/text/router.ts, 300s), so the
 *  engine gives up and says why before the platform drops the connection. */
export const maxDuration = 320;

export async function GET(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const kind = new URL(req.url).searchParams.get("kind");
    if (kind && kind !== "music" && kind !== "sfx") throw new SoundError(`unknown kind ${JSON.stringify(kind)} (music or sfx)`, 400);
    return Response.json({ hunts: await listHunts(kind === "music" || kind === "sfx" ? kind : null) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = await asContractDenial(guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { kind?: unknown; idea?: unknown } | null;
    const kind = body?.kind === "music" || body?.kind === "sfx" ? body.kind : null;
    if (!kind) throw new SoundError('"kind" must be "music" or "sfx"', 400);
    if (typeof body?.idea !== "string" || !body.idea.trim()) throw new SoundError('"idea" is required: the problem to solve, in your words', 400);
    return Response.json({ hunt: await draftHunt(kind, body.idea) }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
