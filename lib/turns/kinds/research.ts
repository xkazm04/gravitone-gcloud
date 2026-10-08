// THE `research` TURN KIND — a topic in, a validated notebook on the record.
// SERVER ONLY. (AIO-A, stage 4a: research becomes a server-side turn kind.)
//
// The halves of what app/api/research/route.ts does inline, as the runner's
// spec (lib/turns/runner.ts):
//   · prepare  = the topic refusals (empty, over MAX_TOPIC_CHARS), raised as a
//                400 BEFORE a record exists. The prepared prompt is the one
//                the FIRST rung will be sent: the retrieval prompt when
//                TEXT_RETRIEVE is open, the reasoned one otherwise.
//   · dispatch = the retrieval rung first, only when the operator opened it,
//                with the route's fallback rule: reason only when no retrieval
//                engine was available (the availability kinds, or none
//                planned). A retrieval run that ran and failed answers as
//                itself and is never quietly re-billed as a reasoning run.
//                It goes through `retrieve()` and `reason()` and nothing else,
//                each carrying the turn's AbortSignal, so a cancel reaches
//                either engine's tree and each served turn books exactly one
//                spend row in the router. It reports back the prompt that
//                reached the engine, so `promptDigest` never covers a rung
//                that was not used.
//   · settle   = parseNotebook (and, for a retrieval run, the cross-check
//                against the run's receipts), returning the old 200 body —
//                `{ notebook, engine }`, with `engine.searched` derived from
//                the receipts on the retrieval rung and `false` on the other.
//
// A notebook that fails parseNotebook ends the turn `bad-response` with every
// `NotebookError.findings` entry on the record.
//
// REGISTERED ON IMPORT, replaceably — see the recalibrate kind for why.

import { crossCheckRetrieval, NotebookError, NOTEBOOK_SCHEMA, parseNotebook, RETRIEVE_NOTEBOOK_SCHEMA } from "@/lib/notebook/validate";
import { retrievalEnabled } from "@/lib/text/env";
import { TextError } from "@/lib/text/errors";
import { reason, retrieve } from "@/lib/text/router";
import type { RerouteStep, TextProvenance, TextResult } from "@/lib/text/types";
import { reasonPrompt, retrievePrompt, topicRefusal } from "@/lib/turns/assemble/research";
import { registerTurnKind, TurnInputError, type DispatchContext, type TurnSpec } from "@/lib/turns/runner";

export const RESEARCH_KIND = "research";

/** The topic refusals, with the route's own status and sentence. */
export class ResearchRefused extends TurnInputError {
  constructor(detail: string, status: 400 = 400) {
    super(detail, status, "bad-request");
    this.name = "ResearchRefused";
  }
}

/** The engine answered and what came back is not a notebook. The sentence is
 *  the route's own; `findings` carries every one of them. */
class NotebookRefused extends Error {
  constructor(
    message: string,
    readonly findings: string[],
  ) {
    super(message);
    this.name = "NotebookRefused";
  }
}

type Prepared = { topic: string; retrieval: boolean };

/** What dispatch tells settle: which rung served, and the retrieval candidates
 *  that dropped out first. */
type Via = { retrieved: boolean; trail: readonly RerouteStep[] };

export interface ResearchResult {
  notebook: unknown;
  engine: Record<string, unknown>;
}

/** The receipt block /api/research has always answered. */
function engineOf(p: TextProvenance, extra: Record<string, unknown>) {
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
    ...extra,
  };
}

/** The retrieval trail a refused `retrieve()` carried (router.ts puts it on
 *  `detail.trail`), or nothing. */
function trailOf(e: TextError): readonly RerouteStep[] {
  const d = e.detail as { trail?: unknown } | undefined;
  return Array.isArray(d?.trail) ? (d.trail as RerouteStep[]) : [];
}

export const RESEARCH_SPEC: TurnSpec<Prepared, ResearchResult> = {
  kind: RESEARCH_KIND,
  turn: "research",
  serialised: true,
  async prepare(raw) {
    const body = (raw && typeof raw === "object" ? raw : {}) as { topic?: unknown };
    const checked = topicRefusal(body.topic);
    if (!checked.ok) throw new ResearchRefused(checked.refusal.detail, checked.refusal.status);
    const { topic } = checked;
    // Read once, here: dispatch follows the decision the prompt was built for.
    // PromptUnavailable propagates as itself — a broken install, not a bad request.
    const retrieval = retrievalEnabled();
    return retrieval
      ? { prompt: await retrievePrompt(topic), schema: RETRIEVE_NOTEBOOK_SCHEMA, input: { topic, retrieval } }
      : { prompt: await reasonPrompt(topic), schema: NOTEBOOK_SCHEMA, input: { topic, retrieval } };
  },
  async dispatch({ prompt, schema, input, turn, signal }: DispatchContext<Prepared>) {
    let trail: readonly RerouteStep[] = [];
    if (input.retrieval) {
      let served: TextResult | null = null;
      try {
        served = await retrieve({ prompt, turn, schema, signal });
      } catch (e) {
        // Fall back to reasoning ONLY when no retrieval engine was available.
        if (!(e instanceof TextError) || !(e.reroutable || e.kind === "unsupported")) throw e;
        trail = trailOf(e);
      }
      if (served) return { served, prompt, via: { retrieved: true, trail } satisfies Via };
    }
    const reasoned = input.retrieval ? await reasonPrompt(input.topic) : prompt;
    const served = await reason({ prompt: reasoned, turn, schema: NOTEBOOK_SCHEMA, signal });
    return { served, prompt: reasoned, via: { retrieved: false, trail } satisfies Via };
  },
  settle(served, { topic }, via) {
    const { retrieved, trail } = (via ?? { retrieved: false, trail: [] }) as Via;
    try {
      // VALIDATED, NEVER TRUSTED — on both rungs, as the route always did.
      const parsed = parseNotebook(served.json ?? served.text, topic);
      if (retrieved) {
        const receipts = served.receipts ?? [];
        const checked = crossCheckRetrieval(parsed, receipts);
        return {
          notebook: checked.notebook,
          engine: engineOf(served.provenance, {
            // DERIVED, never set: a run is `searched` because it fetched something.
            searched: receipts.length > 0,
            sources: receipts,
            crossCheck: checked.findings,
          }),
        };
      }
      return {
        notebook: parsed,
        engine: engineOf(
          {
            ...served.provenance,
            // The retrieval candidates that dropped out lead the descent.
            reroutedFrom: trail.length ? [...trail, ...(served.provenance.reroutedFrom ?? [])] : served.provenance.reroutedFrom,
          },
          { searched: false },
        ),
      };
    } catch (e) {
      if (e instanceof NotebookError)
        throw new NotebookRefused(
          `The engine answered, and what came back does not satisfy NOTEBOOK-SCHEMA. ${e.message} Nothing was changed.`,
          e.findings,
        );
      throw e;
    }
  },
};

const G = globalThis as typeof globalThis & { __gravitoneResearchKind?: () => void };
G.__gravitoneResearchKind?.();
G.__gravitoneResearchKind = registerTurnKind(RESEARCH_SPEC as TurnSpec);
