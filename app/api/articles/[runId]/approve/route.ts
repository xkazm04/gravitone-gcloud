// POST /api/articles/<runId>/approve  { patches: ["p1", …] }
//
// The human's act at the gate: approves the post, and exactly the patches
// named (an empty list approves the post alone). The engine records
// `approval {at, patches}` and the route then starts the landing drive —
// a branch in the registry, its gates, a push and a PR — fire-and-forget; the
// run reports `landing`, then `landed` or `failed`, on GET.
//
// Full guard: landing writes to another repository and pushes.

import { guardRequest } from "@/lib/apiAuth";
import { approveRun, launchRun } from "@/lib/articles/engine";

import { existing, failure, objectBody } from "../../_lib/respond";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const { runId } = await params;
  const body = await objectBody(req);
  if (body instanceof Response) return body;
  const raw = body.patches ?? [];
  if (!Array.isArray(raw) || raw.some((p) => typeof p !== "string")) {
    return Response.json({ error: "patches must be an array of patch ids", code: "bad-patch" }, { status: 400 });
  }
  const missing = await existing(runId);
  if (missing) return missing;
  try {
    const run = await approveRun(runId, raw as string[]);
    launchRun(runId);
    return Response.json({ run });
  } catch (e) {
    return failure(e);
  }
}
