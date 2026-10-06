// THE RECALIBRATE PROMPT, ASSEMBLED — notes in, `{ prompt, manifest }` out.
// SERVER ONLY. (AIO-B: extracted from app/api/recalibrate/route.ts.)
//
// The route used to build this inline, which meant the only way to learn what a
// run would send was to send it. Pulled out as a pure function of the request
// body and the system prompt, so the route, a free preview
// (app/api/turns/preview) and AIO-A's turn runner all build the SAME bytes, and
// tests/golden-path/turn-assemble-parity.probe.spec.ts pins them to what the
// route built before the extraction.
//
// Why the prompt is BUILT rather than forwarded: there is no cross-call prompt
// caching on the CLI rung, so every character that cannot change the answer is
// bought once per run, at Opus-5-at-high-effort prices. THREE cuts, all below,
// all stated as what they are: the notebook slices no beat can cite, the
// renders these notes cannot reach, and the conclusions no edit may rest on.
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
// not receive buys a confident answer to a question nobody asked.
//
// THE MANIFEST is the cut, as data. `renders.sent` and `conclusions.held` are
// exactly what the stray and blind guards below read, so a guard and the payload
// it guards are one decision, made once.
//
// FORCING. `forceRenders` / `forceConclusions` put withheld material back in:
// the creator can see a render was left out (the preview) and choose to send it
// anyway. A forced id joins the same sets the cuts produce, so the guards read
// the widened scope without knowing forcing exists. With neither present the
// prompt is byte-identical to the pre-extraction route's.

import { readFile } from "node:fs/promises";
import path from "node:path";

import { CONCLUSIONS } from "@/app/_phases/_shared/notebook/conclusions";
import { EDIT_PLAN_SCHEMA } from "@/app/_phases/script/editPlan";
import { rendersInScope } from "@/app/_phases/script/chainBase";
import { ATTRIBUTION } from "@/app/_phases/script/impact";

import { joinBlocks, type Refusal, type TurnManifest } from "./manifest";

/** The request body /api/recalibrate (and the preview's `input`) accepts. */
export interface RecalibrateInput {
  notebook?: unknown;
  renders?: unknown;
  scope?: unknown;
  notes?: unknown;
  /** Render ids to send even though no note reaches them. */
  forceRenders?: unknown;
  /** Conclusion ids to send whole even though they would be held. */
  forceConclusions?: unknown;
}

/* ------------------------------------------------------------ system prompt */

/** The system prompt is a file on disk, so it is a thing that can be MISSING —
 *  `pipeline/` is not part of the app's module graph and a build or a deployment
 *  that does not carry it produces exactly this. Named as its own failure because
 *  the generic answer is a lie here: nothing was reached and nothing ran, and
 *  telling the creator "the model could not be reached" sends them to go and
 *  check Claude Code, which is fine. */
export class PromptUnavailable extends Error {}

/** Cached per ABSOLUTE PATH, not once per process. The route's original cache
 *  was a single module variable, which made "the file is missing" observable
 *  only until anything — now including a preview — had read it once. Keyed by
 *  the path it was read from, a process whose cwd has no pipeline/ still gets
 *  the honest failure. The bytes served are the same either way. */
const cache = new Map<string, string>();

export async function recalibrateSystemPrompt(): Promise<string> {
  // A versioned document beside the research prompt, not a string literal here —
  // it is edited far more often than this assembler is.
  const at = path.join(process.cwd(), "pipeline", "RECALIBRATE-PROMPT.md");
  const hit = cache.get(at);
  if (hit !== undefined) return hit;
  let text: string;
  try {
    text = await readFile(at, "utf8");
  } catch {
    throw new PromptUnavailable(`The recalibration prompt could not be read from ${at}.`);
  }
  cache.set(at, text);
  return text;
}

/* ------------------------------------------- what the run can actually act on */

/** Notebook slices no beat can ever cite, so no edit can rest on them.
 *
 *  A beat declares `cards`, and a card is a fact, a mechanism, a reversal, a
 *  conclusion or the steel-man (`_shared/notebook/cards.ts`). Four of those five
 *  live in this object and stay in it, in full, because `more-focus` may bring in
 *  material no render currently speaks. The fifth does not live here at all:
 *  conclusions are a separate export and are sent in their own block below.
 *  What goes:
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
 *  § WHAT YOU RECEIVE tells the engine that every beat carries "the notebook card
 *  ids it rests on", so this sends them. `null`, never `[]`, where the app has no
 *  row: the table is hand-authored against each render's text (impact.ts) and
 *  records the beats that STATE a claim, and "no row in a hand-authored table" is
 *  a different fact from "rests on nothing". The prompt says which is which
 *  rather than letting the engine pick.
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
      const cards = b.cards !== undefined ? b.cards : (marks[String(b.at)] ?? null);
      return { ...b, cards };
    }),
  };
}

/** THE CONCLUSIONS, WITH THE ONE BIT THE SCOPE RECORD CANNOT SAY.
 *
 *  They are not in `Notebook` and must not be: a conclusion is reasoned rather
 *  than researched, it has no source, and filing it beside the sourced facts is
 *  precisely what conclusions.ts exists to prevent. So they travel BESIDE the
 *  notebook, in their own block, with that separation intact.
 *
 *  `inScope` is computed here rather than left to the engine to infer, because
 *  the sign is invisible in the SCOPE record: a conclusion is OUT until the
 *  creator takes it, so a `c-*` id absent from that record is descoped, while an
 *  `f-*` id absent from it is kept (`research/scope.ts::OPT_IN_DEFAULT`, which
 *  owns this rule). That module is `"use client"` and cannot be imported here,
 *  so the rule is restated in one expression with its owner named. */
