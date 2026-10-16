// POST /api/sound/suno/clear { proposalIds?, jobIds?, clipIds? } -> { removed, cancelled, skipped }
//
// Housekeeping on our records in one write: prompts removed, queued jobs
// cancelled, clip records removed. Nothing on suno.com is touched - a removed
// library clip comes back with the next import. A running job and a queued
// prompt are skipped, never refused, so "delete all here" clears what it can.
// A body naming nothing is a 400 before the store is read. A cancelled job's
// kernel job is cancelled with it (lib/sound/suno/queue.ts clearSunoQueue).

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { clearSunoQueue } from "@/lib/sound/suno/queue";
import type { SunoClearRequest } from "@/lib/suno/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = ((await readJson(req)) ?? {}) as SunoClearRequest;
    return Response.json(await clearSunoQueue(body));
  } catch (e) {
    return toErrorResponse(e);
  }
}
