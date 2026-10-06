// THE `frames` TURN KIND — a script and a notebook in, scene direction on the
// record. SERVER ONLY. (AIO-A, stage 3: scene direction moves onto the ledger.)
//
// The same three halves as the recalibrate kind (./recalibrate.ts), taken from
// what app/api/frames/route.ts did inline:
//   · prepare  = the refusals (no beats, no style, too many, too large), the
//                AIO-B assembler, then the ASSEMBLED-size refusal — each a typed
//                input error carrying the status the route always answered, all
//                raised BEFORE a record exists.
//   · dispatch = the runner's own `reason()` call as `scene-direction`, with
//                the turn's AbortSignal, so a cancel reaches the engine's tree.
//                NO SCHEMA is handed to the router, for the reason the route
//                always gave: this turn's contract with its caller is `raw`, and
//                useFrames owns a parse that does more than schema-checking (it
//                reconciles `beatAt` against the script it sent). The schema
//                still travels inside the prompt.
//   · settle   = nothing to refuse here. The answer is kept as the engine's
//                text, with the manifest and the receipt beside it.
//
// THE RESULT IS THE OLD 200 BODY — `{ raw, manifest, engine }`. A client that
// reads a done record does exactly what it did with the synchronous response,
// and `?wait=1` answers the record's result verbatim.
//
// REGISTERED ON IMPORT, replaceably — see the recalibrate kind for why.

import type { TextProvenance } from "@/lib/text/types";
import { assembledRefusal, assembleFrames, framesRefusal, framesSystemPrompt, type FramesInput } from "@/lib/turns/assemble/frames";
import type { Refusal, TurnManifest } from "@/lib/turns/assemble/manifest";
import { registerTurnKind, TurnInputError, type TurnSpec } from "@/lib/turns/runner";

export const FRAMES_KIND = "frames";

/** A request the route refuses before dispatching anything, with the route's
 *  own status (413 too large, 400 nothing to direct). */
export class FramesRefused extends TurnInputError {
  constructor(readonly refusal: Refusal) {
    super(refusal.detail, refusal.status, refusal.code ?? "bad-request");
    this.name = "FramesRefused";
  }
}

export interface FramesResult {
  /** The engine's text, untouched. */
  raw: string;
  manifest: TurnManifest;
  engine: ReturnType<typeof framesEngineOf>;
}

/** The receipt block /api/frames has always answered — its own key set, which
 *  is narrower than recalibrate's and is what the Frames step reads. */
export function framesEngineOf(p: TextProvenance) {
  return {
    kind: p.transport === "local-subprocess" ? "local-claude-code" : "cloud-api",
    provider: p.provider,
    model: p.model,
    rung: p.rung,
    sessionId: p.sessionId,
    costUsd: p.costUsd,
    costBasis: p.costBasis,
    durationMs: p.durationMs,
    reroutedFrom: p.reroutedFrom,
  };
}

type Prepared = { manifest: TurnManifest };

export const FRAMES_SPEC: TurnSpec<Prepared, FramesResult> = {
  kind: FRAMES_KIND,
  turn: "scene-direction",
  serialised: true,
  async prepare(raw) {
    const body = (raw && typeof raw === "object" ? raw : {}) as FramesInput;
    // No beats, no style, then COUNTS — an oversized run is refused before a
    // megabyte of it is serialised into a prompt.
    const refused = framesRefusal(body);
    if (refused) throw new FramesRefused(refused);
    // A missing prompt file throws its raw read error, as the route's inline
    // read always did: a broken install, not a bad request.
    const { prompt, manifest } = assembleFrames(body, await framesSystemPrompt());
    // The ASSEMBLED size is the one that is billed.
    const tooBig = assembledRefusal(manifest);
    if (tooBig) throw new FramesRefused(tooBig);
    return { prompt, input: { manifest } };
  },
  settle(served, { manifest }) {
    return { raw: served.text, manifest, engine: framesEngineOf(served.provenance) };
  },
};

const G = globalThis as typeof globalThis & { __gravitoneFramesKind?: () => void };
G.__gravitoneFramesKind?.();
G.__gravitoneFramesKind = registerTurnKind(FRAMES_SPEC as TurnSpec);
