// POST /api/script — a notebook in, up to three GATED candidate renders out.
//
// The script step's missing verb. Until this route nothing in the app wrote a
// script: the three renders were transcribed from one 2026-08-11 terminal run,
// and /api/recalibrate's only verbs are edits over renders that already exist.
// This turn reads the creator's own notebook, the cards they kept, the
// project's template and clock, and the engines the notebook itself rated as
// fitting — and composes candidates a person can duel, adopt and recalibrate.
//
// The shape is /api/recalibrate's, on purpose: guarded before anything is read
// or spawned, the prompt read from disk, the engine named by TURN through
// `reason({turn:"compose"})`, and the same three named failures in the catch.
// Read that route's header for why the engine is whichever one the deployment
// has, and why the schema is a request on one rung and a guarantee on the
// other — none of it changes here.
//
// TWO VERDICTS, KEPT APART:
//   · `parseDraft` (lib/script/validate.ts) holds the answer to the notebook it
//     was composed from — scope, the connector law, the clock, the engine. A
//     violation refuses the WHOLE answer (502), naming render, mark and card.
//   · The gate (script/gate.ts::gateDraft) then runs server-side on every
//     candidate that cleared it, and its report travels back beside the draft.
//     A blocked candidate is RETURNED, blocked — that is the gate's existing
//     contract on Step 2, where a violation stops an accept, not a read.
//
// NO ENGINE FITS IS AN ANSWER (ENGINES.md § Arbitration, "not a video yet").
// When the notebook rates nothing "good" or better the route says so with a
// 200 and `{refused:"no-engine-fits"}` BEFORE any engine is paid to agree; the
// engine may return the same refusal on a hazard the fit scalar cannot see.
// Either way no draft travels back, so none can be written.

import { guardRequest } from "@/lib/apiAuth";
import { TextError, statusFor } from "@/lib/text/errors";
import { reason } from "@/lib/text/router";
import { admitCompose, ComposePromptUnavailable, composePrompt } from "@/lib/script/compose";
import { DraftError, parseDraft } from "@/lib/script/validate";
import { draftOf } from "@/app/_phases/script/draft";
import { gateDraft } from "@/app/_phases/script/gate";

export const runtime = "nodejs";
/** Up to three whole beat chains is the largest answer any turn writes. */
export const maxDuration = 800;

// The prompt assembly and the admission refusals live in lib/script/compose.ts (lifted for the
// script producer, Phase 4 L37): one turn, two callers.

type Loose = Record<string, unknown>;

const bad = (detail: string) => Response.json({ detail }, { status: 400 });

/** The most material one run is sent, in serialised characters: roughly a
 *  quarter of a million tokens, far past any real notebook and far short of an
 *  800-second Opus run nobody authorised. The same ceiling /api/frames holds. */
const MAX_RUN_CHARS = 1_000_000;

/** Why this run's material is too large, or `null`. A pure predicate so the
 *  negative case can be asked without dispatching a run. */
export function tooLarge(body: Record<string, unknown>): string | null {
  const sizes = (["notebook", "conclusions", "scope", "engines"] as const).map((k) => [k, jsonSize(body[k])] as const);
  const total = sizes.reduce((n, [, s]) => n + s, 0);
  if (total <= MAX_RUN_CHARS) return null;
  const [biggest] = [...sizes].sort((a, b) => b[1] - a[1])[0]!;
  const shown = Number.isFinite(total) ? `${Math.round(total / 1000)}k characters` : "unserialisable";
  return `The run's material is ${shown} (largest: ${biggest}); the ceiling is ${MAX_RUN_CHARS / 1000}k. Nothing was dispatched.`;
}

function jsonSize(v: unknown): number {
  if (v === undefined || v === null) return 0;
  try {
    return JSON.stringify(v)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY; // circular: refuse it
  }
}

export async function POST(req: Request) {
  // LOCAL-COMPUTE ROUTE — auth + rate limit before anything is read or spawned.
  const denied = await guardRequest(req);
  if (denied) return denied;

  let body: Loose;
  try {
    body = (await req.json()) as Loose;
  } catch {
    return bad("Request body was not valid JSON.");
  }
  if (!body || typeof body !== "object") return bad("Request body was not an object.");
  const oversized = tooLarge(body);
  if (oversized) return Response.json({ detail: oversized, code: "too-large" }, { status: 413 });

  const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : "unassigned";
  const admitted = admitCompose(body);
  // NOTHING QUALIFIES — said before any engine is paid to agree.
  if (admitted.kind === "refused") return Response.json({ refused: "no-engine-fits", why: admitted.why, considered: admitted.considered });
  if (admitted.kind === "bad") return bad(admitted.detail);
  const { source, scope, template, targetS, engines, schema } = admitted.run;

  // BUILT INSIDE THE TRY, as in /api/recalibrate: the prompt documents are
  // files on disk, and a throw above the try is a bare 500 the client reads
  // as "the model could not be reached".
  try {
    const { prompt, turnBand } = await composePrompt(admitted.run);
    const run = await reason({ prompt, turn: "compose", schema });
    const outcome = parseDraft(run.text, { source, scope, template, targetS, engines, turnBand });

    const receipt = {
      kind: run.provenance.transport === "local-subprocess" ? "local-claude-code" : "cloud-api",
      provider: run.provenance.provider,
      model: run.provenance.model,
      rung: run.provenance.rung,
      transport: run.provenance.transport,
      schemaEnforcement: run.provenance.schemaEnforcement,
      reroutedFrom: run.provenance.reroutedFrom,
      sessionId: run.provenance.sessionId,
      costUsd: run.provenance.costUsd,
      costBasis: run.provenance.costBasis,
      durationMs: run.provenance.durationMs,
      promptChars: run.provenance.promptChars,
    };

    if (outcome.kind === "refused")
      return Response.json({ refused: outcome.refused, why: outcome.why, engine: receipt });

    const draft = draftOf(outcome.renders, { projectId, source });
    return Response.json({
      draft,
      // Per candidate, server-side, against the notebook it was written from.
      gate: gateDraft(draft.renders, source, draft),
      // What the laws measured and did not refuse: undeclared links, the
      // per-render connector tally. Shown, never silently passed.
      findings: outcome.findings,
      engine: receipt,
    });
  } catch (e) {
    if (e instanceof ComposePromptUnavailable)
      return Response.json(
        { detail: `${e.message} The engine was never started, so nothing was composed.` },
        { status: 500 },
      );

    if (e instanceof DraftError)
      // The engine ran and returned something this app will not show as a
      // candidate. Every finding is named, so the creator — or the next
      // prompt edit — can see which law broke and where.
      return Response.json(
        { detail: `The engine returned scripts this app cannot use: ${e.message} Nothing was composed.`, findings: e.findings },
        { status: 502 },
      );

    if (e instanceof TextError)
      return Response.json(
        { detail: `${e.message} Nothing was composed.`, code: e.kind },
        { status: statusFor(e.kind) },
      );

    console.error("[script]", e);
    return Response.json({ detail: "The composition failed. Nothing was composed." }, { status: 502 });
  }
}
