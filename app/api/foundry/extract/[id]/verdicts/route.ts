// /api/foundry/extract/<id>/verdicts — the human's verdict per item.
//
// PATCH {set, clear, baseRev, by, surface} is the write: keyed, against the
// revision GET returned, a 409 {rev} on a stale base or a committed extract run.
// PUT (a whole map) is kept for older callers; the kernel writes it as the
// diff it amounts to. Both go through lib/foundry/verdictLog.ts — one lock
// shared with the commit, one log line per changed key.

import { guardAccessOnly } from "@/lib/apiAuth";
import { putExtractVerdicts, patchExtractVerdicts } from "@/lib/foundry/extract/store";
import type { ExtractVerdicts } from "@/lib/foundry/extract/types";
import { parseVerdictPatch, verdictErrorResponse } from "@/lib/foundry/verdictLog";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function readBody(req: Request): Promise<Record<string, unknown> | Response> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    /* falls through to the 400 */
  }
  return Response.json({ detail: "Request body was not a JSON object." }, { status: 400 });
}

export async function PUT(req: Request, { params }: Ctx) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  if (!body.verdicts || typeof body.verdicts !== "object" || Array.isArray(body.verdicts))
    return Response.json({ detail: "No verdicts were sent." }, { status: 400 });
  try {
    await putExtractVerdicts(id, body.verdicts as ExtractVerdicts);
    return Response.json({ ok: true });
  } catch (e) {
    const res = verdictErrorResponse(e);
    if (res) return res;
    throw e;
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const patch = parseVerdictPatch(body);
  if (typeof patch === "string") return Response.json({ detail: patch }, { status: 400 });
  try {
    return Response.json(await patchExtractVerdicts(id, patch));
  } catch (e) {
    const res = verdictErrorResponse(e);
    if (res) return res;
    throw e;
  }
}
