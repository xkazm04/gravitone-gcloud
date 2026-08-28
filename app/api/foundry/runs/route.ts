// GET /api/foundry/runs — every run the forge has left on disk, summarised.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError, listRuns } from "@/lib/foundry/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  try {
    return Response.json({ runs: await listRuns() });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