function conclusionsFor(scope: unknown) {
  const rec = (scope && typeof scope === "object" ? scope : {}) as Record<string, { descoped?: boolean } | undefined>;
  return CONCLUSIONS.map((c) => ({ ...c, inScope: rec[c.id]?.descoped === false }));
}

type ScopedConclusion = ReturnType<typeof conclusionsFor>[number];

/** WHICH CONCLUSIONS THIS RUN CAN ACT ON.
 *
 *  e225446 measured the conclusions block at 8,613 characters of a 40,384-char
 *  prompt, and every conclusion is `optIn: true` — so the common case shipped
 *  ~8.6KB of synthesis the note could not touch, on every run. This is the same
 *  cut `RENDERS NOT SENT` makes, made with the same care: NAMED, never hidden,
 *  and refused if acted on.
 *
 *  A conclusion travels WHOLE if ANY of these is true:
 *    · `inScope` — the creator took it. Take every conclusion and the payload is
 *      byte-identical to what it was before the cut.
 *    · A NOTE NAMES IT. A note on a `c-*` card is answered against the card.
 *    · ANY note is `custom`. Free text may name a conclusion in prose with no
 *      `cardId` to match on, so one custom note sends every conclusion whole.
 *      `rendersInScope` fails open on the same input for the same reason.
 *    · ITS ID APPEARS ANYWHERE ELSE IN THE PAYLOAD — a substring of the
 *      serialised notebook and renders, because the question is literally "can
 *      the engine see this id somewhere it cannot resolve". A false hit sends
 *      more, which is the direction it is safe to be wrong in.
 *    · THE CREATOR FORCED IT (`forceConclusions`).
 *
 *  What is left over needs only the knowledge that it exists and was withheld:
 *  its id, plus `useFor` and `leap` (~40 characters) so a refusal can name what
 *  kind of thing it is refusing. The blind guard is the enforcement — a plan
 *  whose `cards` name a held conclusion is refused wholesale. */
