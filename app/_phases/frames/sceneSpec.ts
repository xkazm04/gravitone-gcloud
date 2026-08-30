"use client";

// The scene-spec contract — what the authoring engine must return, and the
// validator that refuses anything else.
//
// Shaped like app/_phases/script/editPlan.ts: the engine is driven headlessly
// and cannot be given a response schema, so its output is a REQUEST rather than
// a guarantee. Everything here exists because a plausible-but-wrong spec is
// worse than a failed run — it silently produces sixteen frames that look
// authored and are not.

import type { Confidence } from "../_shared/notebook/types";

import type { Frame, FrameElement, FrameText } from "./frames";

export class SceneSpecError extends Error {}

const ELEMENT_KINDS = ["arrow", "bar", "bracket", "marker", "rule", "loop"] as const;
const TEXT_ROLES = ["kicker", "caption", "figure", "label"] as const;

export interface SceneSpec {
  beatAt: string;
  subject: string;
  /** What the plate DOES — authored in the same pass that composes it, because
   *  a move decided apart from the composition fights it. Nothing renders this
   *  yet and the surfaces say so; see `FrameClip` in ./frames. */
  motion: string;
  rationale: string;
  elements: Omit<FrameElement, "id">[];
  texts: Omit<FrameText, "id">[];
}

