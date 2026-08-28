// PUT /api/foundry/runs/<id>/verdicts — the whole verdict map, replaced.
//
// Whole-map on purpose: the page autosaves after every keystroke of the cull,
// and a last-writer-wins replace of one small file cannot half-apply the way
// per-candidate patches could.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError, putVerdicts } from "@/lib/foundry/store";
import type { Verdicts } from "@/lib/foundry/types";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  let body: { verdicts?: Verdicts };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  if (!body.verdicts || typeof body.verdicts !== "object")
    return Response.json({ detail: "No verdicts were sent." }, { status: 400 });
  try {
    await putVerdicts(id, body.verdicts);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
