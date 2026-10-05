// POST /api/sound/hunts/[id]/lesson -> { draft }
//
// Asks the text engine ("sound-lesson", pipeline/SOUND-LESSON-PROMPT.md) which
// method the hunt's winners proved best. Returns a DRAFT and stores nothing:
// the operator edits it and confirms it through POST /api/sound/lessons. The
// evidence on the draft is counted from the takes by lib/sound/hunt.ts, not
// written by the model. 409 until a winner is marked and a take judged.
// COMPUTE ROUTE: guardRequest, driven by imaging-auth.probe.spec.ts.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/sound/http";
import { draftHuntLesson } from "@/lib/sound/hunt";

export const runtime = "nodejs";
export const maxDuration = 320;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(guardRequest(req));
  if (denied) return denied;
  try {
    const { id } = await params;
    return Response.json({ draft: await draftHuntLesson(id) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