function splitConclusions(
  conclusions: ScopedConclusion[],
  notes: unknown[],
  visibleElsewhere: string,
  forced: ReadonlySet<string>,
): { whole: ScopedConclusion[]; held: { id: string; useFor: string; leap: string }[] } {
  const named = new Set<string>(forced);
  for (const raw of notes) {
    const n = (raw ?? {}) as Loose;
    // A note with no kind is read as `custom` here for the same reason
    // `rendersInScope` reads it that way: the unknown case fails open.
    if ((typeof n.kind === "string" ? n.kind : "custom") === "custom") return { whole: conclusions, held: [] };
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

/** The ids in a `force*` field. Anything that is not a string is ignored: a
 *  force can only widen what is sent, never name something new into existence. */
function idsOf(v: unknown): Set<string> {
  return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
}

/* ------------------------------------------------------------- the refusals */

/** The most material one run is sent, in serialised characters: roughly a
 *  quarter of a million tokens, far past any real notebook and far short of an
 *  800-second Opus run nobody authorised. The same ceiling /api/frames holds. */
export const MAX_RUN_CHARS = 1_000_000;

/** Why this run's material is too large, or `null`. A pure predicate so the
 *  negative case can be asked without dispatching a run. */
export function tooLarge(body: Record<string, unknown>): string | null {
  const sizes = (["notebook", "renders", "scope", "notes"] as const).map((k) => [k, jsonSize(body[k])] as const);
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

/** What the route answers before assembling anything, in the route's order:
 *  size first, then "no notes". `null` when the run may be assembled. */
export function recalibrateRefusal(body: RecalibrateInput): Refusal | null {
  const oversized = tooLarge(body as Record<string, unknown>);
  if (oversized) return { status: 413, detail: oversized, code: "too-large" };
  if (!Array.isArray(body.notes) || body.notes.length === 0)
    return { status: 400, detail: "No notes were sent, so there is nothing to recalibrate." };
  return null;
}

/** The renders the caller sent, as the plan validator reads them. */
export const rendersOf = (body: RecalibrateInput): Loose[] => (Array.isArray(body.renders) ? (body.renders as Loose[]) : []);

/* ---------------------------------------------------------------- assembly */

/**
 * Build the prompt and its manifest. Pure: the system prompt is an argument,
 * and nothing is read, spawned or logged. Call `recalibrateRefusal` first — this
 * assumes `notes` is a non-empty array, as the route always has.
 */
export function assembleRecalibrate(body: RecalibrateInput, system: string): { prompt: string; manifest: TurnManifest } {
  const notes = Array.isArray(body.notes) ? (body.notes as unknown[]) : [];
  const allRenders = rendersOf(body);
  const inScope = rendersInScope(allRenders, notes);
  const known = new Set(allRenders.map((r) => String(r.id)));
  for (const id of idsOf(body.forceRenders)) if (known.has(id)) inScope.add(id);

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
    notes,
    notebookJson + sentJson,
    idsOf(body.forceConclusions),
  );

  // Everything goes down stdin. The notebook and three beat chains are far past
  // any platform's command-line argument limit, and on Windows that limit fails
  // as a truncated argument rather than an error.
  const { prompt, blocks } = joinBlocks([
    { name: "system", lines: [system, "", "---", ""] },
    {
      name: "run",
      lines: [
        "# THE RUN",
        "",
        "Return ONE JSON object and nothing else — no prose before or after, no code fence.",
        "It must satisfy this schema:",
        "",
        JSON.stringify(EDIT_PLAN_SCHEMA, null, 2),
        "",
      ],
    },
    { name: "notebook", lines: ["## NOTEBOOK", notebookJson] },
    {
      name: "conclusions",
      lines: [
        "",
        "## CONCLUSIONS (reasoned, not researched — beside the notebook, never in it)",
        "A conclusion has no source of its own: it is synthesis over the cards in its",
        "`restsOn` plus an analogy, and the creator opts each one IN. `inScope: false`",
        "means they have not, so rule 4 binds it exactly as it binds any descoped card —",
        "it may not be given a beat, and a note on it can only be refused, by name.",
        JSON.stringify(conclusions),
      ],
    },
    // Named, never hidden — the same shape and the same rule as RENDERS NOT SENT
    // below. The engine has to know this material exists so it does not reason
    // as though the notebook synthesised nothing, and it has to know it did not
    // read it so it cannot act on a claim it only saw the name of.
    {
      name: "conclusions-not-sent",
      lines: held.length
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
        : [],
    },
    { name: "renders", lines: ["", "## CURRENT RENDERS", sentJson] },
    {
      name: "renders-not-sent",
      lines: notSent.length
        ? [
            "",
            "## RENDERS NOT SENT",
            "No beat in these rests on a card the notes name, so their beat chains are not",
            "included in this run. You cannot edit what you cannot see: emit NO edit whose",
            "`renderId` is one of these — a plan that names one is rejected wholesale.",
            JSON.stringify(notSent),
          ]
        : [],
    },
    { name: "scope", lines: ["", "## SCOPE (cards the creator has taken out)", JSON.stringify(body.scope)] },
    { name: "notes", lines: ["", "## NOTES", JSON.stringify(body.notes, null, 2)] },
  ]);

  return {
    prompt,
    manifest: {
      blocks,
      renders: { sent: sent.map((r) => String(r.id)), notSent: notSent.map((r) => String(r.id)) },
      conclusions: { whole: conclusions.map((c) => c.id), held: held.map((h) => h.id) },
      notes: notes.length,
      totalChars: prompt.length,
      ceilingChars: MAX_RUN_CHARS,
    },
  };
}

/* ------------------------------------------------------------- the guards */

type Edit = { renderId: string; cards?: string[] };

/** Render ids a plan edits that this run did not send — the STRAY refusal.
 *  `parseEditPlan` checks ids against the render TABLE, which still holds every
 *  render, so whether the id was in THIS request is answered here, from the
 *  manifest that scoped it. Forced renders are in `sent`, so they pass. */
export function strayRenders(edits: readonly Edit[], manifest: TurnManifest): string[] {
  const sent = new Set(manifest.renders?.sent ?? []);
  return [...new Set(edits.map((e) => e.renderId).filter((id) => !sent.has(id)))];
}

/** Conclusion ids a plan's beats rest on whose text this run withheld — the
 *  BLIND refusal. Being told a card's NAME is not being handed the card. */
export function blindConclusions(edits: readonly Edit[], manifest: TurnManifest): string[] {
  const held = new Set(manifest.conclusions?.held ?? []);
  return [...new Set(edits.flatMap((e) => e.cards ?? []).filter((id) => held.has(id)))];
}
