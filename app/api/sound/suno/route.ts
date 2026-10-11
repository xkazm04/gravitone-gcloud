// GET /api/sound/suno -> SunoSnapshot { proposals, jobs, clips, driver }
//
// The audio canvas's one read of the Suno queue (lib/board/sources/audio.ts).
// Reads disk and asks the driver whether a signed-in Suno is reachable; it
// spends nothing, so access-gated only. A read is also the worker's kick: an
// idle queue with work in it starts here (lib/sound/suno/queue.ts).

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
