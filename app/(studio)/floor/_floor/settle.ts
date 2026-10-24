// ONE ANSWER FOR EVERY PORT CALL the Floor's levels make (../_calendar/contract.ts, the produce
// port's estimate). A Server Action answers its envelope - `{ok, value}` or `{ok, error}` - but one
// that never answers (the server gone, the network dropped, a deploy that moved the action)
// REJECTS, and a `.then` with no rejection arm leaves the level as the press left it: the verb's
// ref armed and its busy drawn for good, the sheet's exports read forever, a record that never
// arrives (async-ui-states action-busy-states: "one thrown error leaves the button spinning
// forever"). Settled here, the rejection is one more refusal, `unavailable`, in its own words,
// and every call site already draws a refusal and disarms on it.
//
// Pure over the promise, so it is asserted without a DOM (tests/next-server/floor-settle.test.ts).

import { errorMessage } from "@gt/domain/errors";

import type { ActionResult } from "../../../_server/actionCore.ts";

export function settle<T>(call: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return call.then(
    (r) => r,
    (e: unknown): ActionResult<T> => ({ ok: false, error: { error: errorMessage(e), code: "unavailable" } }),
  );
}
