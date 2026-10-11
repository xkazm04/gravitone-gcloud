// PATCH /api/sound/suno/clips/[id] { verdict: "keep" | "drop" | null } -> { clip }
//
// The gate's moves on a Suno clip: keep (gate/pending), drop (off the board),
// or back to undecided (gate/triage). A missing or unknown verdict is a 400
// before the store is read.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { SoundError } from "@/lib/sound/store";
import { setClipVerdict } from "@/lib/sound/suno/store";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { verdict?: unknown } | null;
    const v = body?.verdict;
    if (!(v === "keep" || v === "drop" || v === null)) throw new SoundError('"verdict" must be "keep", "drop" or null', 400);
    const { id } = await params;
    return Response.json({ clip: await setClipVerdict(id, v) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
