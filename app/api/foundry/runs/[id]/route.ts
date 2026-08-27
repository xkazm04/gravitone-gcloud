// GET /api/foundry/runs/<id> — the manifest plus the verdicts so far.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError, getRun } from "@/lib/foundry/store";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return Response.json(await getRun(id));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
