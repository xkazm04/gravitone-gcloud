// GET  /api/sound/mv                -> MvSnapshot { jobs, queue, driver }
// POST /api/sound/mv { sources }    -> 201 { jobs }
//
// The Settled column's queue (lib/sound/mv/queue.ts). The GET reads disk and
// asks the Leonardo studio whether it is reachable; it spends nothing, so
// access-gated only, and it is the worker's kick: an idle, switched-on queue
// with work in it starts here. The POST queues a job per track - free until
// Start, but every job it queues spends two text turns and a still once the
// queue runs - so guardRequest, and imaging-auth.probe.spec.ts drives it: an
// empty body is a 400 before the store is read.

import { guardAccessOnly, guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { enqueueMv, mvSnapshot, parseEnqueue } from "@/lib/sound/mv/queue";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(await guardAccessOnly(req));
  if (denied) return denied;
  try {
    return Response.json(await mvSnapshot());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    return Response.json({ jobs: await enqueueMv(parseEnqueue(await readJson(req))) }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
