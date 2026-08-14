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
// answer is bought once per run, at Opus-5-at-high-effort prices. THREE cuts,
// all below, all stated as what they are: the notebook slices no beat can cite,
// the renders these notes cannot reach, and the conclusions no edit may rest on.
// The last two share a shape — NAMED, never hidden, and a plan that acts on one
// is refused wholesale — because a payload that silently omits material teaches
// the engine to reason about a notebook it was not given.
//
// And TWO ADDITIONS, which cost more than those cuts saved and are worth it,
// because both were the payload failing to carry what the prompt claimed it did:
//   · THE ATTRIBUTION. § WHAT YOU RECEIVE promised each beat's `cards`, and the
//     payload never sent them — so the engine invented the one field every
//     coverage number, spend bar and track weight is recomputed from.
//   · THE CONCLUSIONS. They are not in the `Notebook` object by design, so a
//     payload built by dropping keys from it contained none — and a note on a
//     `c-*` card named a card the engine had never read.
// The rule both break is the same one: a prompt that describes a payload it did
// not receive buys a confident answer to a question nobody asked. Tokens that
// make the matrix true beat tokens saved making it fiction — which is also why
// the third cut sends every conclusion whole the moment a note, a beat or the
// creator's scope can reach one.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CliError, runClaude } from "@/lib/claudeCli";
import { MODEL } from "@/lib/model";
import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
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
 *  conclusion or the steel-man (`_shared/notebook/cards.ts`). Four of those five
 *  live in this object and stay in it, in full, because `more-focus` may bring in
 *  material no render currently speaks. The fifth does not live here at all:
 *  conclusions are a separate export and are sent in their own block below —
 *  this comment used to claim otherwise while the payload shipped none. What
 *  goes:
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

/** THE ATTRIBUTION THE PROMPT PROMISES.
 *
 *  § WHAT YOU RECEIVE told the engine that every beat carries "the notebook card
 *  ids it rests on". It did not. `ATTRIBUTION` was imported for `touches()`
 *  below and then never transmitted — so on every rewrite the engine GUESSED the
 *  one field the app recomputes the whole matrix from (`impactFrom`), while
 *  being told it had been handed it.
 *
 *  `null`, never `[]`, where the app has no row. The table is hand-authored
 *  against each render's text (impact.ts) and records the beats that STATE a
 *  claim; hooks, questions, promises and closes usually state none. But "no row
 *  in a hand-authored table" is a different fact from "rests on nothing", and an
 *  empty array asserts the second. The prompt says which is which rather than
 *  letting the engine pick.
 *
 *  It is the FIXTURE attribution, deliberately: `recalibrateFromPlan` applies
 *  the returned plan against `ATTRIBUTION_OF(renderId)`, so the base the engine
 *  reads is the same document the app will edit. */
function withAttribution(r: Loose): Loose {
  const marks = ATTRIBUTION[String(r.id)] ?? {};
  const beats = Array.isArray(r.beats) ? (r.beats as Loose[]) : [];
  return {
    ...r,
    beats: beats.map((raw) => {
      const b = (raw ?? {}) as Loose;
      return { ...b, cards: marks[String(b.at)] ?? null };
    }),
  };
}

/** THE CONCLUSIONS, WITH THE ONE BIT THE SCOPE RECORD CANNOT SAY.
 *
 *  They are not in `Notebook` and must not be: a conclusion is reasoned rather
 *  than researched, it has no source, and filing it beside the sourced facts is
 *  precisely what conclusions.ts exists to prevent. So they travel BESIDE the
 *  notebook, in their own block, with that separation intact — which is also the
 *  one of the two shapes `types.ts` sanctions for a consumer paying this cost.
 *
 *  `inScope` is computed here rather than left to the engine to infer, because
 *  the sign is invisible in the SCOPE record: a conclusion is OUT until the
 *  creator takes it, so a `c-*` id absent from that record is descoped, while an
 *  `f-*` id absent from it is kept (`research/scope.ts::OPT_IN_DEFAULT`, which
 *  owns this rule). That module is `"use client"` and cannot be imported into a
 *  route handler, so the rule is restated in one expression with its owner
 *  named. The alternative is a payload whose sign the engine has to guess, which
 *  is the defect this whole change exists to close.
 *
 *  Out-of-scope conclusions are NAMED even when they are not sent, and that is
 *  not a hole: rule 4 forbids speaking them, and a note CAN be written on one —
 *  refusing a note about a card the engine never read is how this went wrong the
 *  first time. See `splitConclusions` for what "named" means and what it costs. */
