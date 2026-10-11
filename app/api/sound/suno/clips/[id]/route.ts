// PATCH /api/sound/suno/clips/[id] { verdict?: "keep" | "drop" | null, lane?: SunoLane | null } -> { clip }
//
// The gate's moves on a Suno clip: keep (gate/pending), drop (off the board),
// back to undecided (gate/triage), and a move to another lane (`lane` wins over
// the job's; null clears it). Either key, or both in one write. A body with
// neither, an unknown verdict or a malformed lane is a 400 before the store is
// read.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { SoundError } from "@/lib/sound/store";
import { parseLane, patchClip, type ClipPatch } from "@/lib/sound/suno/store";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { verdict?: unknown; lane?: unknown } | null;
    const patch: ClipPatch = {};
    if (body && "verdict" in body) {
      const v = body.verdict;
      if (!(v === "keep" || v === "drop" || v === null)) throw new SoundError('"verdict" must be "keep", "drop" or null', 400);
      patch.verdict = v;
    }
    if (body && "lane" in body) patch.lane = body.lane === null ? null : parseLane(body.lane);
    if (!("verdict" in patch) && !("lane" in patch)) throw new SoundError('name a change: "verdict" ("keep", "drop" or null) and/or "lane" ({ axis, value } or null)', 400);
    const { id } = await params;
    return Response.json({ clip: await patchClip(id, patch) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
