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
//
// AND SINCE 2026-08-14 A FRAME ALSO OWNS ITS CLIP. Motion stopped being a step
// of its own that day and landed here, which means a frame is no longer only a
// picture: it is a picture plus what that picture DOES. See `FrameClip` — and
// read the honesty note on it before drawing anything from it.

import type { ClipStatus } from "@/app/_studio/projectTypes";

import { templateOf, type Discipline, type TemplateId } from "@/lib/projects";

import type { Beat, BeatKind, ScriptRender } from "../script/types";
import { atSeconds, toShotLaneBeat, type TrailerCut } from "../script/trailer/types";
import type { ShotSourceBeat, ShotSourceRender } from "./shots";

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

/* ── The clip ─────────────────────────────────────────────────────────────── */

/**
 * What the plate DOES — the fourth layer, and the only one nothing in this app
 * can render.
 *
 * HONESTY, and it is the whole design of this type: there is no video provider
 * here. `lib/imagingClient.ts` exposes generate / edit / recognize and all three
 * return stills. So a clip in this app is AUTHORED, never rendered, and
 * `status` can only ever hold `"not-started"`. The field exists anyway, typed
 * against the SAME `ClipStatus` the lifecycle fixtures use rather than a second
 * private enum, so that the day a render seam is built the model does not have
 * to be reshaped around it — but until that day, every surface reading this must
 * say "not rendered" and mean it. No progress bar. No fake preview.
 *
 * There is deliberately NO duration field. A frame already knows how long it
 * holds — `durationOf()` derives it from the gap to the next beat, which is a
 * real number from the script. The craft library has no measured range for clip
 * length (`knowledge/.../02-frames/PATTERNS.md` says so explicitly and refuses
 * to ship a `params.json` over impressions), so inventing a default here would
 * be inventing a number the UI then shows as if someone had checked it.
 */
export interface FrameClip {
  status: ClipStatus;
  /** The motion intent: what moves, in what direction, how far. Empty until the
   *  art-direction pass authors it or the user types one. */
  motion: string;
  /** One honest sentence when there is one to say. */
  note?: string;
}

/** A clip nobody has authored yet. Absence, stated. */
export const emptyClip = (): FrameClip => ({ status: "not-started", motion: "" });

/** A clip is authored when it says what moves. Nothing else can be true of it
 *  yet — see the note on `FrameClip`. */
export const isAuthoredClip = (f: Frame) => Boolean(f.clip?.motion.trim());
export const authoredClipCount = (fs: Frame[]) => fs.filter(isAuthoredClip).length;

/** Cuts stored before the clip layer existed have no `clip` key at all, and a
 *  renderer meeting `undefined` there is a crash rather than a blank row. Fill
 *  it on read — the store is IndexedDB on the user's own machine and there is no
 *  migration seam to hang this off. */
export const withClips = (fs: Frame[]): Frame[] =>
  fs.map((f) => (f.clip ? f : { ...f, clip: emptyClip() }));

/* ── The frame ────────────────────────────────────────────────────────────── */

export interface Frame {
  id: string;
  /** Position in the cut, from the beat. */
  at: string;
  /** Seconds, or NULL when `at` is not a timecode. Null rather than a number
   *  because there is no honest number for "nobody can place this beat" — see
   *  `secondsOf`. Every reader must decide what to do about it; `durationOf`
   *  answers `null` and the ledger draws a dash. */
  atS: number | null;
  kind: BeatKind;
  /** The beat's own label — the scene title, not something invented here. */
  title: string;
  /** What is said over this frame. */
  line: string;
  device?: string;
  plate: Plate;
  /** What the plate does. Authored here, rendered nowhere — see `FrameClip`. */
  clip: FrameClip;
  elements: FrameElement[];
  texts: FrameText[];
  /** Why THIS picture for THIS beat — the art director's one line. Present only
   *  on authored frames, which is exactly how you tell them apart from seeded
   *  ones at a glance. */
  rationale?: string;
}

/* ── What the step has cost ───────────────────────────────────────────────── */

/**
 * The art-direction pass's spend, persisted with the step.
 *
 * It exists because the header used to show a dollar figure that omitted the
 * single most expensive call in the step: `/api/frames` computes and returns the
 * pass's cost, and the client dropped it on the floor. A money number that
 * silently undercounts is worse than no number.
 *
 * It ACCUMULATES across passes, because the money did. And `unpriced` is why
 * this is a record rather than a float: the local Claude CLI does not always
 * report a cost, and a pass whose cost nobody knows must read as unknown, never
 * as zero. While `unpriced` is above nought, `costUsd` is a FLOOR.
 */
