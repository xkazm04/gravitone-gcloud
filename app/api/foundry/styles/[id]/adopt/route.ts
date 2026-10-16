// POST /api/foundry/styles/<id>/adopt - RETIRED (Phase 5 wave B, L54). It drafted a Library
// theme from a proven style (the palette read by the recognizer, unmetered and unpriced) for the
// browser to save as a SECOND record in IndexedDB. Adopt is the style atelier's act now
// (/library/style/<id>): one record, adopted in place, priced on a receipt and run as a job
// (lib/producers/style.ts). 410 with the new address, behind the same door the route spent behind,
// so nothing - and no vendor - is reached by a stale client.

import { guardRequest } from "@/lib/apiAuth";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const { id } = await params;
  const moved = `/library/style/${encodeURIComponent(id)}`;
  return Response.json({ detail: `Adopt is the style atelier's act now: ${moved}.`, moved, code: "retired" }, { status: 410 });
}
