// ONE ANSWER FOR EVERY PORT CALL a screen makes. A Server Action answers its envelope - `{ok, value}`
// or `{ok, error}` - but one that never answers (the server gone, the network dropped, a deploy
// that moved the action) REJECTS, and a `.then` with no rejection arm leaves the screen as the
// press left it: the verb's ref armed and its busy drawn for good, a detail "reading" for good, a
// block's slots never asked for again (async-ui-states action-busy-states: "one thrown error
// leaves the button spinning forever"). Settled here, the rejection is one more refusal,
// `unavailable`, in the rejection's own words, and every call site already draws a refusal and
// disarms on it.
//
// One module, one wording: the Floor, the audio hunt and the Library each carried a copy, and the
// Floor's said the bare rejection where the other two prefixed it. Client-safe: it imports only
// types from the action core (whose runtime reaches the server).
//
// Pure over the promise, so it is asserted without a DOM (tests/next-server/floor-settle.test.ts).

import { errorMessage } from "@gt/domain/errors";

import type { ActionResult } from "./actionCore.ts";

export function settle<T>(call: Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  return call.then(
    (r) => r,
    (e: unknown): ActionResult<T> => ({ ok: false, error: { error: `the studio did not answer: ${errorMessage(e)}`, code: "unavailable" } }),
  );
}
