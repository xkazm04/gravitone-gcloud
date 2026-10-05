// THE MOTION-DIRECTION TURN — a plate in, a proposed `FrameClip.motion` out, or
// a DECLINE with its reason. Pure: no React, no fetch, no vendor. The route
// (app/api/motion/direct) hands it lib/imaging's `recognize`; the probe hands it
// a fake. Isomorphic on purpose, so the step's hook can import the outcome
// types and the record helpers without dragging a server module into the
// bundle.
//
// A PORT OF pipeline/video/motion_author.py, which is two passes against a
// local annotator:
//
//   READ     the still → the elements actually in it, named, with positions
//   PROPOSE  those elements → a prompt that opens by describing the scene and
//            then gives NAMED elements their own verbs
//
// The prompts below keep that file's rules, each of which is a render it spoiled
// (see its comments for which). Two things change, and both are the point:
//
//  1. IT CAN DECLINE. motion_author's README (pipeline/video/README.md) records
//     that the author "cannot decline": a plate with nothing that can move on its
//     own still got a prompt, and a prompt with no separable subject becomes a
//     camera drift — the exact defect the author exists to stop. Here a decline
//     is a STATE with a reason, and the frame's motion line stays empty. That is
//     rung zero in the registry's ladder (video-assembly#generated-shot-sourcing):
//     a shot that cannot say what should move is moved by the editor.
//
//  2. THE READING IS THE CONTRACT BY CONSTRUCTION, not by withholding the image.
//     motion_author keeps the picture out of pass 2 so the proposal cannot
//     disagree with the reading. lib/imaging has no text-only vision turn, so
//     both passes go through `recognize` with the plate — and the proposal is
//     then FILTERED against the reading: a move whose element the read did not
//     name as separable is dropped, and so is the camera. A proposal with no
//     move left is declined. What a model may say is bounded by code, not by
//     its manners.
//
// The decisions that decline are made HERE, from the structured answers, so the
// same reading always declines the same way. The model's own `decline` field is
// honoured too, verbatim — it is the work, not the app's sentence.

import type { ImageRef, ProviderSteer, Recognition, RecognizeRequest } from "@/lib/imaging/types";

import type { Frame, FrameClip } from "../frames/frames";

/* ── The two passes ───────────────────────────────────────────────────────── */

export const READ_INSTRUCTION = `You are looking at a single still frame that may become a 5-second video clip.

Describe ONLY what is actually visible. Do not invent objects, do not interpret
meaning, do not mention style adjectives like "elegant" or "modern".

scene: one plain sentence naming what the picture shows, as if to someone who
cannot see it. Name the medium (photograph, flat vector drawing, chalk on a
blackboard, cut paper, blueprint linework) and the background.

elements: the distinct THINGS in the frame, at most six, largest and most
important first. For each: a short noun name as it appears in the picture,
where it sits in the frame, and separable: true only if it is a distinct object
that could move on its own while everything around it stays exactly as it is.
A texture, a gradient, a vignette, paper grain, the background or a pattern
that fills the frame is NOT separable. If the picture holds no distinct
objects at all, return an empty list. Skip the background itself.

grounded: true if the objects rest on a visible surface, ground line or floor;
false if they float.`;

export const READ_SCHEMA = {
  type: "object",
  properties: {
    scene: { type: "string" },
    elements: {
      type: "array",
      minItems: 0,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          where: { type: "string" },
          separable: { type: "boolean" },
        },
        required: ["name", "where", "separable"],
      },
    },
    grounded: { type: "boolean" },
  },
  required: ["scene", "elements", "grounded"],
} as const;

