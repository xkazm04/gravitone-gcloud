// POST /api/articles/<runId>/medium
//
// Makes the run's private Medium draft again (the first one is made when the run
// reaches the gate): replaces the body of the same draft when one exists. Only
// at the gate. The draft is never published and never read back.
//
// Full guard: it drives the operator's signed-in Medium account.

import { guardRequest } from "@/lib/apiAuth";
import { defaultDeps, ensureMediumDraft } from "@/lib/articles/engine";

import { existing, failure } from "../../_lib/respond";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const { runId } = await params;
  const missing = await existing(runId);
  if (missing) return missing;
  try {
    return Response.json({ run: await ensureMediumDraft(runId, defaultDeps()) });
  } catch (e) {
    return failure(e);
  }
}