/** The shape handed to the engine, so the prompt and the parser cannot drift. */
export const SCENE_SCHEMA = {
  type: "object",
  required: ["scenes"],
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        required: ["beatAt", "subject", "motion", "rationale"],
        properties: {
          beatAt: { type: "string" },
          subject: { type: "string" },
          motion: { type: "string" },
          rationale: { type: "string" },
          elements: {
            type: "array",
            items: {
              type: "object",
              required: ["kind", "label", "x", "y", "w", "h"],
              properties: {
                kind: { enum: ELEMENT_KINDS },
                label: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
                w: { type: "number" },
                h: { type: "number" },
                accent: { type: "boolean" },
              },
            },
          },
          texts: {
            type: "array",
            items: {
              type: "object",
              required: ["role", "value", "x", "y"],
              properties: {
                role: { enum: TEXT_ROLES },
                value: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
                factId: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** Asking a generative layer for glyphs is the one unconditional defect: a plate
 *  that comes back carrying letters is not a nicer plate, it is an unusable one.
 *  The same is true of a move described as "the label slides in" — our text
 *  layer is vector and ours, so no generated frame may be asked to carry it. */
const ASKS_FOR_TEXT = /\b(text|label(l)?ed|caption|write|written|word|letter|number|digit|title)\b/i;

/** One scene the parser refused, and the sentence that says why.
 *
 *  `beatAt` is what the ENGINE claimed, which is not necessarily a beat in this
 *  script — a scene invented for a timestamp that does not exist is one of the
 *  things caught here, and it has no row to sit on. */
export interface SpecRejection {
  beatAt: string;
  reason: string;
}

/** What a direction pass actually produced: what survived, what did not and
 *  why, and which beats it never mentioned. */
export interface SceneSpecReport {
  specs: SceneSpec[];
  rejected: SpecRejection[];
  /** Beats the engine never MENTIONED. Disjoint from `rejected` on purpose: a
   *  beat it tried and got wrong has a reason attached, and reporting that beat
   *  as missing too would replace the reason with a vaguer one and count the
   *  same defect twice. Their frames keep what they had — a report rather than a
   *  throw, because fifteen good scenes are worth having even when the
   *  sixteenth never arrived. */
  missing: string[];
}

/** Fact id → the notebook's confidence grade for it. Optional so the
 *  measurement harness can validate a spec with no notebook in hand; when it
 *  is supplied the grade caps what the plate may assert. */
export type FactGrades = ReadonlyMap<string, Confidence>;

/** One scene, validated. Throws `SceneSpecError` describing the FIRST thing
 *  wrong with THIS beat — the caller catches it and moves to the next one.
 *
 *  Messages here are written to be read on the beat's own row, so they do not
 *  repeat the timestamp: the row already said it. */
function parseScene(
  s: Record<string, unknown>,
  knownFactIds: Set<string>,
  grades?: FactGrades,
): Omit<SceneSpec, "beatAt"> {
  const subject = String(s.subject ?? "").trim();
  if (subject.length < 20) throw new SceneSpecError("The subject is too short to be a composition.");
  // The plate must not be asked for glyphs. A subject that says "labelled" or
  // quotes a word is asking for exactly the defect that makes a plate
  // unusable, and it is far cheaper to reject it here than to render it.
  if (ASKS_FOR_TEXT.test(subject))
    throw new SceneSpecError("The subject asks the model for text. Plates carry no glyphs.");

  // The motion is held to the subject's standard, for the subject's reason: a
  // move nobody can picture is not a direction, it is a word. What is NOT
  // checked is as deliberate — no verb whitelist, no duration, no easing
  // vocabulary. Nothing has measured those, and a validator built on an
  // impression rejects good direction with total confidence.
  const motion = String(s.motion ?? "").trim();
  if (motion.length < 12) throw new SceneSpecError("The motion is too short to describe a move.");
  if (ASKS_FOR_TEXT.test(motion))
    throw new SceneSpecError("The motion moves text. Our text layer is vector and ours — move the picture.");
  if (motion.toLowerCase() === subject.toLowerCase())
    throw new SceneSpecError("The motion just restates the subject. A still is not a move.");

  const elements = (Array.isArray(s.elements) ? s.elements : []).map((e) => {
    const el = e as Record<string, unknown>;
    const kind = String(el.kind ?? "");
    if (!(ELEMENT_KINDS as readonly string[]).includes(kind))
      throw new SceneSpecError(`Unknown element kind "${kind}".`);
    return {
      kind: kind as FrameElement["kind"],
      label: String(el.label ?? "").slice(0, 60),
      x: clamp(num(el.x, 10)),
      y: clamp(num(el.y, 40)),
      w: clamp(num(el.w, 30)),
      h: clamp(num(el.h, 20)),
      accent: Boolean(el.accent),
    };
  });

  const texts = (Array.isArray(s.texts) ? s.texts : []).map((t) => {
    const tx = t as Record<string, unknown>;
    const role = String(tx.role ?? "");
    if (!(TEXT_ROLES as readonly string[]).includes(role)) throw new SceneSpecError(`Unknown text role "${role}".`);
    const factId = tx.factId ? String(tx.factId) : undefined;
    // The integrity gate, enforced rather than requested.
    if (role === "figure" && !factId)
      throw new SceneSpecError("A figure cites no fact. Every number on screen must be traceable.");
    if (factId && !knownFactIds.has(factId))
      throw new SceneSpecError(`It cites "${factId}", which is not in this notebook.`);
    // THE GRADE TRAVELS, OR THE CITATION LAUNDERS. Resolving the id proved the
    // citation exists; it says nothing about what the citation PERMITS. A
    // figure is the sharpest mark in the vocabulary — an exact value, on
    // screen, with no hedging words available — and a fact the notebook graded
    // `low` cannot support one. Drawn anyway it is indistinguishable from a
    // `high` fact and carries a valid citation while doing it.
    //
    // Only `figure` is capped, and only at `low`. The other roles assert less;
    // a medium-confidence figure is a real question this cannot answer, and
    // guessing at it would reject good direction with total confidence — the
    // reason there is no verb whitelist twenty lines up.
    if (role === "figure" && factId && grades?.get(factId) === "low")
      throw new SceneSpecError(
        `It draws an exact figure from "${factId}", which the notebook grades low confidence. Draw the shape, the band or the disagreement — not the value. If the figure is right, re-grade the fact; do not out-draw the grade here.`,
      );
    return {
      role: role as FrameText["role"],
      value: String(tx.value ?? "").slice(0, 90),
      x: clamp(num(tx.x, 6)),
      y: clamp(num(tx.y, 40)),
      factId,
    };
  });

  return { subject, motion, rationale: String(s.rationale ?? "").slice(0, 200), elements, texts };
}

/**
 * Review a direction pass against the beats it claims to describe.
 *
 * PER BEAT, and that is the whole point of this function's shape. "Direct the
 * cut" is a multi-minute call to a local Claude process over the entire script;
 * throwing on the first defect anywhere in the batch discarded every good scene
 * the model produced and charged the user again to find out whether it was a
 * fluke. So findings are COLLECTED: a bad scene is still rejected — nothing here
 * is more forgiving than it was — it just no longer takes its fifteen siblings
 * down with it.
 *
 * What still fails hard is what invalidates the whole response rather than one
 * beat of it: no JSON object, malformed JSON, no `scenes` array. There is
 * nothing to salvage from those and pretending otherwise would apply garbage.
 *
 * The checks are the ones that catch a spec which is confidently wrong:
 *   · no beat invented, no beat covered twice — now reported, not thrown
 *   · a subject that mentions text or numbers — the one unconditional defect
 *   · a motion that is missing, unpicturable, or the subject said twice
 *   · a figure with no factId, or a factId the notebook does not contain
 */
export function reviewSceneSpecs(
  raw: string,
  frames: Frame[],
  knownFactIds: Set<string>,
  grades?: FactGrades,
): SceneSpecReport {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new SceneSpecError("The engine returned no JSON object.");

  let doc: { scenes?: unknown };
  try {
    doc = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new SceneSpecError("The engine returned malformed JSON.");
  }
  if (!Array.isArray(doc.scenes)) throw new SceneSpecError("The engine returned no `scenes` array.");

  const byAt = new Map(frames.map((f) => [f.at, f]));
  /** Beats a scene was ACCEPTED for — the duplicate guard, and what "applied"
   *  means. A beat whose only scene was rejected is not in here. */
  const accepted = new Set<string>();
  /** Beats the engine claimed at all, right or wrong. What `missing` is the
   *  complement of. */
  const mentioned = new Set<string>();
  const specs: SceneSpec[] = [];
  const rejected: SpecRejection[] = [];

  for (const s of doc.scenes as Record<string, unknown>[]) {
    const beatAt = String(s.beatAt ?? "");
    mentioned.add(beatAt);
    try {
      if (!byAt.has(beatAt)) throw new SceneSpecError(`"${beatAt}" is not a beat in this script.`);
      if (accepted.has(beatAt)) throw new SceneSpecError(`A second scene for ${beatAt} — the first one stands.`);
      specs.push({ beatAt, ...parseScene(s, knownFactIds, grades) });
      accepted.add(beatAt);
    } catch (e) {
      // Only OUR refusals are per-beat findings. A TypeError from this parser is
      // a bug in it, and swallowing that would turn a crash into sixteen quiet
      // rejections nobody could explain.
      if (!(e instanceof SceneSpecError)) throw e;
      rejected.push({ beatAt: beatAt || "(no beatAt)", reason: e.message });
    }
  }

  return { specs, rejected, missing: frames.filter((f) => !mentioned.has(f.at)).map((f) => f.at) };
}

/** The surviving specs alone.
 *
 *  Kept for `pipeline/direct-frames.mts`, the measurement harness, which wants
 *  the scenes and reports its own counts. Anything that has to TELL the user
 *  what happened wants `reviewSceneSpecs` — the findings are the point there. */
export function parseSceneSpecs(
  raw: string,
  frames: Frame[],
  knownFactIds: Set<string>,
  grades?: FactGrades,
): SceneSpec[] {
  return reviewSceneSpecs(raw, frames, knownFactIds, grades).specs;
}

/** Fold authored specs into the frames, replacing the seeded layers.
 *
 *  Frames with no spec in the list are returned untouched — which is exactly
 *  what a rejected or unmentioned beat gets. It keeps whatever it had, which is
 *  usually the template output this pass exists to replace, and the row says so
 *  rather than the frame quietly emptying. */
export function applySceneSpecs(frames: Frame[], specs: SceneSpec[]): Frame[] {
  const byAt = new Map(specs.map((s) => [s.beatAt, s]));
  return frames.map((f) => {
    const s = byAt.get(f.at);
    if (!s) return f;
    return {
      ...f,
      rationale: s.rationale,
      // The plate is NOT cleared. A rendered picture is money already spent, and
      // the new subject may well produce the same image; re-render is a
      // decision the user makes per frame.
      plate: { ...f.plate, subject: s.subject },
      // The clip's STATUS is carried through untouched rather than reset. There
      // is nothing to reset it from — no renderer has ever set it — and folding
      // direction in is authoring, not un-rendering.
      clip: { ...(f.clip ?? { status: "not-started" as const, motion: "" }), motion: s.motion },
      elements: s.elements.map((e, i) => ({ ...e, id: `e-${f.id}-${i}` })),
      texts: s.texts.map((t, i) => ({ ...t, id: `t-${f.id}-${i}` })),
    };
  });
}
