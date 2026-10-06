// POST /api/frames — a script and a notebook in, SCENE SPECS out.
//
// This is the step's centre of gravity. Everything else in Step 3 is plumbing;
// the difference between a video and a narrated slide deck is made here, by a
// model that has read the whole script and is asked to art-direct it.
//
// Why it exists at all: the first cut of this step derived each plate's subject
// from a lookup table keyed on the beat's rhetorical KIND — nine roles, nine
// canned compositions. It was fast, deterministic, and produced exactly the
// deck it deserved: every `movement` beat got the same cycle diagram whatever
// the movement was about. A template per slide type IS PowerPoint. The fix is
// not a better table.
//
// THE ENGINE IS WHICHEVER ONE THIS DEPLOYMENT HAS (`lib/text/router.ts`).
//
// It used to be the local Claude CLI, named here and imported directly. It still
// IS the local CLI on a machine that has one — that is rung 1 of the ladder and
// the app's default posture — but this handler no longer knows or cares. It
// states the TURN (`scene-direction`) and the shape it needs back, and the
// chokepoint decides which engine can serve it here: the operator's seat on a
// laptop, a metered Gemini key on Cloud Run, an honest refusal naming every
// candidate when neither is available.
//
// The reason that mattered enough to change a working route: `spawn("claude")`
// cannot happen on a managed platform, so this handler — the centre of gravity
// of Step 3 — was the single thing standing between this app and running as a
// hosted service at all.
//
// WHICH ENGINE SERVED TRAVELS WITH THE ANSWER, in `engine` below, and always
// did: this route already returned a receipt. What is new is that the receipt
// can now say something other than "local-claude-code", and it is the router
// that fills it in rather than a string literal here that could go stale.

import { guardRequest } from "@/lib/apiAuth";
import { TextError, statusFor } from "@/lib/text/errors";
import { reason } from "@/lib/text/router";
import {
  assembledRefusal,
  assembleFrames,
  framesRefusal,
  framesSystemPrompt,
  type FramesInput,
} from "@/lib/turns/assemble/frames";
import { refusalResponse } from "@/lib/turns/assemble/manifest";

/** The size predicate lives with the assembler (lib/turns/assemble/frames.ts,
 *  which carries the bounds and why they exist); re-exported so the probes that
 *  ask it here (frames-run-bounded) keep asking the route. */
export { tooLarge } from "@/lib/turns/assemble/frames";

export const runtime = "nodejs";
/** Sixteen art-direction decisions over a whole script is minutes, not seconds. */
export const maxDuration = 800;

export async function POST(req: Request) {
  // Local-compute route (spends the machine's Claude subscription) — auth +
  // rate limit before anything is read or dispatched.
  const denied = guardRequest(req);
  if (denied) return denied;

  // `template` and `targetS` are the project record's own two format fields;
  // lib/turns/assemble/frames.ts::FramesInput says why a run may omit them.
  let body: FramesInput;
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  // No beats, no style, then COUNTS — so an oversized run is refused before a
  // megabyte of it is serialised into a prompt, and the refusal can name which
  // part was too big.
  const refused = framesRefusal(body);
  if (refused) return refusalResponse(refused);

  // ASSEMBLY, then the ASSEMBLED size: that is the one that is billed, and it
  // carries the system prompt and the format brief on top of what the caller
  // sent. Assembly and dispatch stay two steps, so AIO-A's turn runner can take
  // the dispatch without moving the assembly.
  const { prompt, manifest } = assembleFrames(body, await framesSystemPrompt());
  const tooBig = assembledRefusal(manifest);
  if (tooBig) return refusalResponse(tooBig);

  try {
    // The schema is NOT passed to the engine as `schema` here, deliberately.
    // This route's contract with its caller is `raw` — useFrames.ts owns the
    // parse, and it does more than schema-checking (it reconciles `beatAt`
    // against the script it sent). Handing the router a schema would make it
    // validate and populate `json` that nobody reads, and on the cloud rung it
    // would additionally constrain decoding to a translated subset of a schema
    // this handler received as opaque JSON from the client. The schema still
    // travels — inside the prompt, above — which is where it always did.
    const run = await reason({ prompt, turn: "scene-direction" });
    return Response.json({
      raw: run.text,
      // What the engine read, as the assembler built it: block sizes, never
      // text. Additive — useFrames reads `raw` and is unaffected.
      manifest,
      // The receipt now names the rung and the transport. A creator whose
      // prompt crossed the network to a vendor is entitled to see that, and a
      // cloud answer that rendered indistinguishably from a local one is the
      // one thing the ladder may never do.
      engine: {
        kind: run.provenance.transport === "local-subprocess" ? "local-claude-code" : "cloud-api",
        provider: run.provenance.provider,
        model: run.provenance.model,
        rung: run.provenance.rung,
        sessionId: run.provenance.sessionId,
        costUsd: run.provenance.costUsd,
        costBasis: run.provenance.costBasis,
        durationMs: run.provenance.durationMs,
        reroutedFrom: run.provenance.reroutedFrom,
      },
    });
  } catch (e) {
    // One taxonomy, one status map (lib/text/errors.ts). This handler used to
    // carry its own copy of the status decision, as did /api/recalibrate — two
    // copies with no third place that owned them.
    if (e instanceof TextError)
      return Response.json(
        { detail: `${e.message} Nothing was changed.`, code: e.kind },
        { status: statusFor(e.kind) },
      );
    console.error("[frames]", e);
    return Response.json({ detail: "The scene direction failed. Nothing was changed." }, { status: 502 });
  }
}
