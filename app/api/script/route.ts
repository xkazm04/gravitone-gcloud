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

import { readFile } from "node:fs/promises";
import path from "node:path";

import { guardRequest } from "@/lib/apiAuth";
import { TextError, statusFor } from "@/lib/text/errors";
import { reason } from "@/lib/text/router";
import {
  asNotebook,
  cardsInScope,
  COMPOSE_TEMPLATE_RANGES,
  composeSchema,
  DraftError,
  parseDraft,
  qualifyingEngines,
  templateBand,
  type ScopeRecord,
} from "@/lib/script/validate";
import type { Conclusion } from "@/app/_phases/_shared/notebook/conclusions";
import { sourceOf } from "@/app/_phases/_shared/notebook/source";
import { draftOf } from "@/app/_phases/script/draft";
import { gateDraft } from "@/app/_phases/script/gate";

export const runtime = "nodejs";
/** Up to three whole beat chains is the largest answer any turn writes. */
export const maxDuration = 800;

/** A prompt document that could not be read: the install is broken, nothing
 *  was reached, and the creator is not sent to check the model. */
class PromptUnavailable extends Error {}

const cache = new Map<string, string>();
async function doc(...parts: string[]): Promise<string> {
  const at = path.join(process.cwd(), ...parts);
  const hit = cache.get(at);
  if (hit !== undefined) return hit;
  try {
    const text = await readFile(at, "utf8");
    cache.set(at, text);
    return text;
  } catch {
    throw new PromptUnavailable(`The composition prompt could not be read from ${at}.`);
  }
}

/** The template's params, or null where the craft library measured none
 *  (free-form). Optional by design, unlike the prompt: absence is a fact about
 *  the template, said to the engine as NOT STATED. */
async function templateParams(template: string): Promise<string | null> {
  try {
    return await readFile(path.join(process.cwd(), "knowledge", "templates", template, "steps", "01-script", "params.json"), "utf8");
  } catch {
    return null;
  }
}

/** The turn band, when the params state one as `structure.turns.{min,max}`. */
function turnBandOf(params: string | null): [number, number] | null {
  if (!params) return null;
  try {
    const t = (JSON.parse(params) as { structure?: { turns?: { min?: unknown; max?: unknown } } }).structure?.turns;
    return typeof t?.min === "number" && typeof t?.max === "number" ? [t.min, t.max] : null;
  } catch {
    return null;
  }
}

/** The sections of ENGINES.md for the engines this run may use, plus the
 *  choosing/arbitration section — the catalogue entries the engine needs and
 *  not the ones it may not touch. Matched on the engine's label, which is how
 *  the catalogue's headings name them ("## A · Reversal Chain"). */
function engineSections(md: string, labels: string[]): string {
  const want = labels.map((l) => l.toLowerCase());
  return md
    .split(/^(?=## (?!#))/m)
    .filter((s) => {
      const head = s.split("\n", 1)[0]!.toLowerCase();
      return head.startsWith("## ") && (head.includes("choosing") || want.some((l) => head.includes(l)));
    })
    .join("\n");
}

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
  const denied = guardRequest(req);
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

  const notebook = asNotebook(body.notebook);
  if (!notebook) return bad("No readable notebook was sent, so there is nothing to compose from.");
  const template = typeof body.template === "string" ? body.template : "";
  if (!Object.prototype.hasOwnProperty.call(COMPOSE_TEMPLATE_RANGES, template))
    return bad(
      `Compose writes explainers (${Object.keys(COMPOSE_TEMPLATE_RANGES).join(", ")}); "${template}" is not one of them.`,
    );
  const targetS = typeof body.targetS === "number" ? body.targetS : NaN;
  const band = templateBand(template, targetS);
  if (!band) {
    const [lo, hi] = COMPOSE_TEMPLATE_RANGES[template]!;
    return bad(`A ${template} runs ${lo}–${hi}s; a target of ${String(body.targetS)}s is a clock no render can meet.`);
  }
  if (body.conclusions !== undefined && !Array.isArray(body.conclusions))
    return bad("`conclusions` must be a list.");
  const conclusions = (Array.isArray(body.conclusions) ? body.conclusions : []) as Conclusion[];
  if (!conclusions.every((c) => c && typeof c.id === "string" && typeof c.claim === "string" && Array.isArray(c.restsOn)))
    return bad("A conclusion was sent without an id, a claim and what it rests on.");
  const scope = (body.scope && typeof body.scope === "object" ? body.scope : {}) as ScopeRecord;
  const engines = Array.isArray(body.engines) ? body.engines.filter((e): e is string => typeof e === "string") : undefined;
  const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : "unassigned";

  // NOTHING QUALIFIES — said before any engine is paid to agree.
  const fits = qualifyingEngines(notebook, engines);
  if (!fits.length)
    return Response.json({
      refused: "no-engine-fits",
      why: engines?.length
        ? `None of the engines asked for (${engines.join(", ")}) is rated good or better by this notebook. Not a video in those shapes yet.`
        : "No engine in this notebook's engineFit is rated good or better, so the material has no shape to compose into yet — it is a topic. Find the tension, then compose.",
      considered: notebook.engineFit.map((e) => ({ engine: e.engine, fit: e.fit })),
    });

  const source = sourceOf(notebook, { conclusions });
  const { kept, known } = cardsInScope(source, scope);
  const takenOut = [...known].filter((id) => !kept.has(id));
  const schema = composeSchema(fits.map((e) => e.engine));
  const fitIds = new Set(fits.map((e) => e.engine));

  // BUILT INSIDE THE TRY, as in /api/recalibrate: the prompt documents are
  // files on disk, and a throw above the try is a bare 500 the client reads
  // as "the model could not be reached".
  try {
    const params = await templateParams(template);
    const turnBand = turnBandOf(params);
    const prompt = [
      await doc("pipeline", "SCRIPT-PROMPT.md"),
      "",
      "---",
      "",
      "# THE RUN",
      "",
      "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
      "",
      "## FORMAT",
      JSON.stringify({ template, targetS, band, turnBand }),
      "",
      "## TEMPLATE PARAMS",
      params ?? "NOT STATED — the craft library has measured nothing for this template. The band is all you have.",
      "",
      "## ENGINES YOU MAY USE",
      JSON.stringify(fits),
      "",
      engineSections(await doc("knowledge", "ENGINES.md"), fits.map((e) => e.label)),
      "",
      "## ENGINES YOU MAY NOT USE",
      JSON.stringify(notebook.engineFit.filter((e) => !fitIds.has(e.engine)).map((e) => ({ engine: e.engine, fit: e.fit }))),
      "",
      // engineFit travels above, as the engines; `sources` is a bibliography
      // no beat can cite (every fact carries its own `source`).
      "## NOTEBOOK",
      JSON.stringify({ ...notebook, engineFit: undefined, sources: undefined }),
      "",
      "## CONCLUSIONS IN SCOPE",
      JSON.stringify(conclusions.filter((c) => kept.has(c.id))),
      "",
      "## CONCLUSIONS NOT TAKEN",
      JSON.stringify(conclusions.filter((c) => !kept.has(c.id)).map((c) => c.id)),
      "",
      "## CARDS YOU MAY CITE",
      JSON.stringify([...kept]),
      "",
      "## CARDS TAKEN OUT",
      JSON.stringify(takenOut),
    ].join("\n");

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
    if (e instanceof PromptUnavailable)
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
