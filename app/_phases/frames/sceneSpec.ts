"use client";

// The scene-spec contract — what the authoring engine must return, and the
// validator that refuses anything else.
//
// Shaped like app/_phases/script/editPlan.ts: the engine is driven headlessly
// and cannot be given a response schema, so its output is a REQUEST rather than
// a guarantee. Everything here exists because a plausible-but-wrong spec is
// worse than a failed run — it silently produces sixteen frames that look
// authored and are not.

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

/**
 * Validate a scene spec against the beats it claims to describe.
 *
 * The checks are the ones that catch a spec which is confidently wrong:
 *   · every beat covered, no beat invented
 *   · a subject that mentions text or numbers — the one unconditional defect
 *   · a motion that is missing, unpicturable, or the subject said twice
 *   · a figure with no factId, or a factId the notebook does not contain
 */
export function parseSceneSpecs(
  raw: string,
  frames: Frame[],
  knownFactIds: Set<string>,
): SceneSpec[] {
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
  const seen = new Set<string>();
  const specs: SceneSpec[] = [];

  for (const s of doc.scenes as Record<string, unknown>[]) {
    const beatAt = String(s.beatAt ?? "");
    if (!byAt.has(beatAt)) throw new SceneSpecError(`It returned a scene for "${beatAt}", which is not a beat in this script.`);
    if (seen.has(beatAt)) throw new SceneSpecError(`It returned two scenes for ${beatAt}.`);
    seen.add(beatAt);

    const subject = String(s.subject ?? "").trim();
    if (subject.length < 20) throw new SceneSpecError(`The subject for ${beatAt} is too short to be a composition.`);
    // The plate must not be asked for glyphs. A subject that says "labelled" or
    // quotes a word is asking for exactly the defect that makes a plate
    // unusable, and it is far cheaper to reject it here than to render it.
    if (ASKS_FOR_TEXT.test(subject))
      throw new SceneSpecError(`The subject for ${beatAt} asks the model for text. Plates carry no glyphs.`);

    // The motion is held to the subject's standard, for the subject's reason: a
    // move nobody can picture is not a direction, it is a word. What is NOT
    // checked is as deliberate — no verb whitelist, no duration, no easing
    // vocabulary. Nothing has measured those, and a validator built on an
    // impression rejects good direction with total confidence.
    const motion = String(s.motion ?? "").trim();
    if (motion.length < 12) throw new SceneSpecError(`The motion for ${beatAt} is too short to describe a move.`);
    if (ASKS_FOR_TEXT.test(motion))
      throw new SceneSpecError(`The motion for ${beatAt} moves text. Our text layer is vector and ours — move the picture.`);
    if (motion.toLowerCase() === subject.toLowerCase())
      throw new SceneSpecError(`The motion for ${beatAt} just restates the subject. A still is not a move.`);

    const elements = (Array.isArray(s.elements) ? s.elements : []).map((e) => {
      const el = e as Record<string, unknown>;
      const kind = String(el.kind ?? "");
      if (!(ELEMENT_KINDS as readonly string[]).includes(kind))
        throw new SceneSpecError(`Unknown element kind "${kind}" on ${beatAt}.`);
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
      if (!(TEXT_ROLES as readonly string[]).includes(role))
        throw new SceneSpecError(`Unknown text role "${role}" on ${beatAt}.`);
      const factId = tx.factId ? String(tx.factId) : undefined;
      // The integrity gate, enforced rather than requested.
      if (role === "figure" && !factId)
        throw new SceneSpecError(`A figure on ${beatAt} cites no fact. Every number on screen must be traceable.`);
      if (factId && !knownFactIds.has(factId))
        throw new SceneSpecError(`${beatAt} cites "${factId}", which is not in this notebook.`);
      return {
        role: role as FrameText["role"],
        value: String(tx.value ?? "").slice(0, 90),
        x: clamp(num(tx.x, 6)),
        y: clamp(num(tx.y, 40)),
        factId,
      };
    });

    specs.push({ beatAt, subject, motion, rationale: String(s.rationale ?? "").slice(0, 200), elements, texts });
  }

  const missing = frames.filter((f) => !seen.has(f.at));
  if (missing.length)
    throw new SceneSpecError(
      `It returned ${specs.length} scenes for ${frames.length} beats — missing ${missing.slice(0, 3).map((f) => f.at).join(", ")}.`,
    );

  return specs;
}

/** Fold authored specs into the frames, replacing the seeded layers. */
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
