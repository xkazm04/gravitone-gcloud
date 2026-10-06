// POST /api/publish/metrics/refresh -> { refreshed, note }
// Live publications only, and only when publishing is live; otherwise
// `refreshed: 0` with the note saying why — never a row of zeros.

import { guardAccessOnly } from "@/lib/apiAuth";
import { asContractDenial, toErrorResponse } from "@/lib/publish/http";
import { refreshMetrics } from "@/lib/publish/publisher";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = await asContractDenial(await guardAccessOnly(req));
  if (denied) return denied;
  try {
    return Response.json(await refreshMetrics());
  } catch (e) {
    return toErrorResponse(e);
  }
}
