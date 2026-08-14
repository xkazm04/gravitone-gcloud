// POST /api/recalibrate — notes in, an EDIT PLAN out.
//
// The engine is a LOCAL CLAUDE CODE PROCESS, driven headlessly (`lib/claudeCli.ts`).
// It authenticates with the machine's logged-in subscription, so there is no API
// key anywhere in this app — not in the environment, not in a vault, not in a
// browser bundle. That is the whole reason for this shape.
//
// The seam is still a route handler rather than a fetch from the pad, for a
// different reason than before: a browser cannot spawn a process either.
//
// Two costs of the CLI engine over the SDK, both real, both paid deliberately:
//   1. No `output_config.format`, so the plan's shape is a REQUEST, not a
//      guarantee — `parseEditPlan` validates and rejects rather than trusting.
//   2. No cross-call prompt caching, so each run re-reads the whole notebook.
//      Runs are minutes either way; this is a cost line, not a latency one.
//
// Which is why the prompt is BUILT rather than forwarded. There is no cache to
// amortise a payload nobody reads, so every character that cannot change the
// answer is bought once per run, at Opus-5-at-high-effort prices. Two cuts, both
// below, both stated as what they are: the notebook slices no beat can cite, and
// the renders these notes cannot reach.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CliError, runClaude } from "@/lib/claudeCli";
import { MODEL } from "@/lib/model";
import { EDIT_PLAN_SCHEMA, PlanError, parseEditPlan } from "@/app/_phases/script/editPlan";
import { ATTRIBUTION } from "@/app/_phases/script/impact";
import { RENDER_BY_ID } from "@/app/_phases/script/renders";

export const runtime = "nodejs";
/** A real run is minutes. Give the handler room rather than truncating it. */
export const maxDuration = 800;

let cachedPrompt: string | null = null;
async function systemPrompt(): Promise<string> {
  // A versioned document beside the research prompt, not a string literal here —
  // it is edited far more often than this handler is.
  if (!cachedPrompt)
    cachedPrompt = await readFile(path.join(process.cwd(), "pipeline", "RECALIBRATE-PROMPT.md"), "utf8");
  return cachedPrompt;
}

/* ------------------------------------------- what the run can actually act on */

/** Notebook slices no beat can ever cite, so no edit can rest on them.
 *
 *  A beat declares `cards`, and a card is a fact, a mechanism, a reversal, a
 *  conclusion or the steel-man (`_shared/notebook/cards.ts`). Every one of those
 *  slices stays, in full, because `more-focus` may bring in material no render
 *  currently speaks. What goes:
 *    · engineFit — which engine suits this material. The three renders already
 *      exist; this run edits them, it does not choose between engines.
 *    · sources   — a bibliography. Not a card, so nothing can cite it, and every
 *      fact already carries its own `source` field.
 *
 *  Everything else stays even where it only INFORMS writing — analogyCandidates,
 *  scaleConversions, currency, counterPositions, researchGaps — because a
 *  rewrite that cannot see the sanctioned analogy invents one, and inventing is
 *  the single thing RECALIBRATE-PROMPT.md forbids absolutely. */
const NOTEBOOK_DROP = ["engineFit", "sources"];

/** Render keys no edit op writes.
 *
 *  `checks` is the render's own craft self-check table. Nothing in the plan
 *  produces or consumes it, the app recomputes nothing from it, and its one
 *  genuinely actionable row — a turn cadence deliberately stacked out of band —
 *  is repeated verbatim in `deviations`, which stays. */
const RENDER_DROP = ["checks"];

type Loose = Record<string, unknown>;

const without = (o: unknown, keys: string[]): unknown => {
  if (!o || typeof o !== "object") return o;
  const out = { ...(o as Loose) };
  for (const k of keys) delete out[k];
  return out;
};

/** Does this render's baseline say anything about this card? Either it speaks it
 *  in a beat, or it recorded a deliberate decision to cut it — a `more-focus`
 *  note can legitimately reverse the second. */
function touches(renderId: string, cardId: string): boolean {
  if (Object.values(ATTRIBUTION[renderId] ?? {}).some((ids) => ids.includes(cardId))) return true;
  return (RENDER_BY_ID[renderId]?.cutFacts ?? []).some((c) => c.factId === cardId);
}

/** Which renders these notes can reach.
 *
 *  `less-focus`, `descope`, `move-earlier` and `move-later` all ask for a change
 *  to a beat that already carries the card. A render with no such beat has
 *  nothing to retime, cut or move — sending its whole chain buys prose the
 *  request cannot act on. `more-focus` reaches everything only when NO render
 *  carries the card, which is exactly what the note's own hint promises: "give
 *  it more of the runtime — or bring it in if no render uses it". `custom` is
 *  free text, read literally, so it reaches everything.
 *
 *  Fails open in every ambiguous case, and an empty result means "everything" —
 *  the saving is never worth a run that could not answer the note. */
