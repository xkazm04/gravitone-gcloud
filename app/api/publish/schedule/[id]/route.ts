// PATCH  /api/publish/schedule/[id]  { publishAt?, status?: "scheduled" | "cancelled" } -> { slot }
// DELETE /api/publish/schedule/[id]  -> { slot }  (status cancelled; never a hard delete)
//
// A missed slot is rescheduled with status "scheduled" and a new publishAt;
// the transitions a slot may take are lib/publish/schedule.ts's header.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/publish/http";
import { cancelSlot, parseSlotPatch, updateSlot } from "@/lib/publish/schedule";

export const runtime = "nodejs";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const { id } = await params;
    return Response.json({ slot: await updateSlot(id, parseSlotPatch(await readJson(req))) });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const { id } = await params;
    return Response.json({ slot: await cancelSlot(id) });
  } catch (e) {
    return toErrorResponse(e);
  }
}
