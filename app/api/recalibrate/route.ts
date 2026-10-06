// POST /api/recalibrate — notes in, an EDIT PLAN out.
//
// The engine is WHICHEVER ONE THIS DEPLOYMENT HAS, chosen at the chokepoint
// (`lib/text/router.ts`). On a machine with a `claude` login that is a LOCAL
// CLAUDE CODE PROCESS driven headlessly, authenticating with the logged-in
// subscription — no API key in the environment, in a vault or in a bundle, which
// is still the app's default posture and still the reason for this shape. On a
// managed platform, where no binary and no interactive login can exist, it is a
// metered cloud engine. The handler names the TURN, not the vendor.
//
// The seam is still a route handler rather than a fetch from the pad, for a
// reason that now holds on both rungs: a browser cannot spawn a process, and it
// must not hold a vendor key either.
//
// Two costs of the CLI engine over the SDK, both real, both paid deliberately —
// AND THE FIRST ONE IS NOW RUNG-DEPENDENT, which is the clearest thing the
// ladder bought:
//   1. No `output_config.format`, so on the local rung the plan's shape is a
//      REQUEST, not a guarantee — `parseEditPlan` validates and rejects rather
//      than trusting. On the cloud rung Gemini constrains decoding to the schema
//      and the guarantee is real; `engine.schemaEnforcement` says which happened,
//      and `parseEditPlan` runs either way because a validator that only runs on
//      the weaker rung is a validator nobody tests.
//   2. No cross-call prompt caching, so each run re-reads the whole notebook.
//      Runs are minutes either way; this is a cost line, not a latency one.
//
// Which is why the prompt is BUILT rather than forwarded, and WHERE: the cuts,
// the additions and the manifest that names them live in
// lib/turns/assemble/recalibrate.ts (AIO-B), a pure function of this body and
// the system prompt. A free preview (app/api/turns/preview) and this run build
// the same bytes, which tests/golden-path/turn-assemble-parity.probe.spec.ts
// pins.
//
// ── A TURN, NOT A HELD-OPEN REQUEST (AIO-A stage 2, 2026-10-06) ─────────────
//
// This handler admits the request and hands it to the turn runner as the
// `recalibrate` kind (lib/turns/kinds/recalibrate.ts: prepare = the refusals
// and the assembler, settle = parseEditPlan and the stray/blind guards). It
// answers 202 `{ turnId }` as soon as the record is written; the run belongs to
// the server, and a tab that reloads or leaves the Script step loses nothing.
// A second run for the same project while one is live is a 409 naming it.
//
// `?wait=1` holds the request until the turn settles and answers the
// synchronous body this route always answered — 200 `{ plan, manifest, engine }`,
// or the same refusal statuses and sentences — for scripts and probes.

import { after } from "next/server";

import { guardRequest } from "@/lib/apiAuth";
import { TextError, statusFor } from "@/lib/text/errors";
import { slotBusy, syncBody } from "@/lib/turns/answer";
import { refusalResponse } from "@/lib/turns/assemble/manifest";
import { PromptUnavailable, recalibrateRefusal, type RecalibrateInput } from "@/lib/turns/assemble/recalibrate";
import { RECALIBRATE_SPEC, RecalibrateRefused } from "@/lib/turns/kinds/recalibrate";
import { startTurn } from "@/lib/turns/runner";

/** The size predicate lives with the assembler; re-exported so the probes that
 *  ask it here (claude-run-bounded) keep asking the route. */
export { tooLarge } from "@/lib/turns/assemble/recalibrate";

export const runtime = "nodejs";
/** A real run is minutes. `after()` and `?wait=1` both live as long as the
 *  route may, so give it room rather than truncating it. */
export const maxDuration = 800;

/** The same project-id rule /api/turns holds. */
const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

export async function POST(req: Request) {
  // LOCAL-COMPUTE ROUTE - auth + rate limit before anything is read or spawned.
  //
  // This was the only compute route in the app without it. app/api/frames does
  // the same thing (spawns the same headless Claude process through
  // lib/claudeCli) and has gated since the gate existed; the four music routes
  // and the three imaging routes gate; app/api/imaging/pricing is deliberately
  // public and audited as such. Nine routes, one omission, and it was this one -
  // which runs for up to maxDuration = 800 seconds at Opus-at-high-effort on the
  // operator's own subscription, for anyone who could reach the origin.
  //
  // Found from app-infrastructure while reading lib/apiAuth.ts, whose header
  // names "app/api/frames" as the CLI-compute route it protects: the sentence
  // was written before this route existed and nothing re-read it afterwards.
  const denied = await guardRequest(req);
  if (denied) return denied;

  let body: RecalibrateInput & { projectId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  // The refusals first, in the order they always ran — a 413 for an oversized
  // body is answered before anything else is asked of it.
  const refused = recalibrateRefusal(body);
  if (refused) return refusalResponse(refused);
  // The slot is per project: one live recalibration per project, across tabs
  // and devices, decided against the ledger.
  const projectId = body.projectId;
  if (typeof projectId !== "string" || !PROJECT_ID_RE.test(projectId))
    return Response.json({ detail: "`projectId` is required.", code: "bad-request" }, { status: 400 });

  let out: Awaited<ReturnType<typeof startTurn>>;
  try {
    out = await startTurn(RECALIBRATE_SPEC as Parameters<typeof startTurn>[0], projectId, body);
  } catch (e) {
    if (e instanceof RecalibrateRefused) return refusalResponse(e.refusal);
    // Before anything ran. Distinguished from every failure below because the
    // engine was never reached: this is a broken install, not a broken turn, and
    // pointing the creator at the model would send them looking in the one place
    // the fault is not. (It used to throw from ABOVE the try and leave a bare
    // 500 with no body, which the client read as "the model could not be
    // reached".)
    if (e instanceof PromptUnavailable)
      return Response.json({ detail: `${e.message} The engine was never started, so nothing was changed.` }, { status: 500 });
    if (e instanceof TextError)
      return Response.json({ detail: `${e.message} Nothing was changed.`, code: e.kind }, { status: statusFor(e.kind) });
    console.error("[recalibrate]", e);
    return Response.json({ detail: "The recalibration failed. Nothing was changed." }, { status: 502 });
  }

  if (!out.ok) return slotBusy("A recalibration", out.holder);

  const settled = out.done;
  try {
    after(() => settled);
  } catch {
    // No request scope (a probe or a script calling the handler directly). The
    // run is already under way as a detached promise.
  }

  if (new URL(req.url).searchParams.get("wait") === "1")
    return syncBody(await settled, "The recalibration failed. Nothing was changed.");
  return Response.json({ turnId: out.turnId }, { status: 202 });
}
