// POST /api/articles/<runId>/approve  { patches: ["p1", …] }
//
// The human's act at the gate: approves the post, and exactly the patches
// named (an empty list approves the post alone). The engine records
// `approval {at, patches}` and the route enqueues the landing — a SECOND job
// (lib/producers/article.ts approveArticle): a branch in the registry, its gates,
// a push and a PR, driven by the worker or the CLI; the run reports `landing`,
// then `landed` or `failed`, on GET. A dry run's landing is dry: it pushes nothing.
//
// Full guard: landing writes to another repository and pushes.

import { guardRequest } from "@/lib/apiAuth";
import { approveArticle } from "@/lib/producers/article";

import { existing, failure, objectBody, refusal, ROUTE_ACTOR } from "../../_lib/respond";

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
    const r = await approveArticle(runId, raw as string[], { actor: ROUTE_ACTOR, mode: "live" });
    if (!r.ok) return refusal(r.error);
    return Response.json({ run: r.value.run, jobId: r.value.jobId });
  } catch (e) {
    return failure(e);
  }
}
