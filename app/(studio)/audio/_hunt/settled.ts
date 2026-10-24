// A WRITE'S ANSWER, EVEN WHEN THE ROUND TRIP FAILED. A Server Action whose request never comes
// back (the network dropped, the server restarted mid-request) REJECTS - it does not answer
// `ok: false` - so an island that only reads `.then(r => ...)` never runs its settle: the busy
// flag it raised (a crown in flight, a lesson drafting, a sign) stays up until a reload, and the
// gesture is dead. Every island write on the hunt, rubric and strengths sections waits through
// this, so a rejection reads as the refusal it is, in the action envelope's own shape.
// (The Arrange board's `answered` in ../_audio/Arrange.tsx is the same rule plus a deadline; these
// writes take none, because a drafting text engine may honestly take longer than any deadline.)
import { errorMessage } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";

export async function settled<T>(p: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await p;
  } catch (e) {
    return { ok: false, error: { error: `the studio did not answer: ${errorMessage(e)}`, code: "unavailable" } };
  }
}
