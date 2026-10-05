// THE PICTURE UNIT — one noun for "a picture held on the film for a while",
// whichever discipline produced it.
//
// Until this file, a `Frame` was "one explainer beat", identified by its INDEX
// (`fr-${i}`). Two things followed from that and both were defects:
//
//   · Identity was a position. Alternatives are keyed by frame id
//     (`alternatives/alts.ts`), so a project that switched its adopted render
//     showed the new render's `fr-3` the kept plates of the old render's `fr-3`
//     — paid pictures of a different beat.
//   · A trailer had no picture at all. `framesFor` answers `[]` for a trailer
//     chain (a trailer beat is one-to-many SHOTS, see `../shots.ts`), so Score
//     and Cut had nothing to spot or lay out, and every reader re-derived time
//     from `Frame.at` strings on its own.
//
// A UNIT carries what both need: an identity derived from the BEAT, never the
// position — `${sourceId}:${beatId ?? at}:${ordinal}` — and its place on the
// film as data (`startS`, `holdS`). An explainer beat projects to one unit; a
// trailer shot to one unit each.
//
// STAGE 1 OF frames-phase-A, and what is deliberately NOT here yet: Score and
// Cut still read the `frames` shadow of the record rather than units (stage 2),
// trailer units generate no plates (stage 3 — `shotPrompt.ts` is the subject),
// and the direction pass still keys scenes by `at` (stage 4, with `/api/frames`).
// So `framesFromUnits` projects BEAT units only: a shot unit is on the clock and
// has an identity, and nothing in the Frames step draws it as a frame yet.

import type { BeatKind, ScriptRender } from "../../script/types";
import {
  durationOf,
  emptyClip,
  framesFor,
  type Frame,
  type FrameClip,
  type FrameElement,
  type FramesRender,
  type FrameText,
  type Plate,
} from "../frames";
import { beatSeconds, shotsFromBeats, type Shot, type ShotSourceBeat } from "../shots";

/** What a unit is a picture OF. A beat holds one picture; a shot is one of the
 *  pictures a trailer beat decomposes into. */
export type UnitGrain = "beat" | "shot";

/** The beat a unit belongs to. `beatId` where the beat layer declared one (a
 *  trailer beat always does; an explainer beat never has); `at` always, because
 *  it is what the direction pass and a human both read a beat by. */
export interface BeatRef {
  beatId?: string;
  at: string;
}

/** A shot's derived staging, carried onto its unit so the unit is the one row a
 *  surface reads. Everything a `Shot` knows except what the unit already holds
 *  in its own fields (identity, clock, motion). */
export type ShotStaging = Omit<Shot, "id" | "beatId" | "beatAt" | "beatLabel" | "ordinal" | "ofBeat" | "holdS" | "motion">;

export interface PictureUnit {
  /** `${sourceId}:${beatId ?? at}:${ordinal}` — see `unitId`. A unit read from a
   *  record written before units existed keeps the id it was stored under; see
   *  `unitsFromFrames`. */
  id: string;
  /** The chain this unit was derived from: the adopted render's id, or the
   *  trailer cut's. The same value the record stores as `renderId`. */
  sourceId: string;
  beatRef: BeatRef;
  /** 1-based position of this unit INSIDE its beat — the same convention as
   *  `Shot.ordinal`. An explainer beat is `1` of `1`. */
  ordinal: number;
  /** How many units its beat carries. */
  ofBeat: number;
  /** Where the unit starts on the film, in seconds. Null when its beat cannot be
   *  placed (`at` is not a timecode) — never a guessed 0. */
  startS: number | null;
  /** How long it holds. Null exactly when `durationOf` would answer null. */
  holdS: number | null;
  kind: UnitGrain;
  /** The beat's own kind word: an explainer `BeatKind`, or a trailer beat kind. */
  beatKind: string;
  /** The beat's label. */
  title: string;
  /** What is said over it. */
  line: string;
  device?: string;
  plate: Plate;
  clip: FrameClip;
  elements: FrameElement[];
  texts: FrameText[];
  rationale?: string;
  /** Shot units only. */
  staging?: ShotStaging;
}

