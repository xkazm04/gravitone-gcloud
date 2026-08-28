// GET /api/foundry/extract/<id> — the manifest and the human's verdicts.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import { getExtractRun } from "@/lib/foundry/extract/store";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return Response.json(await getExtractRun(id));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
