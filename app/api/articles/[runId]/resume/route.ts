// POST /api/articles/<runId>/resume
//
// A failed run goes back to the state whose step did not finish (a failure in
// landing goes back to `approved` and re-lands; it never re-approves); a run
// whose job was interrupted mid-step is resumable as it stands. The route retries
// the run's job (lib/producers/article.ts resumeArticle - the operator's act) and
// returns; the worker or the CLI drives it. A job running right now answers 409.
//
// Full guard: a resumed research or draft step is a real agent session.

import { guardRequest } from "@/lib/apiAuth";
import { resumeArticle } from "@/lib/producers/article";

import { existing, failure, refusal, ROUTE_ACTOR } from "../../_lib/respond";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const { runId } = await params;
  const missing = await existing(runId);
  if (missing) return missing;
  try {
    const r = await resumeArticle(runId, { actor: ROUTE_ACTOR, mode: "live" });
    if (!r.ok) return refusal(r.error);
    return Response.json({ run: r.value.run, jobId: r.value.jobId });
  } catch (e) {
    return failure(e);
  }
}
