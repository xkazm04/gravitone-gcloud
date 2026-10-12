// POST /api/sound/suno/run { running: boolean } -> { queue }
//
// The Queue column's switch. MONEY ROUTE - Start lets the worker drive the
// operator's Suno browser and spend credits on every queued job - so
// guardRequest, and imaging-auth.probe.spec.ts drives it: a body without a
// boolean "running" is a 400 before the store is touched. Stop lets the create
// in flight finish (lib/sound/suno/queue.ts).

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { SoundError } from "@/lib/sound/store";
import { setSunoQueue } from "@/lib/sound/suno/queue";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { running?: unknown } | null;
    if (typeof body?.running !== "boolean") throw new SoundError('"running" must be true (start the queue) or false (stop it)', 400);
    return Response.json({ queue: await setSunoQueue(body.running) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