function conclusionsFor(scope: unknown) {
  const rec = (scope && typeof scope === "object" ? scope : {}) as Record<string, { descoped?: boolean } | undefined>;
  return CONCLUSIONS.map((c) => ({ ...c, inScope: rec[c.id]?.descoped === false }));
}

type ScopedConclusion = ReturnType<typeof conclusionsFor>[number];

/** WHICH CONCLUSIONS THIS RUN CAN ACT ON.
 *
 *  e225446 measured the conclusions block at 8,613 characters of a 40,384-char
 *  prompt, and every conclusion is `optIn: true` — so the common case shipped
 *  ~8.6KB of synthesis the note could not touch, on every run, at Opus-5 prices.
 *  This is the same cut `RENDERS NOT SENT` makes one section down, and it is
 *  made with the same care: NAMED, never hidden, and refused if acted on.
 *
 *  A conclusion travels WHOLE — claim, reasoning, precedent, falsifier, the lot
 *  — if ANY of these is true. They are ORs, and each one is a way the engine
 *  could legitimately need to read it:
 *
 *    · `inScope` — the creator took it. It may be given a beat, so it must be
 *      readable. This is the whole worst case: take every conclusion and the
 *      payload is byte-identical to what it was before this change.
 *    · A NOTE NAMES IT. A note on a `c-*` card is answered against the card, and
 *      "refusing a note about a card the engine never read" is the exact defect
 *      e225446 closed. Nothing here reopens it.
 *    · ANY note is `custom`. Free text is read literally and may name a
 *      conclusion in prose with no `cardId` to match on, so one custom note
 *      sends every conclusion whole. `rendersInScope` fails open on the same
 *      input for the same reason.
 *    · ITS ID APPEARS ANYWHERE ELSE IN THE PAYLOAD. Checked as a substring of
 *      the serialised notebook and the serialised renders rather than re-derived
 *      through `touches()`, because the question is literally "can the engine
 *      see this id somewhere it cannot resolve". That covers a beat whose
 *      `cards` cite a conclusion — which `ATTRIBUTION` does not do today, but a
 *      plan that adds one is applied back into it (`recalibrateFromPlan`) — plus
 *      `cutFacts`, `currency.expiresFirst/durable` and `analogyCandidates[].for`,
 *      all of which are card-id edges that may point at a `c-*`. A false hit
 *      sends more, which is the direction it is safe to be wrong in.
 *
 *  What is left over is a conclusion that is out of scope, unnamed by any note,
 *  and unreferenced anywhere the engine can see. There is no edit it may emit
 *  that rests on one — rule 4 forbids the only such edit — so what it needs is
 *  the knowledge that the material exists and was withheld, which is its id.
 *  `useFor` and `leap` ride along for the same reason `RENDERS NOT SENT` carries
 *  `engineLabel` and `durationS`: they cost ~40 characters and let a refusal
 *  name what kind of thing it is refusing.
 *
 *  THE ONE THING THIS MAY NOT BECOME: a saving that lets the engine reason about
 *  something it cannot see. The gate after `parseEditPlan` is the enforcement —
 *  a plan whose `cards` name a held conclusion is refused wholesale, exactly as
 *  one naming an unsent render is. */
