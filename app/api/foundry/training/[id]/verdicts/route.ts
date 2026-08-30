// PUT /api/foundry/training/<id>/verdicts — the whole verdict map, replaced.
//
// Whole-map on purpose, same as the cull's: the gate autosaves after every
// decision, and a last-writer-wins replace of one small file cannot half-apply
// the way per-improvement patches could.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import { putTrainingVerdicts } from "@/lib/foundry/training/store";
import type { TrainingVerdicts } from "@/lib/foundry/training/types";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  let body: { verdicts?: TrainingVerdicts };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  if (!body.verdicts || typeof body.verdicts !== "object")
    return Response.json({ detail: "No verdicts were sent." }, { status: 400 });
  try {
    return Response.json({ verdicts: await putTrainingVerdicts(id, body.verdicts) });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
