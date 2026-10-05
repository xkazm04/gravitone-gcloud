// GET  /api/publish/schedule -> { slots, now }
// POST /api/publish/schedule -> 201 { slot }; 409 when the channel is not
//   wired, the export is unknown, or the export is already on that channel.
//
// A GET runs a non-claiming sweep first (lib/publish/schedule.ts): reading the
// calendar can mark an overdue slot missed or a stale claim failed, so the
// Calendar and the Board see the state a tick would see — but it never
// publishes. Publishing is `pipeline/publish.mts tick|publish`.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/publish/http";
import { createSlot, listSlots, parseScheduleInput } from "@/lib/publish/schedule";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const now = new Date();
    return Response.json({ slots: await listSlots(now), now: now.toISOString() });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const slot = await createSlot(parseScheduleInput(await readJson(req)));
    return Response.json({ slot }, { status: 201 });
  } catch (e) {
    return toErrorResponse(e);
  }
}
