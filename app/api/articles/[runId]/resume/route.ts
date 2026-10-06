// POST /api/articles/<runId>/resume
//
// A failed run goes back to the state whose step did not finish (a failure in
// landing goes back to `approved` and re-lands; it never re-approves); a run
// whose driver died mid-step is resumable as it stands. The route then starts
// the drive, fire-and-forget. A run another process is driving answers 409.
//
// Full guard: a resumed research or draft step is a real agent session.

import { guardRequest } from "@/lib/apiAuth";
import { launchRun, resumeRun } from "@/lib/articles/engine";

import { existing, failure } from "../../_lib/respond";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const { runId } = await params;
  const missing = await existing(runId);
  if (missing) return missing;
  try {
    const run = await resumeRun(runId);
    launchRun(runId);
    return Response.json({ run });
  } catch (e) {
    return failure(e);
  }
}
