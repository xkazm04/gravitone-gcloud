// POST /api/foundry/extract/<id>/step — perform ONE unit of the run (or a
// few: `{ units: n }`, capped), and return where it stands. `{ retry: true }`
// first prunes every failed element (a tripped breaker, a refused frame) so
// the loop takes it again.
//
// This is the whole reason the engine is a step machine: on a managed
// platform a handler has a duration ceiling and nothing survives the
// response, so the browser drives the run one bounded unit at a time and the
// manifest on disk is the only state. A unit is at most one generation plus
// one recognition — well inside `maxDuration` — and a dropped connection
// costs the unit in flight, never the run.
//
// Money route: every unit may spend on a vendor. Full guard.

import { guardRequest } from "@/lib/apiAuth";
import { FoundryError } from "@/lib/foundry/store";
import { stepRun } from "@/lib/foundry/extract/store";
import { ImagingError, statusFor as imagingStatus } from "@/lib/imaging/errors";
import { scrub } from "@/lib/imaging/log";
import { TextError, statusFor as textStatus } from "@/lib/text/errors";

export const runtime = "nodejs";
/** One generate (≤180s) + one recognise (≤120s), with room. */
export const maxDuration = 300;

const MAX_UNITS = 4;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guardRequest(req);
  if (denied) return denied;
  const { id } = await params;
  let units = 1;
  let retry = false;
  try {
    const body = await req.json();
    if (typeof body?.units === "number") units = Math.min(MAX_UNITS, Math.max(1, Math.round(body.units)));
    retry = body?.retry === true;
  } catch {
    /* an empty body is one unit */
  }
  try {
    return Response.json(await stepRun(id, units, retry));
  } catch (e) {
    if (e instanceof FoundryError) return Response.json({ detail: e.message }, { status: e.status });
    // A vendor failure inside a unit is recorded on the element by the engine
    // and does not reach here; what does is a failure BEFORE any unit could
    // start — an over-budget refusal, a missing key — and those carry their
    // own status and a sentence already written for a person.
    if (e instanceof ImagingError) return Response.json({ detail: scrub(e.message), code: e.kind }, { status: imagingStatus(e.kind) });
    if (e instanceof TextError) return Response.json({ detail: scrub(e.message), code: e.kind }, { status: textStatus(e.kind) });
    throw e;
  }
}