export function proposeInstruction(read: MotionRead): string {
  const lines = [`scene: ${read.scene}`, `grounded: ${read.grounded}`, "elements:"];
  for (const e of read.elements) lines.push(`  - ${e.name} (${e.where})${e.separable ? "" : " [cannot move on its own]"}`);
  return `You are writing the text prompt for an image-to-video model.
The first frame is fixed: it is the picture described below. You are choosing
what happens over the next 5 seconds. Use ONLY the reading below; name nothing
it does not name.

THE PICTURE
${lines.join("\n")}

WRITE ONE PROMPT, in this exact order:

1. A sentence describing the picture, adapted from \`scene\` above. This
   sentence is the anchor the motion attaches to.
2. One or two sentences of MOTION, naming elements from the list by their own
   names and giving each a verb. An unnamed element will not move.
3. A final short clause naming what HOLDS STILL, including the camera.

RULES, each learned from a spoiled render:

- MOVE THE OBJECTS, NOT THE CAMERA. No push-in, drift, pan, tilt or zoom.
- NOTHING IS CREATED OR DESTROYED. Nothing drawn, written, erased, added or removed.
- NOTHING ENTERS THE FRAME. No hand, no tool, no new object.
- THE MOTION IS SMALL AND PHYSICAL: a rise, a settle, a sway, a drift, a bob,
  a tilt, a pulse of brightness, a shadow lengthening.
- IF THE PICTURE IS GROUNDED, things resting on a surface stay on it.
- AT MOST THREE ELEMENTS MOVE. Only elements that can move on their own.
- NO TEXT, no numbers, no labels appearing anywhere.

\`moves\` lists each moving element by its name in the list, with its verb.
\`holds_still\` lists what does not move.
If NO element can move without the picture changing shape, leave \`moves\`
empty and say why in \`decline\`, in one short clause.

Keep the prompt under 90 words. Plain declarative sentences. Present tense.`;
}

export const PROPOSE_SCHEMA = {
  type: "object",
  properties: {
    prompt: { type: "string" },
    moves: {
      type: "array",
      minItems: 0,
      maxItems: 3,
      items: {
        type: "object",
        properties: { element: { type: "string" }, verb: { type: "string" } },
        required: ["element", "verb"],
      },
    },
    holds_still: { type: "array", items: { type: "string" } },
    decline: { type: "string" },
  },
  required: ["prompt", "moves", "holds_still"],
} as const;

/* ── What the turn answers ────────────────────────────────────────────────── */

export interface MotionElement {
  name: string;
  where: string;
  separable: boolean;
}

export interface MotionRead {
  scene: string;
  elements: MotionElement[];
  grounded: boolean;
}

export interface MotionMove {
  element: string;
  verb: string;
}

/** Why the line says what it says — the reading it was written from, what
 *  moved, and who read it. Kept with the proposal because none of it is
 *  re-derivable from the sentence afterwards. */
export interface MotionBasis {
  scene: string;
  /** Every element the read named, in its order. */
  elements: string[];
  moves: MotionMove[];
  holdsStill: string[];
  provider: string;
  model: string;
}

export type MotionOutcome =
  | { kind: "proposed"; motion: string; basis: MotionBasis; at: number }
  | {
      kind: "declined";
      reason: string;
      /** The reading a decline was made on — enough to see it was a fair one. */
      basis: { scene: string; elements: string[]; provider?: string; model?: string };
      at: number;
    };

/** A motion line is a prompt, not an essay — motion_author asks for under 90
 *  words. The cap is a backstop against a runaway answer reaching the record. */
export const MOTION_MAX_CHARS = 800;

/** Words that make a "move" a camera move — the fallback this turn exists to
 *  refuse (motion_author.py, rule 1). */
const CAMERA = /^(the )?(camera|view|frame|shot|lens|picture)$/i;

const norm = (s: string) => s.trim().toLowerCase().replace(/^the\s+/, "").replace(/\s+/g, " ");