export interface DirectionSpend {
  /** How many art-direction passes this step has paid for. */
  runs: number;
  /** Summed cost of the passes the engine priced. */
  costUsd: number;
  /** Passes the engine reported no cost for. */
  unpriced: number;
  /** The LAST pass's wall time. Not summed — "this call takes minutes" is a
   *  fact about one call, and a running total of minutes answers no question. */
  lastMs?: number;
  lastAt: number;
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** A duration a human reads at a glance. Minutes are spelled out because the
 *  direction pass is the one call in this step measured in them, and "251s" is
 *  a number the reader has to do arithmetic on. */
export function humanMs(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

/**
 * "m:ss" or "h:mm:ss" → seconds, or NULL when the string is not a timecode.
 *
 * ONE PARSER, and this is the delegation that makes that true: the beat lane's
 * `atSeconds()` is it, `shots.ts#beatSeconds` already defers to it, and this
 * was the third and only disagreeing copy.
 *
 * What it used to do is worth recording, because all three failures were
 * SILENT and all three produced a confident number:
 *
 *   `"tbd"`     → `[NaN]`, and `(m || 0) * 60 + (s || 0)` folded it to **0** —
 *                 the beat took a position at the head of the cut, and
 *                 `durationOf` then measured its hold from there.
 *   `"1:02:03"` → destructured to `[1, 2]` and returned **62**, silently
 *                 discarding the hours field on any cut past an hour.
 *   `"90"`      → `[90]`, `s` undefined, and returned **5400** — a bare seconds
 *                 count read as ninety minutes.
 *
 * None of them could fail loudly, because every one of them is a number.
 */
export function secondsOf(at: string): number | null {
  return atSeconds(at);
}

/** How long a frame holds — until the next beat starts, or null when its own
 *  position does not parse.
 *
 *  The NEXT boundary is the next frame whose position is known, not simply the
 *  next frame: an unplaceable beat is not a boundary, it is a beat nobody can
 *  place, and ending this frame at it would be ending it at a time nobody
 *  knows. A frame with no placeable successor runs to the end of the cut, which
 *  is the honest read of "nothing is known to follow". */
export function durationOf(frames: Frame[], i: number, totalS: number): number | null {
  const startS = frames[i].atS;
  if (startS === null) return null;
  let nextS: number | null = null;
  for (let j = i + 1; j < frames.length; j++) {
    if (frames[j].atS !== null) {
      nextS = frames[j].atS;
      break;
    }
  }
  return Math.max(1, (nextS ?? totalS) - startS);
}

/* ── WHICH CUT THIS STEP IS WORKING ON ──────────────────────────────
 *
 * Frames used to answer this with one line: `const render = RENDERS[0]`. That is
 * the explainer's FIXTURE - `template: "mid-educational-video"`, sixteen beats
 * about Bitcoin - and every project got it, whatever its own record said. A
 * creator could pick the trailer discipline, compose a spine in Step 1, watch
 * Step 2's structure checker go green, open Step 3 and be shown somebody else's
 * argument. The shot lane (`./shots`) was built, regression-covered and
 * unreachable from real project data, because `shotsFromRender` returns `[]` for
 * anything that is not a promotional template and the fixture never was one.
 *
 * The record is the authority on WHICH LANE. What it is not yet the authority on
 * is which explainer FIXTURE an explainer project gets - see `explainerRender`.
 */

/** Where the beat chain this step is decomposing came from. Named on the object
 *  rather than inferred, because two of the three cases are absences and a
 *  surface that cannot tell them apart draws the wrong one. */
export type CutOrigin =
  /** The explainer's static candidate render. */
  | "explainer-fixture"
  /** THIS project's own composed trailer spine, read from the `script-trailer` step. */
  | "trailer-cut"
  /** A trailer project whose spine nobody has composed yet. Zero beats, and the
   *  zero means "nothing has been written", not "nothing was found". */
  | "no-spine";

/**
 * The chain Frames reads, whichever discipline produced it.
 *
 * Widened from `ScriptRender` rather than replacing it: `ScriptRender` satisfies
 * every member below structurally, so the explainer path hands its fixture
 * through untouched, and `ShotSourceRender` - what the shot lane consumes - is a
 * subset of it, which is the whole seam this type closes.
 */
export interface FramesRender extends ShotSourceRender {
  id: string;
  title: string;
  /** What produced this chain, in the words the step header says out loud. */
  engineLabel: string;
  origin: CutOrigin;
  beats: readonly ShotSourceBeat[];
}

export type FramesLane = "explainer" | "trailer";

/**
 * WHICH HALF OF THE STEP THIS PROJECT GETS - the same rule ScriptStep routes on
 * (`../script/ScriptStep.tsx`), written once so the two steps cannot answer the
 * same question differently. A trailer project, or a `free` project whose Step 1
 * chose beats over facts, is on the trailer lane.
 */
export function framesLane(
  discipline: Discipline | undefined,
  picksMode: string | undefined,
): FramesLane {
  const d = discipline ?? "educational";
  return d === "trailer" || (d === "free" && picksMode === "beats") ? "trailer" : "explainer";
}

/**
 * The explainer's chain - the fixture, carried through verbatim.
 *
 * AND THE FIXTURE IS STILL CHOSEN BY POSITION, WHICH IS DELIBERATE AND WORTH
 * SAYING OUT LOUD. `RENDERS` is a fixture list, not a per-project record:
 * nothing in this app stores WHICH candidate script a project accepted, so there
 * is nothing in the record to resolve against yet. Picking by `project.template`
 * instead would re-cut two of the five seeded explainer projects -
 * `short-form-clip` matches `derived-short`, which is six beats rather than
 * sixteen - and an explainer's frame count changing is the one thing this slice
 * must not do. The lane comes from the record; the fixture waits for a record to
 * come from.
 *
 * `template` here is the FIXTURE's, not the project's, and that is deliberate
 * too: the question the shot lane asks is "is this CHAIN a promotional cut", and
 * the chain is the explainer fixture. Reporting the project's template would let
 * a hand-edited record point an explainer chain at `shotsFromBeats`.
 */
export function explainerRender(fixture: ScriptRender): FramesRender {
  return {
    id: fixture.id,
    title: fixture.title,
    engineLabel: fixture.engineLabel,
    template: fixture.template,
    durationS: fixture.durationS,
    beats: fixture.beats,
    origin: "explainer-fixture",
  };
}

/**
 * A composed trailer spine, projected into the shape the shot lane reads.
 *
 * `toShotLaneBeat` is the beat layer's own projection and the only edge used -
 * this file never reaches into a `TrailerBeat` field by field, so widening the
 * trailer vocabulary cannot break it.
 *
 * `durationS` is the PROJECT'S target runtime, because that is the clock the
 * beats were placed against: the shot layer divides a beat's span by its shot
 * count, and a wrong total silently stretches the last beat to the end of a cut
 * that is not this one.
 */
export function trailerRender(
  cut: TrailerCut,
  opts: { template: string; durationS: number },
): FramesRender {
  const beats = cut.beats.map(toShotLaneBeat);
  return {
    // The cut's own id, so a stored frame list derived from a DIFFERENT chain
    // reads as stale exactly the way `renderId` already makes it read as stale.
    id: cut.id,
    title: cut.title,
    // Points at the view that actually carries this chain. Frames derives no
    // FRAMES from a trailer beat - a trailer beat is one to many SHOTS, and what
    // Frames renders from a shot is the next slice, not this one.
    engineLabel: `${templateOf(opts.template as TemplateId).label} · ${beats.length} beats — see the shots view`,
    template: opts.template,
    durationS: opts.durationS,
    beats,
    origin: "trailer-cut",
  };
}

/**
 * A trailer project with nothing composed. ABSENCE, CARRIED - not an empty
 * explainer, and not an empty grid.
 *
 * It is a real, reachable state and it is the state a new trailer project is in:
 * `useTrailerCut` writes the `script-trailer` step only once a spine has been
 * composed from confirmed picks, and Frames does not compose one. A downstream
 * step that seeded the upstream step's record would be inventing the artifact it
 * is supposed to be reading.
 */
export function absentTrailerRender(opts: {
  title: string;
  template: string;
  durationS: number;
}): FramesRender {
  return {
    id: `no-spine-${opts.template}`,
    title: opts.title,
    engineLabel: "no spine composed yet — Step 2 composes it",
    template: opts.template,
    durationS: opts.durationS,
    beats: [],
    origin: "no-spine",
  };
}

/**
 * The frames a chain derives.
 *
 * ONE BRANCH, and it is the byte-identical guarantee stated as code: only the
 * explainer fixture derives frames, and it derives them through the same
 * `framesFromRender` it always did, from the same object. A trailer chain
 * derives NONE - deliberately, because a `Frame` owns a `plate` and a plate is
 * what gets generated, so deriving frames from trailer beats would be building
 * the trailer's plate generation by accident. This slice gets the beats to the
 * shot lane; what Frames renders from them is the next one.
 */
export function framesFor(source: FramesRender, fixture: ScriptRender): Frame[] {
  return source.origin === "explainer-fixture" ? framesFromRender(fixture) : [];
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
      // Seeded empty on purpose. A motion guessed from the beat's kind is the
      // same lookup table `/api/frames` exists to replace — nine roles, nine
      // canned moves — and it would read as authored when nobody authored it.
      clip: emptyClip(),
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
