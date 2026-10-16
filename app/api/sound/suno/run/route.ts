// GET  /api/sound/suno/run                      -> { receipt }   what Start would launch
// POST /api/sound/suno/run { running, token? }  -> { queue }     | 409 { error, receipt }
//
// The Queue column's switch. MONEY ROUTE - Start launches every waiting prompt
// as a kernel job on box.chrome (lib/producers/suno.ts) that drives the
// operator's Suno browser and spends their credits once a driver reaches it,
// and it acknowledges a box.chrome hold a Suno crash left (the press is "I
// have looked") - so guardRequest, and imaging-auth.probe.spec.ts drives it: a
// body without a boolean "running" is a 400 before the store is touched. Stop
// pauses every job; the create in flight finishes (lib/sound/suno/queue.ts).
//
// A LAUNCH IS A RECEIPT, THEN A CONFIRM (Phase 4 decision 3). The GET reads the
// receipt (lanes, est seconds, the credit reason, queue position, ETA) and
// starts nothing; a POST carrying its `token` confirms exactly that receipt,
// and a token gone stale (the queue moved) is a 409 with the fresh one. A POST
// without a token is the v1 board's Start, whose STUB/LIVE arm is its confirm.

import { guardAccessOnly, guardRequest } from "@/lib/apiAuth";
import { statusOf } from "@/lib/producers/sound";
import { asContractDenial, errorResponse, readJson, toErrorResponse } from "@/lib/sound/http";
import { sunoStartReceipt, setSunoQueue, startSunoWith } from "@/lib/sound/suno/queue";
import { SoundError } from "@/lib/sound/store";

export const runtime = "nodejs";

const fail = (e: unknown): Response => {
  const status = statusOf(e);
  return status !== undefined && e instanceof Error ? errorResponse(e.message, status) : toErrorResponse(e);
};

export async function GET(req: Request) {
  const denied = await asContractDenial(await guardAccessOnly(req));
  if (denied) return denied;
  try {
    return Response.json({ receipt: await sunoStartReceipt() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = (await readJson(req)) as { running?: unknown; token?: unknown } | null;
    if (typeof body?.running !== "boolean") throw new SoundError('"running" must be true (start the queue) or false (stop it)', 400);
    if (body.token !== undefined && (typeof body.token !== "string" || !body.token)) throw new SoundError('"token" must be the receipt\'s token', 400);
    if (body.running && typeof body.token === "string") {
      const r = await startSunoWith(body.token);
      if ("stale" in r) return Response.json({ error: "what Start would launch changed since its receipt; read the fresh receipt", receipt: r.stale }, { status: 409 });
      return Response.json(r);
    }
    return Response.json({ queue: await setSunoQueue(body.running) });
  } catch (e) {
    return fail(e);
  }
}