function asRead(json: unknown): MotionRead {
  const o = (json ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(o.elements) ? o.elements : [];
  const elements: MotionElement[] = raw
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map((e) => ({
      name: typeof e.name === "string" ? e.name.trim() : "",
      where: typeof e.where === "string" ? e.where.trim() : "",
      // Absent reads as NOT separable: the safe side of this question is the
      // one that declines, never the one that animates a texture.
      separable: e.separable === true,
    }))
    .filter((e) => e.name);
  return { scene: typeof o.scene === "string" ? o.scene.trim() : "", elements, grounded: o.grounded === true };
}

/**
 * Run the turn. `recognize` is lib/imaging's in production and a fake in the
 * probe; a vendor failure THROWS out of here untouched (it is not a decline —
 * nothing was decided about the plate) and the route shapes it like every
 * other imaging error.
 */
export async function directMotion(
  image: ImageRef,
  recognize: (req: RecognizeRequest) => Promise<Recognition>,
  steer: ProviderSteer = {},
  now: number = Date.now(),
): Promise<MotionOutcome> {
  const first = await recognize({ ...steer, image, instruction: READ_INSTRUCTION, schema: READ_SCHEMA as unknown as Record<string, unknown> });
  const read = asRead(first.json);
  const who = { provider: first.provenance.provider, model: first.provenance.model };
  const names = read.elements.map((e) => e.name);
  const declined = (reason: string): MotionOutcome => ({
    kind: "declined",
    reason,
    basis: { scene: read.scene, elements: names, ...who },
    at: now,
  });

  const movable = read.elements.filter((e) => e.separable);
  if (movable.length === 0)
    return declined(
      read.elements.length === 0
        ? "no separable element: nothing in the plate can move on its own"
        : `no separable element: ${names.join(", ")} cannot move without the picture changing shape`,
    );

  const second = await recognize({
    ...steer,
    image,
    instruction: proposeInstruction(read),
    schema: PROPOSE_SCHEMA as unknown as Record<string, unknown>,
  });
  const p = (second.json ?? {}) as Record<string, unknown>;
  const own = typeof p.decline === "string" ? p.decline.trim() : "";
  if (own) return declined(own);

  const byName = new Map(movable.map((e) => [norm(e.name), e.name]));
  const moves: MotionMove[] = (Array.isArray(p.moves) ? p.moves : [])
    .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
    .map((m) => ({ element: typeof m.element === "string" ? m.element : "", verb: typeof m.verb === "string" ? m.verb.trim() : "" }))
    .filter((m) => m.verb && !CAMERA.test(m.element.trim()) && byName.has(norm(m.element)))
    .map((m) => ({ element: byName.get(norm(m.element))!, verb: m.verb }))
    .slice(0, 3);
  const prompt = typeof p.prompt === "string" ? p.prompt.trim() : "";
  if (moves.length === 0 || !prompt)
    return declined(`the proposal moved nothing the read named as separable (${movable.map((e) => e.name).join(", ")})`);

  return {
    kind: "proposed",
    motion: prompt.slice(0, MOTION_MAX_CHARS),
    basis: {
      scene: read.scene,
      elements: names,
      moves,
      holdsStill: Array.isArray(p.holds_still) ? p.holds_still.filter((x): x is string => typeof x === "string") : [],
      provider: second.provenance.provider,
      model: second.provenance.model,
    },
    at: now,
  };
}

/* ── What accepting does ──────────────────────────────────────────────────── */

/** The clip a creator gets by accepting an outcome unedited. A decline leaves
 *  the clip exactly as it was — the motion line stays empty, and nothing here
 *  ever claims a render (`status` is the render queue's, stage 2). */
export function clipAfter(clip: FrameClip, outcome: MotionOutcome): FrameClip {
  return outcome.kind === "proposed" ? { ...clip, motion: outcome.motion } : clip;
}

/** Write one frame's accepted (or edited) motion line into the frames list.
 *  Returns the SAME array when nothing changes — an unknown frame, or a blank
 *  line, which is not a motion and must not overwrite one. */
export function withAcceptedMotion<T extends Pick<Frame, "id" | "clip">>(frames: T[], frameId: string, motion: string): T[] {
  const line = motion.trim().slice(0, MOTION_MAX_CHARS);
  if (!line || !frames.some((f) => f.id === frameId)) return frames;
  return frames.map((f) => (f.id === frameId ? { ...f, clip: { ...f.clip, motion: line } } : f));
}

/* ── What the step says about itself ──────────────────────────────────────── */

/** The step's own word, derived from its own data — the usePhaseReport rule.
 *  `null` until a frame has a motion line or an outcome is on file: opening the
 *  step is not progress. Stage 1 never says more than "working"; review and
 *  done wait for takes (stage 3) and are a later verdict module's to derive. */
export function motionReport(
  frames: Pick<Frame, "id" | "clip">[],
  byFrame: Record<string, MotionOutcome>,
): "working" | null {
  const authored = frames.some((f) => Boolean(f.clip?.motion?.trim()));
  const decided = frames.some((f) => byFrame[f.id] !== undefined);
  return authored || decided ? "working" : null;
}

/** The plate as the turn needs it, or null when the plate is not a `data:`
 *  image this step can send (not generated yet, refused, or a public path). */
export function plateImage(src: string | undefined): ImageRef | null {
  const m = src ? /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(src) : null;
  return m ? { mime: m[1] as ImageRef["mime"], base64: m[2] } : null;
}

/** A cheap fingerprint of the plate an outcome was made from, so a re-drawn
 *  plate shows its old outcome as stale rather than as current. */
export function plateSig(src: string | undefined): string {
  return src ? `${src.length}:${src.slice(-32)}` : "";
}
