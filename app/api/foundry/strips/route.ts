// GET /api/foundry/strips — every code-rendered strip run on disk, summarised.
// Access-only, never rate-limited (the /foundry tab and its station poll it).

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/runStore";
import { listStripRuns } from "@/lib/foundry/strips/store";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  try {
    return Response.json({ runs: await listStripRuns() });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
