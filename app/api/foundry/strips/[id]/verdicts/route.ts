// PUT /api/foundry/strips/<id>/verdicts — the whole verdict map, replaced.
//
// Whole-map, like the cull's and the Dojo's: the tab autosaves 400 ms after
// the last decision. Unlike the Dojo's, a map with anything the store cannot
// read — an unknown card, a chip outside STRIP_CHIPS, a note over 500
// characters — is refused whole with a 400 rather than trimmed: a dropped chip
// is a lost learning signal answered with a 200.

import { guardAccessOnly } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/runStore";
import { putStripVerdicts } from "@/lib/foundry/strips/store";

export const runtime = "nodejs";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { id } = await params;
  let body: { verdicts?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !body.verdicts || typeof body.verdicts !== "object")
    return Response.json({ detail: "No verdicts were sent." }, { status: 400 });
  try {
    return Response.json({ verdicts: await putStripVerdicts(id, body.verdicts) });
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    throw e;
  }
}
