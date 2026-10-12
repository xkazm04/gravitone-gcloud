// POST   /api/sound/mv/jobs/[id] { part, note? }            -> { job }   Regenerate
// PATCH  /api/sound/mv/jobs/[id] { verdict?, metadata? }    -> { job }
// DELETE /api/sound/mv/jobs/[id]                            -> { ok: true }
//
// One video's moves (lib/sound/mv/queue.ts). Regenerate re-queues ONE part of
// a finished or failed job and spends when the queue reaches it; Drop deletes
// the render files and keeps the record; a metadata edit is held to YouTube's
// limits and refused, never trimmed; DELETE cancels a queued job or removes a
// finished one with its folder, and refuses (409) the one being made. All
// three write the store, so guardRequest, and imaging-auth.probe.spec.ts
// drives the POST: an empty body is a 400 from the part check before the
// store is read. An unknown id is a 404 read BEFORE the store's lock.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { deleteMv, parsePatch, parseRegenerate, patchMv, regenerateMv } from "@/lib/sound/mv/queue";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const body = parseRegenerate(await readJson(req));
    const { id } = await params;
    return Response.json({ job: await regenerateMv(id, body) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const patch = parsePatch(await readJson(req));
    const { id } = await params;
    return Response.json({ job: await patchMv(id, patch) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const { id } = await params;
    await deleteMv(id);
    return Response.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
