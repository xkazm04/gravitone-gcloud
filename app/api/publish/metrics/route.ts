// GET /api/publish/metrics -> { publications, snapshots }
// Raw lifetime snapshots; the per-day deltas and lower-bound group sums are
// computed by the reader with lib/publish/metrics.ts (pure, client-safe).

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/publish/http";
import { readMetrics, readPublications } from "@/lib/publish/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await asContractDenial(guardAccessOnly(req));
  if (denied) return denied;
  try {
    const [pubs, metrics] = await Promise.all([readPublications(), readMetrics()]);
    return Response.json({ publications: pubs.publications, snapshots: metrics.snapshots });
  } catch (e) {
    return toErrorResponse(e);
  }
}
