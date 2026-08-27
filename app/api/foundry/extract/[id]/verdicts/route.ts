// PUT /api/foundry/extract/<id>/verdicts — the human's keep/reject per style.
// Whole-map replace, debounced by the page; idempotent.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import { putExtractVerdicts } from "@/lib/foundry/extract/store";
import type { ExtractVerdicts } from "@/lib/foundry/extract/types";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  let body: { verdicts?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "The request body was not JSON." }, { status: 400 });
  }
  if (typeof body?.verdicts !== "object" || body.verdicts === null)
    return Response.json({ detail: "`verdicts` must be an object keyed by style id." }, { status: 400 });
  try {
    await putExtractVerdicts(id, body.verdicts as ExtractVerdicts);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