function rendersInScope(ids: string[], notes: unknown[]): Set<string> {
  const all = new Set(ids);
  const out = new Set<string>();
  for (const raw of notes) {
    const n = (raw ?? {}) as Loose;
    const cardId = typeof n.cardId === "string" ? n.cardId : null;
    const kind = typeof n.kind === "string" ? n.kind : "custom";
    if (!cardId || kind === "custom") return all;
    const hit = ids.filter((id) => touches(id, cardId));
    if (!hit.length) {
      if (kind === "more-focus") return all; // it could be brought into any of them
      continue; // inert — there is no beat anywhere for it to change
    }
    for (const id of hit) out.add(id);
  }
  return out.size ? out : all;
}

export async function POST(req: Request) {
  let body: { notebook?: unknown; renders?: unknown; scope?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ detail: "Request body was not valid JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.notes) || body.notes.length === 0)
    return Response.json({ detail: "No notes were sent, so there is nothing to recalibrate." }, { status: 400 });

  const allRenders = Array.isArray(body.renders) ? (body.renders as Loose[]) : [];
  const ids = allRenders.map((r) => String(r.id));
  const inScope = rendersInScope(ids, body.notes);
  const sent = allRenders.filter((r) => inScope.has(String(r.id))).map((r) => without(r, RENDER_DROP));
  // Named, never hidden: the engine has to know these exist so it does not
  // reason as though the project has one render, and the creator has to be able
  // to tell "left alone" from "never looked at".
  const notSent = allRenders
    .filter((r) => !inScope.has(String(r.id)))
    .map((r) => ({ id: r.id, engineLabel: r.engineLabel, durationS: r.durationS }));

  // Everything goes down stdin. The notebook and three beat chains are far past
  // any platform's command-line argument limit, and on Windows that limit fails
  // as a truncated argument rather than an error — a silent corruption of the
  // one input the whole run depends on.
  const prompt = [
    await systemPrompt(),
    "",
    "---",
    "",
    "# THE RUN",
    "",
    "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
    "It must satisfy this schema:",
    "",
    JSON.stringify(EDIT_PLAN_SCHEMA, null, 2),
    "",
    "## NOTEBOOK",
    JSON.stringify(without(body.notebook, NOTEBOOK_DROP)),
    "",
    "## CURRENT RENDERS",
    JSON.stringify(sent),
    ...(notSent.length
      ? [
          "",
          "## RENDERS NOT SENT",
          "No beat in these rests on a card the notes name, so their beat chains are not",
          "included in this run. You cannot edit what you cannot see: emit NO edit whose",
          "`renderId` is one of these — a plan that names one is rejected wholesale.",
          JSON.stringify(notSent),
        ]
      : []),
    "",
    "## SCOPE (cards the creator has taken out)",
    JSON.stringify(body.scope),
    "",
    "## NOTES",
    JSON.stringify(body.notes, null, 2),
  ].join("\n");

  try {
    const run = await runClaude(prompt);
    const plan = parseEditPlan(run.text);

    // A plan may only name material that was sent. `parseEditPlan` checks the
    // id against the render TABLE, which still holds all three — so the check
    // that the id was in THIS request belongs here, beside the decision that
    // scoped it. Refused wholesale rather than filtered: an edit aimed at a
    // chain the engine never read is a guess, and applying the rest of a plan
    // built around that guess is worse than running again.
    const stray = [...new Set(plan.edits.map((e) => e.renderId).filter((id) => !inScope.has(id)))];
    if (stray.length)
      return Response.json(
        {
          detail: `The engine returned edits for renders it was not given (${stray.join(", ")}), so it was editing a beat chain it could not read. Nothing was changed.`,
        },
        { status: 502 },
      );
    // The receipt travels with the plan. A run that took minutes and cost real
    // money and could tell the creator neither was the defect; the client keeps
    // this on the version it stages, so what a version cost survives with it.
    return Response.json({
      plan,
      engine: {
        kind: "local-claude-code",
        model: MODEL,
        sessionId: run.sessionId,
        costUsd: run.costUsd,
        durationMs: run.durationMs,
        promptChars: prompt.length,
      },
    });
  } catch (e) {
    if (e instanceof PlanError)
      // The engine ran and returned something unusable. Say which, because the
      // fix is a prompt change, not a retry.
      return Response.json(
        { detail: `The engine returned a plan this app cannot use: ${e.message} Nothing was changed.` },
        { status: 502 },
      );

    if (e instanceof CliError) {
      const status = e.kind === "not-installed" || e.kind === "not-logged-in" ? 503 : 504;
      return Response.json({ detail: `${e.message} Nothing was changed.`, code: e.kind }, { status });
    }

    console.error("[recalibrate]", e);
    return Response.json({ detail: "The recalibration failed. Nothing was changed." }, { status: 502 });
  }
}
