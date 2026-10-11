// POST /api/sound/suno/library { all: true } -> { added, skipped, total }
//
// Import the operator's Suno library into the gate's triage as clips with
// origin "library" (lib/sound/suno/library.ts). Free - the driver reads the
// library page's own feed and clicks nothing - but it drives the operator's
// signed-in Chrome and writes the queue's store, so guardRequest, and
// imaging-auth.probe.spec.ts drives it: an empty body is a 400 before the
// browser or the store is reached. Idempotent by song id: a re-run adds 0.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { SoundError } from "@/lib/sound/store";
import { importSunoLibrary } from "@/lib/sound/suno/library";

export const runtime = "nodejs";
/** A library of a few thousand songs is tens of spaced feed pages. */
export const maxDuration = 300;

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { all?: unknown } | null;
    if (body?.all !== true) throw new SoundError('"all" must be true: the import reads the whole Suno library', 400);
    return Response.json(await importSunoLibrary());
  } catch (e) {
    return toErrorResponse(e);
  }
}