function splitConclusions(
  conclusions: ScopedConclusion[],
  notes: unknown[],
  visibleElsewhere: string,
): { whole: ScopedConclusion[]; held: { id: string; useFor: string; leap: string }[] } {
  const named = new Set<string>();
  for (const raw of notes) {
    const n = (raw ?? {}) as Loose;
    // A note with no kind is read as `custom` here for the same reason
    // `rendersInScope` reads it that way: the unknown case fails open.
    if ((typeof n.kind === "string" ? n.kind : "custom") === "custom")
      return { whole: conclusions, held: [] };
    if (typeof n.cardId === "string") named.add(n.cardId);
  }
  const whole: ScopedConclusion[] = [];
  const held: { id: string; useFor: string; leap: string }[] = [];
  for (const c of conclusions) {
    if (c.inScope || named.has(c.id) || visibleElsewhere.includes(c.id)) whole.push(c);
    else held.push({ id: c.id, useFor: c.useFor, leap: c.leap });
  }
  return { whole, held };
}

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
  const sent = allRenders
    .filter((r) => inScope.has(String(r.id)))
    .map((r) => withAttribution(without(r, RENDER_DROP) as Loose));
  // Named, never hidden: the engine has to know these exist so it does not
  // reason as though the project has one render, and the creator has to be able
  // to tell "left alone" from "never looked at".
  const notSent = allRenders
    .filter((r) => !inScope.has(String(r.id)))
    .map((r) => ({ id: r.id, engineLabel: r.engineLabel, durationS: r.durationS }));

  // Serialised once, and read twice: these two strings ARE the payload the
  // engine can see, so asking whether a conclusion id occurs in them is the
  // exact question `splitConclusions` needs answered.
  const notebookJson = JSON.stringify(without(body.notebook, NOTEBOOK_DROP));
  const sentJson = JSON.stringify(sent);
  const { whole: conclusions, held } = splitConclusions(
    conclusionsFor(body.scope),
    body.notes,
    notebookJson + sentJson,
  );
  const heldIds = new Set(held.map((h) => h.id));

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
    notebookJson,
    "",
    "## CONCLUSIONS (reasoned, not researched — beside the notebook, never in it)",
    "A conclusion has no source of its own: it is synthesis over the cards in its",
    "`restsOn` plus an analogy, and the creator opts each one IN. `inScope: false`",
    "means they have not, so rule 4 binds it exactly as it binds any descoped card —",
    "it may not be given a beat, and a note on it can only be refused, by name.",
    JSON.stringify(conclusions),
    // Named, never hidden — the same shape and the same rule as RENDERS NOT SENT
    // below. The engine has to know this material exists so it does not reason
    // as though the notebook synthesised nothing, and it has to know it did not
    // read it so it cannot act on a claim it only saw the name of.
    ...(held.length
      ? [
          "",
          "## CONCLUSIONS NOT SENT",
          "Each of these is out of scope, unnamed by any note, and cited nowhere in what you",
          "were given — so no edit you may emit can rest on one, and the text is withheld.",
          "They exist and you have not read them: the notebook DID synthesise, and a summary",
          "saying otherwise is wrong. Refuse any note asking for one, by name. Never write",
          "the idea yourself instead — uncited, that breaks rule 1. Emit NO `cards` entry",
          "naming one; a plan that does is rejected wholesale.",
          JSON.stringify(held),
        ]
      : []),
    "",
    "## CURRENT RENDERS",
    sentJson,
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
    // Same rule, other axis: a beat may not rest on a conclusion whose text this
    // run withheld. Being told a card's NAME is not being handed the card, and a
    // beat's `cards` is what every coverage number is recomputed from — an id
    // declared from the name alone produces a matrix that cites reasoning the
    // engine never read. Refused wholesale, like the stray render above, for the
    // same reason: the rest of a plan built around that guess is not salvage.
    const blind = [...new Set(plan.edits.flatMap((e) => e.cards ?? []).filter((id) => heldIds.has(id)))];
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
