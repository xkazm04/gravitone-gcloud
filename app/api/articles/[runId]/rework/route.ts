// POST /api/articles/<runId>/rework  { note }
//
// The human's third act at the gate, beside approve and reject: send the draft
// back. The engine moves the run `awaiting-approval -> drafting`, keeps its
// research and outline, records `rework {at, note, count}`, and the route then
// restarts the drive (draft, critique, check), fire-and-forget as approve does;
// the run reports `drafting` and onward on GET. 409 when the run is not at the
// gate; 400 when the note is empty or over 2000 characters.
//
// Full guard: the drive restarts and spends the operator's seat (about the
// price of a critique and a check, not of a whole run: RUN_COST_HINT is the
// whole-run figure).

import { guardRequest } from "@/lib/apiAuth";
import { launchRun, reworkRun } from "@/lib/articles/engine";

import { existing, failure, objectBody } from "../../_lib/respond";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await guardRequest(req);
  if (denied) return denied;
  const { runId } = await params;
  const body = await objectBody(req);
  if (body instanceof Response) return body;
  if (typeof body.note !== "string") return Response.json({ error: "a rework needs a note", code: "bad-note" }, { status: 400 });
  const missing = await existing(runId);
  if (missing) return missing;
  try {
    const run = await reworkRun(runId, body.note);
    launchRun(runId);
    return Response.json({ run });
  } catch (e) {
    return failure(e);
  }
}
