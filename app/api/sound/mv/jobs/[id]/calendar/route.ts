// POST /api/sound/mv/jobs/[id]/calendar { publishAt } -> { job, slotId }
//
// A finished video becomes a YouTube slot in /calendar, through the
// scheduler's own validation and create path (lib/sound/mv/calendar.ts). It
// copies the render into the exports folder and writes the publish store, so
// guardRequest, and imaging-auth.probe.spec.ts drives it: an empty body is a
// 400 from the date check before any store is read or any file copied.

import { guardRequest } from "@/lib/apiAuth";
import { asContractDenial, readJson, toErrorResponse } from "@/lib/sound/http";
import { parseCalendar, sendMvToCalendar } from "@/lib/sound/mv/calendar";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await asContractDenial(await guardRequest(req));
  if (denied) return denied;
  try {
    const publishAt = parseCalendar(await readJson(req));
    const { id } = await params;
    return Response.json(await sendMvToCalendar(id, publishAt));
  } catch (e) {
    return toErrorResponse(e);
  }
}
