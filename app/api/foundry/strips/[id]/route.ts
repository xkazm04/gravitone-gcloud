// GET /api/foundry/strips/<id> — the run manifest plus the verdicts so far.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/runStore";
import { getStripRun } from "@/lib/foundry/strips/store";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return Response.json(await getStripRun(id));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
