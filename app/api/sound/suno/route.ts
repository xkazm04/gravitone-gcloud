// GET /api/sound/suno -> SunoSnapshot { proposals, jobs, clips, driver }
//
// The audio canvas's one read of the Suno queue (lib/board/sources/audio.ts).
// Reads disk, the kernel jobs' running state and whether a signed-in Suno is
// reachable; it spends nothing and starts nothing (v1's read kicked the worker;
// the kernel worker or pipeline/suno.mts drives now), so access-gated only.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/sound/http";
import { sunoSnapshot } from "@/lib/sound/suno/queue";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(await guardAccessOnly(req));
  if (denied) return denied;
  try {
    return Response.json(await sunoSnapshot());
  } catch (e) {
    return toErrorResponse(e);
  }
}
