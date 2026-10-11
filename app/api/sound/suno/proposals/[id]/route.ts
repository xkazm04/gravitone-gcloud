// DELETE /api/sound/suno/proposals/[id] -> { ok: true }
//
// Discard a prompt. 404 for an unknown id (read before the lock, so a bad id
// never creates the store); 409 while a job of it is queued or running.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/sound/http";
import { deleteProposal } from "@/lib/sound/suno/store";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const { id } = await params;
    await deleteProposal(id);
    return Response.json({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
