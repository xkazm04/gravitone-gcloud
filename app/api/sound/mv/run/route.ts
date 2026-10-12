// POST /api/sound/mv/run { running: boolean } -> { queue }
//
// The Settled column's switch. MONEY ROUTE - Start lets the worker spend two
// text turns and a Leonardo studio still on every queued job - so
// guardRequest, and imaging-auth.probe.spec.ts drives it: a body without a
// boolean "running" is a 400 before the store is touched. Stop lets the step
// in flight finish (lib/sound/mv/queue.ts).

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { setMvQueue } from "@/lib/sound/mv/queue";
import { SoundError } from "@/lib/sound/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { running?: unknown } | null;
    if (typeof body?.running !== "boolean") throw new SoundError('"running" must be true (start the queue) or false (stop it)', 400);
    return Response.json({ queue: await setMvQueue(body.running) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
