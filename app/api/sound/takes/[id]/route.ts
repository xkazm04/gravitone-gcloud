// PATCH /api/sound/takes/[id]  TakePatch -> { take }
//
// Judging, staging, grouping, labelling, and the peaks/measurements a browser
// read off the bytes. The contract's rules (kept -> pending, finalized needs a
// label -> 409, verdict changes stamp judgedAt and write the ledger) live in
// lib/sound/takes.ts, shared with the CLI's `judge`.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { parseTakePatch, patchTake } from "@/lib/sound/takes";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const { id } = await params;
    return Response.json({ take: await patchTake(id, parseTakePatch(await readJson(req))) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
