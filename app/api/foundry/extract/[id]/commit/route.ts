// POST /api/foundry/extract/<id>/commit — every KEPT style joins the
// catalogue as a candidate, with its exemplars. Not destructive: rejected
// styles keep their images on disk and are recorded as rejected on the run.
// One-way all the same — a committed run's verdicts are final.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import { commitExtractRun } from "@/lib/foundry/extract/store";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  try {
    return Response.json(await commitExtractRun(id));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
