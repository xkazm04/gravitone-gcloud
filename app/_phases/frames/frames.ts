"use client";

// STEP 3 (Frames) — the nouns of a composed picture.
//
// A FRAME is not an image. It is three layers that happen to be shown at once:
//
//   plate     the generated illustration — atmosphere, objects, colour
//   elements  vector marks — arrows, rules, brackets, markers
//   texts     the words — caption, figure, label
//
// The split is the whole architecture, and it is an EPISTEMIC one rather than a
// stylistic one: if a viewer could check it against a fact, code draws it; if it
// only has to feel right, a model may. So every number and every caption is
// ours, drawn as vector over a plate that was told not to render text. A plate
// that comes back carrying letters is not a nicer plate, it is an unusable one.
//
// SCENES COME FROM STEP 2. A beat already carries timing, rhetorical role and
// the sentence being spoken — strictly more than a subtitle file would — so the
// frame list is derived, never authored. Nobody retypes the script here.

import type { Beat, BeatKind, ScriptRender } from "../script/types";

/* ── Layers ───────────────────────────────────────────────────────────────── */

export type ElementKind = "arrow" | "bar" | "bracket" | "marker" | "rule" | "loop";

export interface FrameElement {
  id: string;
  kind: ElementKind;
  label: string;
  /** Percent box in the frame — vector, so it stays crisp at any output size. */
  x: number;
  y: number;
  w: number;
  h: number;
  accent?: boolean;
  /** Hidden layers stay in the frame and out of the picture — the fastest way
   *  to ask "was this element carrying anything?" without deleting it. */
  hidden?: boolean;
}

export type TextRole = "caption" | "figure" | "label" | "kicker";

export interface FrameText {
  id: string;
  role: TextRole;
  value: string;
  x: number;
  y: number;
  /** The notebook fact this asserts, when it asserts one. A figure with no
   *  factId is a number nobody checked — the gate Step 3 exists to hold. */
  factId?: string;
  hidden?: boolean;
}

export type PlateState = "empty" | "generating" | "ready" | "refused";

export interface Plate {
  state: PlateState;
  /** data: URL or public path. */
  src?: string;
  model?: string;
  costUsd?: number;
  /** What was asked for — the subject clause, not the whole style block. */
  subject?: string;
  note?: string;
}

/* ── The frame ────────────────────────────────────────────────────────────── */

export interface Frame {
  id: string;
  /** Position in the cut, from the beat. */
  at: string;
  atS: number;
  kind: BeatKind;
  /** The beat's own label — the scene title, not something invented here. */
  title: string;
  /** What is said over this frame. */
  line: string;
  device?: string;
  plate: Plate;
  elements: FrameElement[];
  texts: FrameText[];
  /** Why THIS picture for THIS beat — the art director's one line. Present only
   *  on authored frames, which is exactly how you tell them apart from seeded
   *  ones at a glance. */
  rationale?: string;
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

export function secondsOf(at: string): number {
  const [m, s] = at.split(":").map(Number);
  return (m || 0) * 60 + (s || 0);
}

/** How long a frame holds — until the next beat starts. */
export function durationOf(frames: Frame[], i: number, totalS: number): number {
  const next = frames[i + 1];
  return Math.max(1, (next ? next.atS : totalS) - frames[i].atS);
}

/* ── Derivation ───────────────────────────────────────────────────────────── */

/** Which visual problem a beat poses. The vocabulary is the trial grid's, so a
 *  frame can be routed to the style that measured well on its kind. */
export const PROBLEM_OF: Record<BeatKind, string> = {
  hook: "quantity",
  question: "kicker",
  answer: "statement",
  promise: "inventory",
  movement: "mechanism",
  turn: "reversal",
  candidate: "comparison",
  steelman: "counter-case",
  verdict: "statement",
  close: "reframe",
};

/** Pull the first hard number out of a line, if it has one. What a figure layer
 *  is FOR — and the thing that must never be drawn by a model. */
function figureIn(text: string): string | null {
  // Two passes, and the ORDER is the whole point. Alternation inside one regex
  // matches at the earliest POSITION, not by the alternative you listed first —
  // so a single pattern pulled "6" out of "On the 6th of October 2025, Bitcoin
  // hit one hundred and twenty six thousand dollars", which is the date rather
  // than the number the sentence is about. Spelled-out magnitudes are what this
  // script's own style guide asks for, so they are searched for first.
  const spelled = text.match(
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]+(?:and|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|point|percent))+\b/i,
  );
  if (spelled) return spelled[0].trim().replace(/\s+/g, " ").slice(0, 30);

  // Bare digits, but never an ordinal date ("6th") and never a bare year.
  const digits = text.match(/\b\d[\d,.]*\s*(?:percent|%|million|billion|thousand)?\b/i);
  if (!digits) return null;
  const raw = digits[0].trim();
  if (/^(19|20)\d{2}$/.test(raw)) return null;
  return raw.slice(0, 30);
}

