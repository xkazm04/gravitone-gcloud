// THE `recalibrate` TURN KIND — notes in, a validated edit plan on the record.
// SERVER ONLY. (AIO-A, stage 2: recalibrate moves onto the ledger.)
//
// The three halves of what app/api/recalibrate/route.ts used to do inline, as
// the runner's spec (lib/turns/runner.ts):
//   · prepare  = the refusals, then the AIO-B assembler. A refusal is a typed
//                input error carrying the status the route always answered
//                (413 too large, 400 no notes), raised BEFORE a record exists.
//   · dispatch = the runner's own `reason()` call, with the turn's AbortSignal,
//                so a cancel reaches the engine's process tree.
//   · settle   = parseEditPlan, then the stray and blind guards over the scope
//                the manifest decided. A refusal throws the sentence the route
//                always answered 502 with, so the failed record carries it.
//
// THE RESULT IS THE OLD 200 BODY — `{ plan, manifest, engine }`. A client that
// reads a done record stages exactly what it staged from the synchronous
// response, receipt included, and `?wait=1` answers the record's result
// verbatim. One shape, two transports.
//
// REGISTERED ON IMPORT, replaceably. Both routes that can start one import this
// module; a dev-server module reload re-evaluates it, and the handle on
// globalThis lets the new spec replace the old one rather than throw "already
// registered" at the second evaluation.

import { EDIT_PLAN_SCHEMA, PlanError, parseEditPlan, type EditPlan } from "@/app/_phases/script/editPlan";
import type { TextProvenance } from "@/lib/text/types";
import type { Refusal, TurnManifest } from "@/lib/turns/assemble/manifest";
import {
  assembleRecalibrate,
  blindConclusions,
  recalibrateRefusal,
  recalibrateSystemPrompt,
  rendersOf,
  strayRenders,
  type RecalibrateInput,
} from "@/lib/turns/assemble/recalibrate";
import { registerTurnKind, TurnInputError, type TurnSpec } from "@/lib/turns/runner";

export const RECALIBRATE_KIND = "recalibrate";

/** A request the route refuses before assembling anything, with the route's
 *  own status. The generic /api/turns door answers any TurnInputError 400;
 *  /api/recalibrate answers `refusal` exactly as it always has. */
export class RecalibrateRefused extends TurnInputError {
  constructor(readonly refusal: Refusal) {
    super(refusal.detail);
    this.name = "RecalibrateRefused";
  }
}

/** The engine answered and the plan was refused. Its message is the whole
 *  sentence the creator reads; `findings` names the offending ids. */
class PlanRefused extends Error {
  constructor(
    message: string,
    readonly findings: string[] = [],
  ) {
    super(message);
    this.name = "PlanRefused";
  }
}

export interface RecalibrateResult {
  plan: EditPlan;
  manifest: TurnManifest;
  engine: ReturnType<typeof engineOf>;
}

/** The receipt block the route has always answered. `kind` keeps its
 *  two-value shape for the client that reads it; the rest is additive. */
export function engineOf(p: TextProvenance) {
  return {
    kind: p.transport === "local-subprocess" ? "local-claude-code" : "cloud-api",
    provider: p.provider,
    model: p.model,
    rung: p.rung,
    transport: p.transport,
    schemaEnforcement: p.schemaEnforcement,
    reroutedFrom: p.reroutedFrom,
    sessionId: p.sessionId,
    costUsd: p.costUsd,
    costBasis: p.costBasis,
    durationMs: p.durationMs,
    promptChars: p.promptChars,
  };
}

type Prepared = { renders: ReturnType<typeof rendersOf>; manifest: TurnManifest };

export const RECALIBRATE_SPEC: TurnSpec<Prepared, RecalibrateResult> = {
  kind: RECALIBRATE_KIND,
  turn: "edit-plan",
  serialised: true,
  async prepare(raw) {
    const body = (raw && typeof raw === "object" ? raw : {}) as RecalibrateInput;
    const refused = recalibrateRefusal(body);
    if (refused) throw new RecalibrateRefused(refused);
    // PromptUnavailable propagates as itself: a broken install, not a bad
    // request, and the route names it as one.
    const { prompt, manifest } = assembleRecalibrate(body, await recalibrateSystemPrompt());
    // THE SCHEMA IS HANDED TO THE ENGINE, not only written into the prompt. On
    // the local rung the router appends the same demand and validates on the
    // way back; on the cloud rung it is real enforcement. parseEditPlan below
    // stays authoritative either way.
    return { prompt, schema: EDIT_PLAN_SCHEMA, input: { renders: rendersOf(body), manifest } };
  },
  settle(served, { renders, manifest }) {
    let plan: EditPlan;
    try {
      plan = parseEditPlan(served.text, { renders });
    } catch (e) {
      // The engine ran and returned something unusable. Say which: the fix is
      // a prompt change, not a retry.
      if (e instanceof PlanError) throw new PlanRefused(`The engine returned a plan this app cannot use: ${e.message} Nothing was changed.`);
      throw e;
    }
    // A plan may only name material that was sent — checked against the
    // manifest that scoped THIS run (forced renders included), not the render
    // table, which still holds all three. Refused wholesale: an edit aimed at a
    // chain the engine never read is a guess.
    const stray = strayRenders(plan.edits, manifest);
    if (stray.length)
      throw new PlanRefused(
        `The engine returned edits for renders it was not given (${stray.join(", ")}), so it was editing a beat chain it could not read. Nothing was changed.`,
        stray,
      );
    // Same rule, other axis: a beat may not rest on a conclusion whose text
    // this run withheld. A NAME is not the card, and a beat's `cards` is what
    // every coverage number is recomputed from.
    const blind = blindConclusions(plan.edits, manifest);
    if (blind.length)
      throw new PlanRefused(
        `The engine declared beats resting on conclusions whose text it was not sent (${blind.join(", ")}). Those are out of scope, so no beat may rest on them, and it had only their names. Nothing was changed.`,
        blind,
      );
    return { plan, manifest, engine: engineOf(served.provenance) };
  },
};

const G = globalThis as typeof globalThis & { __gravitoneRecalibrateKind?: () => void };
G.__gravitoneRecalibrateKind?.();
G.__gravitoneRecalibrateKind = registerTurnKind(RECALIBRATE_SPEC as TurnSpec);