/** THE IDENTITY RULE, written once. A unit is named by the chain, the beat and
 *  its place inside that beat — never by where the beat sits in the list, which
 *  is what changes when a render changes. */
export const unitId = (sourceId: string, ref: BeatRef, ordinal: number) =>
  `${sourceId}:${ref.beatId ?? ref.at}:${ordinal}`;

/** Seconds, to the millisecond. Enough for any clock this app draws, and it
 *  keeps a sum of thirds from printing as 29.999999999999996. */
const ms = (s: number) => Math.round(s * 1000) / 1000;

/** The 1-based ordinal and count of each item within its beat key, in order. */
function ordinals<T>(items: readonly T[], keyOf: (t: T) => string): { ordinal: number; ofBeat: number }[] {
  const total = new Map<string, number>();
  for (const t of items) total.set(keyOf(t), (total.get(keyOf(t)) ?? 0) + 1);
  const seen = new Map<string, number>();
  return items.map((t) => {
    const k = keyOf(t);
    const ordinal = (seen.get(k) ?? 0) + 1;
    seen.set(k, ordinal);
    return { ordinal, ofBeat: total.get(k)! };
  });
}

/**
 * Frames → beat units, KEEPING each frame's id.
 *
 * Two callers, one rule. The migration reads a v1 record through this, and the
 * hook's save writes through it. Neither may re-identify a frame: a stored id is
 * what kept alternatives (`frames-alts.byFrame`), Score spots (`sceneIds`) and
 * board items already point at, and a v1 record is only ever reused for the
 * render it was derived from (`useFrames` re-derives on a different `renderId`),
 * so its positional ids cannot cross renders. New derivations get derived ids
 * from `unitsFromRender`; old records keep theirs.
 *
 * `totalS` closes the last beat, exactly as `durationOf` does. Null when the
 * chain's length is not known — the last placeable unit then has no honest hold
 * and gets `null` rather than a number.
 */
export function unitsFromFrames(
  frames: readonly Frame[],
  opts: { sourceId: string; totalS: number | null },
): PictureUnit[] {
  const list = frames as Frame[];
  const place = ordinals(list, (f) => f.at);
  const lastPlaced = list.reduce((n, f, i) => (f.atS !== null ? i : n), -1);
  return list.map((f, i) => ({
    id: f.id,
    sourceId: opts.sourceId,
    beatRef: { at: f.at },
    ...place[i],
    startS: f.atS,
    holdS: opts.totalS === null && i === lastPlaced ? null : durationOf(list, i, opts.totalS ?? 0),
    kind: "beat",
    beatKind: f.kind,
    title: f.title,
    line: f.line,
    ...(f.device !== undefined ? { device: f.device } : {}),
    plate: f.plate,
    clip: f.clip ?? emptyClip(),
    elements: f.elements,
    texts: f.texts,
    ...(f.rationale !== undefined ? { rationale: f.rationale } : {}),
  }));
}

/**
 * A chain → its units. The one derivation Frames runs.
 *
 *  · explainer → one unit per beat, seeded by `framesFor` exactly as before —
 *    the projection back to frames is byte-identical apart from the id.
 *  · trailer   → one unit per `shotsFromBeats` shot, on the cut's own clock.
 *  · no spine  → none, for the reason `absentTrailerRender` gives.
 */
export function unitsFromRender(source: FramesRender, fixture: ScriptRender): PictureUnit[] {
  if (source.origin === "explainer-fixture") {
    const seeds = framesFor(source, fixture);
    const place = ordinals(seeds, (f) => f.at);
    return unitsFromFrames(
      seeds.map((f, i) => ({ ...f, id: unitId(source.id, { at: f.at }, place[i].ordinal) })),
      { sourceId: source.id, totalS: source.durationS },
    );
  }
  if (source.origin === "trailer-cut") return trailerUnits(source);
  return [];
}