/** A short kicker from the beat's own label — never invented prose. */
const kickerOf = (b: Beat) => b.label.replace(/^[A-Z]+\s*\d*\s*·\s*/, "").slice(0, 42);

/**
 * Beats → frames. One frame per beat, seeded with the layers the beat implies
 * and nothing more: a kicker from its label, a figure if the line states one,
 * and an element appropriate to its rhetorical role.
 *
 * Seeded, not finished. The point of the module is that a human takes these and
 * makes them right — but starting from an empty canvas per beat, sixteen times,
 * is how a step gets abandoned.
 */
export function framesFromRender(render: ScriptRender): Frame[] {
  return render.beats.map((b, i) => {
    const figure = figureIn(b.text);
    const texts: FrameText[] = [
      { id: `t-${i}-k`, role: "kicker", value: kickerOf(b), x: 6, y: 8 },
    ];
    if (figure) texts.push({ id: `t-${i}-f`, role: "figure", value: figure, x: 6, y: 72 });

    const elements: FrameElement[] = [];
    if (b.kind === "turn") elements.push({ id: `e-${i}-a`, kind: "arrow", label: "the reversal", x: 58, y: 30, w: 34, h: 22, accent: true });
    else if (b.kind === "movement") elements.push({ id: `e-${i}-l`, kind: "loop", label: "the mechanism", x: 56, y: 24, w: 34, h: 40 });
    else if (b.kind === "hook" && figure) elements.push({ id: `e-${i}-b`, kind: "bar", label: "the magnitude", x: 8, y: 40, w: 44, h: 26 });
    else if (b.kind === "promise") elements.push({ id: `e-${i}-r`, kind: "rule", label: "the three topics", x: 8, y: 56, w: 60, h: 4 });
    else if (b.kind === "steelman") elements.push({ id: `e-${i}-br`, kind: "bracket", label: "the counter-case", x: 60, y: 26, w: 8, h: 44 });

    return {
      id: `fr-${i}`,
      at: b.at,
      atS: secondsOf(b.at),
      kind: b.kind,
      title: b.label,
      line: b.text,
      device: b.device,
      plate: { state: "empty" as PlateState },
      elements,
      texts,
    };
  });
}

/** The subject clause handed to the image model for one frame.
 *
 *  Deliberately built from the beat's ROLE rather than its sentence: a plate
 *  drawn from the literal words gets the reservation book with "Reservation"
 *  written in it, which the trial grid measured leaking text on 6 of 6 styles.
 *  Shape first, nouns second. */
export function subjectFor(frame: Frame): string {
  const base = PROBLEM_OF[frame.kind];
  const shape: Record<string, string> = {
    quantity: "A single line rising to a sharp peak then falling to about half its height, on a plain ground line.",
    mechanism: "A closed loop of three thick arrows around a central stack of discs.",
    reversal: "Two heavy arrows meeting head-on, the left one clearly overpowering the right.",
    inventory: "Three simple emblems evenly spaced in a row on a ground line, each with a small tick beside it.",
    "counter-case": "Two unequal stacks side by side, the smaller one raised on a plinth.",
    comparison: "A two-pan balance, one pan visibly higher than the other.",
    statement: "One large simple emblem centred alone in the frame.",
    kicker: "A single large question-shaped hook form, centred, alone.",
    reframe: "A wide horizon line with one small form standing to the right of centre.",
  };
  return `${shape[base] ?? shape.statement} Large simple shapes, generous empty space, nothing in the lower third.`;
}

/** A layer reference — which array, which index. Selection and every layer
 *  operation speak this, so the canvas and the panel cannot disagree about
 *  what is selected. */
export type LayerRef = { type: "element" | "text"; id: string } | null;

export const isComposed = (f: Frame) => f.plate.state === "ready";
export const composedCount = (fs: Frame[]) => fs.filter(isComposed).length;
