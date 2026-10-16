// GET  /api/sound/mv                -> MvSnapshot { jobs, queue, driver }
// POST /api/sound/mv { sources }    -> 201 { jobs }
//
// The Settled column's queue (lib/sound/mv/queue.ts). The GET reads disk, the
// kernel jobs' running state and whether the Leonardo studio is reachable; it
// spends nothing and STARTS nothing (v1's GET kicked the worker - a read is a
// read now), so access-gated only. The POST queues a record per track - free
// until Start launches it as a kernel job, which then spends two text turns and
// a still (and at once while the switch is on) - so guardRequest, and
// imaging-auth.probe.spec.ts drives it: an empty body is a 400 before the store
// is read.

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
