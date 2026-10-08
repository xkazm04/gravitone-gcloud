// A SETTLED TURN, AS THE SYNCHRONOUS BODY ITS ROUTE ALWAYS ANSWERED. SERVER ONLY.
//
// /api/recalibrate and /api/frames answer 202 `{ turnId }` by default since
// AIO-A moved them onto the ledger; `?wait=1` holds the request until the turn
// settles and answers what the route answered before the move — 200 with the
// kind's result, or the same refusal statuses and sentences. One mapping for
// both routes (it was written inline in the recalibrate route in stage 2 and
// lifted here when frames became the second caller), because two copies of
// "which status does a failed turn answer" is the drift lib/text/errors.ts
// exists to end.

import { statusFor, type TextErrorKind } from "../text/errors";
import type { TurnRecord } from "./ledger";

/** The text-error kinds `statusFor` maps. A record's error kind is a plain
 *  string on disk; anything else is the runner's own `failed`. */
const TEXT_KINDS = new Set<string>([
  "no-key", "not-installed", "not-logged-in", "policy-forbidden", "managed-platform", "unsupported",
  "invalid-request", "refused", "no-alternative", "rate-limited", "timeout", "cancelled", "bad-response", "failed",
]);

const NOTHING_CHANGED = /Nothing was changed\.$/;

/** `failed` is the route's own sentence for a failure that carried no message
 *  ("The recalibration failed. Nothing was changed."). */
export function syncBody(rec: TurnRecord, failed: string): Response {
  if (rec.status === "done") return Response.json(rec.result);
  const err = rec.error ?? { kind: rec.status, message: "" };
  if (rec.status === "cancelled")
    return Response.json({ detail: "The turn was cancelled. Nothing was changed.", code: "cancelled" }, { status: 499 });
  if (rec.status === "orphaned") return Response.json({ detail: err.message, code: "orphaned" }, { status: 502 });
  const kind = TEXT_KINDS.has(err.kind) ? (err.kind as TextErrorKind) : "failed";
  const detail = !err.message
    ? failed
    : NOTHING_CHANGED.test(err.message)
      ? err.message
      : `${err.message} Nothing was changed.`;
  // An answer the kind's settle door refused is `bad-response` with the whole
  // sentence already written; it answered 502 with `{ detail }` alone, and
  // still does.
  const plain = NOTHING_CHANGED.test(err.message ?? "") && err.kind === "bad-response";
  // Every finding travels: the fix is a prompt change, and one finding per run
  // is a prompt edited five times for one run's worth of information.
  const findings = err.findings?.length ? { findings: err.findings } : {};
  return Response.json({ ...(plain ? { detail } : { detail, code: kind }), ...findings }, { status: statusFor(kind) });
}

/** The 409 both routes answer when the project's slot is held. */
export function slotBusy(noun: string, holder: TurnRecord): Response {
  return Response.json(
    {
      detail: `${noun} is already running for this project (${holder.id}). Wait for it, or cancel it.`,
      code: "slot-busy",
      holder: holder.id,
    },
    { status: 409 },
  );
}
