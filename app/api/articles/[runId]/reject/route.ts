// POST /api/articles/<runId>/reject  { note }
//
// The human's other act at the gate. Records `rejection {at, note}`; the run is
// terminal. Spends nothing and writes only the run's own manifest, so the
// access door without the rate bucket.

import { guardAccessOnly } from "@/lib/apiAuth";
import { rejectRun } from "@/lib/articles/engine";

import { existing, failure, objectBody } from "../../_lib/respond";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const denied = await guardAccessOnly(req);
  if (denied) return denied;
  const { runId } = await params;
  const body = await objectBody(req);
  if (body instanceof Response) return body;
  const note = typeof body.note === "string" ? body.note : "";
  if (!note.trim()) return Response.json({ error: "a rejection needs a note", code: "bad-note" }, { status: 400 });
  const missing = await existing(runId);
  if (missing) return missing;
  try {
    return Response.json({ run: await rejectRun(runId, note) });
  } catch (e) {
    return failure(e);
  }
}