/**
 * Shots → units, with the clock rebuilt from the BEAT's span.
 *
 * Not from `Shot.holdS`, and that is the point of doing it here: the shot layer
 * rounds each hold to a tenth for its table (`round1(beatS / n)`), so three
 * shots over a five-second beat read 1.7 each and sum to 5.1. Summed along a
 * film, those tenths walk every later unit off its beat. A unit's hold is the
 * beat's span divided exactly, and each beat re-anchors at its own timecode, so
 * the error cannot accumulate past one beat.
 *
 * The span is computed by the shot layer's own rule — the next PLACEABLE beat,
 * or the end of the cut, floored at one second — and shots are matched to their
 * beats by walking both in order: `shotsFromBeats` emits exactly `ofBeat` shots
 * per placeable beat, in beat order, and none for an unplaceable one.
 */
function trailerUnits(source: FramesRender): PictureUnit[] {
  const shots = shotsFromBeats(source.beats, source.durationS);
  const placed = source.beats
    .map((b) => ({ b, s: beatSeconds(b) }))
    .filter((x): x is { b: ShotSourceBeat; s: number } => x.s !== null);
  const out: PictureUnit[] = [];
  let k = 0;
  placed.forEach(({ b, s: startS }, i) => {
    const spanS = Math.max(1, (placed[i + 1]?.s ?? source.durationS) - startS);
    const n = shots[k]?.ofBeat ?? 0;
    for (let j = 0; j < n; j++, k++) {
      const shot = shots[k];
      const { ordinal, ofBeat, motion } = shot;
      const ref: BeatRef = { ...(b.id !== undefined ? { beatId: b.id } : {}), at: b.at };
      const staging: ShotStaging = {
        ...(shot.movementId !== undefined ? { movementId: shot.movementId } : {}),
        role: shot.role,
        roleDeclared: shot.roleDeclared,
        pace: shot.pace,
        size: shot.size,
        angle: shot.angle,
        direction: shot.direction,
        placement: shot.placement,
        ...(shot.subject !== undefined ? { subject: shot.subject } : {}),
        seeded: shot.seeded,
        basis: shot.basis,
      };
      out.push({
        id: unitId(source.id, ref, ordinal),
        sourceId: source.id,
        beatRef: ref,
        ordinal,
        ofBeat,
        // Boundaries first, holds as their differences: the holds then sum to
        // the beat's span exactly, whatever the rounding did to each one.
        startS: ms(startS + (j * spanS) / n),
        holdS: ms(ms(startS + ((j + 1) * spanS) / n) - ms(startS + (j * spanS) / n)),
        kind: "shot",
        beatKind: b.kind,
        title: b.label,
        line: b.text,
        // A shot's picture starts where a beat's does: nothing generated, and
        // its motion exactly as the shot layer seeded it (empty).
        plate: { state: "empty" },
        clip: { ...emptyClip(), motion },
        elements: [],
        texts: [],
        staging,
      });
    }
  });
  return out;
}

/** A beat unit as the Frames step draws it. The inverse of `unitsFromFrames`. */
export function frameOfUnit(u: PictureUnit): Frame {
  return {
    id: u.id,
    at: u.beatRef.at,
    atS: u.startS,
    // A beat unit's kind word IS a BeatKind — `unitsFromFrames` wrote it from
    // `Frame.kind`. Shot units never reach here (see `framesFromUnits`).
    kind: u.beatKind as BeatKind,
    title: u.title,
    line: u.line,
    ...(u.device !== undefined ? { device: u.device } : {}),
    plate: u.plate,
    clip: u.clip ?? emptyClip(),
    elements: u.elements,
    texts: u.texts,
    ...(u.rationale !== undefined ? { rationale: u.rationale } : {}),
  };
}

/** The frames the step draws: its BEAT units. Shot units have no frame yet —
 *  that is stage 3, where a shot gets a plate of its own. */
export const framesFromUnits = (units: readonly PictureUnit[]): Frame[] =>
  units.filter((u) => u.kind === "beat").map(frameOfUnit);
