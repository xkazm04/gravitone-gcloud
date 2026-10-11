// DELETE /api/sound/suno/queue/[id] -> { job }
//
// Cancel a queued job; its proposal returns to the candidates. 409 for a job
// that is running (its create is already spent) or already ended; 404 for an
// unknown id, read before the lock.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/sound/http";
import { cancelJob } from "@/lib/sound/suno/queue";

export const runtime = "nodejs";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const { id } = await params;
    return Response.json({ job: await cancelJob(id) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
