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
// the system prompt. This handler admits the request, asks the assembler, sends
// the prompt, and holds the answer to the scope the assembler decided — so a
// free preview (app/api/turns/preview) and this run build the same bytes, which
// tests/golden-path/turn-assemble-parity.probe.spec.ts pins.

import { guardRequest } from "@/lib/apiAuth";
import { TextError, statusFor } from "@/lib/text/errors";
import { reason } from "@/lib/text/router";
import { refusalResponse } from "@/lib/turns/assemble/manifest";
import {
  PromptUnavailable,
  assembleRecalibrate,
  blindConclusions,
  recalibrateRefusal,
  recalibrateSystemPrompt,
  rendersOf,
  strayRenders,
  type RecalibrateInput,
} from "@/lib/turns/assemble/recalibrate";
import { EDIT_PLAN_SCHEMA, PlanError, parseEditPlan } from "@/app/_phases/script/editPlan";

/** The size predicate lives with the assembler; re-exported so the probes that
 *  ask it here (claude-run-bounded) keep asking the route. */
export { tooLarge } from "@/lib/turns/assemble/recalibrate";

export const runtime = "nodejs";
/** A real run is minutes. Give the handler room rather than truncating it. */
export const maxDuration = 800;

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

  let body: RecalibrateInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  const refused = recalibrateRefusal(body);
  if (refused) return refusalResponse(refused);

  // ASSEMBLY AND DISPATCH ARE TWO STEPS, kept apart on purpose: the assembler
  // decides what is sent (and the manifest says so); everything after it is
  // one turn on the engine and the guards over its answer. AIO-A's turn runner
  // takes the second half; the first does not move.
  //
  // BUILT INSIDE THE TRY. `recalibrateSystemPrompt()` reads a file from disk,
  // and this await used to sit ABOVE the try -- so a missing
  // `pipeline/RECALIBRATE-PROMPT.md` threw straight out of the handler: Next
  // returned a bare 500 with no body, the client's
  // `res.json().catch(() => ({ detail: "" }))` fell back to "The model could
  // not be reached", and a simulated candidate was staged under a reason naming
  // the wrong system entirely. Every throw on this path now has a door.
  try {
    const { prompt, manifest } = assembleRecalibrate(body, await recalibrateSystemPrompt());

    // THE SCHEMA IS HANDED TO THE ENGINE, not only written into the prompt
    // above. On the local rung nothing changes — the CLI cannot constrain its
    // own output, so the router appends the same demand the prompt already makes
    // and validates the answer on the way back. On the cloud rung it becomes
    // real enforcement. Either way `parseEditPlan` below is unchanged and still
    // authoritative: it checks more than a schema can (render ids against the
    // table, op vocabulary), and this app does not have two validators.
    const run = await reason({ prompt, turn: "edit-plan", schema: EDIT_PLAN_SCHEMA });
    const plan = parseEditPlan(run.text, { renders: rendersOf(body) });

    // A plan may only name material that was sent. `parseEditPlan` checks the
    // id against the render TABLE, which still holds all three — so the check
    // that the id was in THIS request reads the manifest that scoped it (forced
    // renders included). Refused wholesale rather than filtered: an edit aimed
    // at a chain the engine never read is a guess, and applying the rest of a
    // plan built around that guess is worse than running again.
    const stray = strayRenders(plan.edits, manifest);
    if (stray.length)
      return Response.json(
        {
          detail: `The engine returned edits for renders it was not given (${stray.join(", ")}), so it was editing a beat chain it could not read. Nothing was changed.`,
        },
        { status: 502 },
      );
    // Same rule, other axis: a beat may not rest on a conclusion whose text this
    // run withheld. Being told a card's NAME is not being handed the card, and a
    // beat's `cards` is what every coverage number is recomputed from — an id
    // declared from the name alone produces a matrix that cites reasoning the
    // engine never read. Refused wholesale, like the stray render above, for the
    // same reason: the rest of a plan built around that guess is not salvage.
    const blind = blindConclusions(plan.edits, manifest);
    if (blind.length)
      return Response.json(
        {
          detail: `The engine declared beats resting on conclusions whose text it was not sent (${blind.join(", ")}). Those are out of scope, so no beat may rest on them, and it had only their names. Nothing was changed.`,
        },
        { status: 502 },
      );
    // The receipt travels with the plan. A run that took minutes and cost real
    // money and could tell the creator neither was the defect; the client keeps
    // this on the version it stages, so what a version cost survives with it.
    return Response.json({
      plan,
      // What the engine read, as the assembler decided it: sizes and ids, never
      // text. Additive — a client that does not read it is unaffected.
      manifest,
      engine: {
        // `kind` keeps its existing two-value shape for the client that already
        // reads it; everything below it is new and additive, so a staged version
        // written before this change still renders.
        kind: run.provenance.transport === "local-subprocess" ? "local-claude-code" : "cloud-api",
        provider: run.provenance.provider,
        model: run.provenance.model,
        // THE RUNG TRAVELS ONTO THE VERSION. The client keeps this receipt on
        // the version it stages, so "which engine wrote this plan, and was it
        // the one I configured" survives with the work — which is the whole
        // point of labelling the ladder rather than logging it.
        rung: run.provenance.rung,
        transport: run.provenance.transport,
        schemaEnforcement: run.provenance.schemaEnforcement,
        reroutedFrom: run.provenance.reroutedFrom,
        sessionId: run.provenance.sessionId,
        costUsd: run.provenance.costUsd,
        costBasis: run.provenance.costBasis,
        durationMs: run.provenance.durationMs,
        promptChars: run.provenance.promptChars,
      },
    });
  } catch (e) {
    // Before anything ran. Distinguished from every failure below because the
    // engine was never reached: this is a broken install, not a broken turn, and
    // pointing the creator at the model would send them looking in the one place
    // the fault is not.
    if (e instanceof PromptUnavailable)
      return Response.json(
        { detail: `${e.message} The engine was never started, so nothing was changed.` },
        { status: 500 },
      );

    if (e instanceof PlanError)
      // The engine ran and returned something unusable. Say which, because the
      // fix is a prompt change, not a retry.
      return Response.json(
        { detail: `The engine returned a plan this app cannot use: ${e.message} Nothing was changed.` },
        { status: 502 },
      );

    // One taxonomy, one status map (lib/text/errors.ts). This used to be a
    // hand-rolled ternary here and a second copy of it in /api/frames. The
    // message a TextError carries at the bottom of the ladder names every engine
    // that was tried and why each dropped out, so "the model could not be
    // reached" — the sentence that sends an operator to check the one place the
    // fault is not — is no longer something this route can say.
    if (e instanceof TextError)
      return Response.json(
        { detail: `${e.message} Nothing was changed.`, code: e.kind },
        { status: statusFor(e.kind) },
      );

    console.error("[recalibrate]", e);
    return Response.json({ detail: "The recalibration failed. Nothing was changed." }, { status: 502 });
  }
}
