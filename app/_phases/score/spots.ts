// WHERE MUSICAL INTENT COMES FROM — the script's movements, projected onto the
// picture the Frames step composed.
//
// WHY THIS FILE EXISTS. Commit `ea98136` gave the Score step the creator's own
// scenes and left the other half deliberately undone: `SPOTS`
// (app/_studio/score.ts) is a fixture whose three rows hardcode
// `sceneIds: ["sc-1", "sc-2"]` and friends, so against any real project every
// spot is correctly unspottable and the screen says so. Scenes had an upstream;
// intent did not.
//
// THE DOCTRINE DECIDES THE SHAPE, and it is not re-argued here.
// `knowledge/templates/trailer/steps/03-score/PATTERNS.md` §1 — "The cue is the
// parent. This step sits in the wrong place and must say so." — quoting
// `01-script/PATTERNS.md` §6: "Act boundaries are cue boundaries. Planning act
// durations in the abstract and then looking for music that fits produces a
// search with no results." And `script/trailer/types.ts` states the same thing
// as architecture: "`TrailerCut.cue` is a field of the cut, movements point
// INTO it, and the shot layer inherits the marks rather than setting them."
//
// So a spot is not invented here and it is not drawn freehand over the picture.
// It is a MOVEMENT, seen from the Score step: the movement's own label, the
// scenes its beats sit on, and — as the cue's intent — the label of the cue
// section that movement points into, verbatim. Nothing in this file writes a
// sentence of its own about anybody's film.
//
// WHAT IS NOT DERIVED, and this is the load-bearing absence: a TEMPO. That
// directory declares itself n=0 for the craft — no trailer cue has been torn
// down, timed or counted in this repo — and §8 says of the two bpm literals in
// the fixture, "CANNOT REPLACE… No source gives a trailer tempo, and none
// should — tempo is chosen from the picture by bar math." A `Movement` carries
// no tempo and neither does `Cue`. A proposed spot therefore arrives with none,
// and the surface says where the number is missing rather than filling it in.

import type { Scene } from "../../_studio/projectTypes";
import { sceneClock, type CueSpot } from "../../_studio/score";
import { atSeconds, type Movement, type TrailerCut } from "../script/trailer/types";

/**
 * A spot as THIS STEP holds one — the creator's spotting decision, persisted.
 *
 * Deliberately NOT `CueSpot`. A `CueSpot` is what the derivation in
 * `app/_studio/score.ts` consumes; this is what the creator edits and what the
 * step store keeps. The two extra fields are the difference between them, and
 * both are about provenance rather than about music:
 *
 *   · `proposed`     nothing but the derivation has touched this row. The
 *                    moment a human renames it, moves it, or types a tempo it
 *                    stops being a proposal and stops saying it is one.
 *   · `fromMovement` which movement it came from, so a proposal can be traced
 *                    back to the part of the spine that produced it.
 *
 * `status` is absent by construction: a spot is a REQUEST, and `CueStatus`
 * ("rendered" | "failed") is a fact about a take. Takes are not persisted (see
 * `ScoreStepData`), so nothing here could carry one honestly.
 */
export interface ScoreSpot {
  id: string;
  /** The movement's own label when proposed; the creator's words after that. */
  title: string;
  /** The scenes this cue plays under, in clock order. The spotting itself. */
  sceneIds: string[];
  /** What this cue is FOR. Proposed from the cue section the movement points
   *  into, verbatim — empty when the movement names no section, which the
   *  script step's own checker already reports as unmeasured. */
  note: string;
  /** ABSENT means nobody has chosen a tempo. See the header, and `CueSpot.bpm`. */
  bpm?: number;
  proposed?: boolean;
  fromMovement?: string;
}

/** A movement that has no place on this picture, and the reason in the
 *  surface's own words. The honest-absence rule `cuesFrom` already applies one
 *  layer up: a movement nothing can place is NOT given a span. */
export interface UnplacedMovement {
  movement: Movement;
  why: string;
}

export interface SpotProposal {
  spots: ScoreSpot[];
  unplaced: UnplacedMovement[];
}

/** Seconds, or null — a movement is placed by the earliest of its own beats'
 *  timecodes. `atSeconds` is the one parser in this repo (frames.ts#secondsOf
 *  defers to it) and it answers null rather than guessing, which is what makes
 *  "this movement cannot be placed" a fact instead of a zero. */
function entryOf(cut: TrailerCut, movement: Movement): number | null {
  const marks = cut.beats
    .filter((b) => b.movement === movement.id)
    .map((b) => atSeconds(b.at))
    .filter((s): s is number => s !== null);
  return marks.length ? Math.min(...marks) : null;
}

/**
 * Movements + this project's picture → proposed spots.
 *
 * THE MAPPING, and it is the judgement call this file is about. The cut carries
 * three things that could place a movement on a clock and only one of them is a
 * position: `ordinal` is an order (nothing says an ordinal is a second),
 * `cueSection` names a section of a cue that has no durations at all
 * (`CueSection` is id/kind/label/isBoundary — the shape's own comment refuses to
 * encode the tail's five seconds because "the duration is theirs and is NOT
 * encoded"), and the BEATS carry `at`, a real timecode in the same "m:ss"
 * vocabulary a Frame's `at` uses.
 *
 * So a movement's entry is the earliest timecode among its own beats, and it
 * runs until the next movement's entry — the same rule `durationOf` uses to
 * close a frame, for the same reason: nothing is known to follow, so it runs to
 * the end.
 *
 * A SCENE BELONGS TO THE MOVEMENT ITS START FALLS IN, and that rule is a
 * partition rather than an overlap test. The first version asked which scenes
 * OVERLAP a movement's window, which is the natural reading and is wrong on a
 * picture whose cuts do not line up with the cut's acts: a scene straddling two
 * movements was claimed by both, so two cues covered the same seconds of film,
 * the coverage total exceeded the clock, and the timeline drew two spans over
 * one another (measured on the Glass Harbor spine over a 286s picture,
 * 2026-09-08 — four movements smeared into one illegible band). A scene has one
 * piece of music under it. Its start is where that is decided, for the same
 * reason `sceneClock` and `durationOf` treat a start as the boundary.
 *
 * WHAT IS REFUSED. A movement with no placeable beat is not spread over a share
 * of the film, and one that holds no scene START is not given the nearest scene
 * — that scene is already somebody's. Both come back in `unplaced` with the
 * reason, for the surface to say out loud. A movement with no scene start
 * inside it is also a real finding rather than a nuisance: it means the picture
 * has no cut where the script says an act begins, which is §1's own point about
 * this step sitting downstream of the picture it should have decided.
 * Distributing movements evenly would produce a screen that looks like it
 * worked, which is the exact failure `cuesFrom`'s own header is written against.
 *
 * THE TWO CLOCKS ARE ASSUMED TO BE ONE, and that assumption is stated because
 * it is checkable rather than hidden: `sceneClock` lays the picture out end to
 * end from zero, so a beat's `at` and a scene's start agree exactly when the
 * first beat of the cut sits at 0:00 — which is what `framesFromRender` and
 * `composeCut` both produce. A cut whose picture starts later is off by that
 * lead-in, and the movement then lands on a neighbouring scene rather than on
 * nothing; there is no third record either could be measured against, so the
 * surface names the movement's own window in seconds and lets a reader see it.
 */
export function proposeSpots(cut: TrailerCut, scenes: Scene[]): SpotProposal {
  const clock = sceneClock(scenes);
  const filmS = clock.reduce((n, c) => n + c.scene.targetS, 0);
  const entries = cut.movements.map((movement) => ({ movement, entryS: entryOf(cut, movement) }));

  const spots: ScoreSpot[] = [];
  const unplaced: UnplacedMovement[] = [];

  entries.forEach(({ movement, entryS }, i) => {
    if (entryS === null) {
      unplaced.push({
        movement,
        why: "no beat in it carries a timecode, so nothing can say where it starts",
      });
      return;
    }
    // The next movement that IS placeable closes this one. A movement nobody
    // can place is not a boundary — ending here at it would be ending at a
    // time nobody knows.
    const next = entries.slice(i + 1).find((e) => e.entryS !== null)?.entryS;
    // The last placeable movement runs to the end of the picture. `filmS` is the
    // clock `sceneClock` lays out, so a movement entering past it holds nothing
    // and is reported rather than clamped.
    const endS = Math.max(next ?? filmS, entryS);

    // Half-open, [entry, end), which is what makes this a partition: a scene
    // start belongs to exactly one movement even when two movements enter on the
    // same second — the second of them then holds nothing and says so, rather
    // than drawing a second cue over the first one's film.
    const covered = clock.filter(({ startS }) => startS >= entryS && startS < endS);

    if (covered.length === 0) {
      unplaced.push({
        movement,
        why: `it runs ${entryS}s→${endS}s and no scene on this ${filmS}s of picture begins inside it`,
      });
      return;
    }

    spots.push({
      id: `spot-${movement.id}`,
      // The movement's own label. Not a sentence written here about somebody's
      // film — this file authors no prose at all.
      title: movement.label,
      sceneIds: covered.map((c) => c.scene.id),
      // The cue section the movement points INTO, verbatim, because that is
      // where this form keeps musical intent: "the cue is the skeleton, and the
      // picture parts are named after the cue movements they sit on". Empty
      // when the movement names no section — an absence the script step already
      // draws as "no cue section".
      note: cut.cue?.sections.find((s) => s.id === movement.cueSection)?.label ?? "",
      proposed: true,
      fromMovement: movement.id,
    });
  });

  return { spots, unplaced };
}

/** A spot the creator adds by hand. Not proposed, no movement behind it, and no
 *  tempo — the same refusal a proposed spot makes, for the same reason. */
export function newSpot(sceneIds: string[], taken: Iterable<string>): ScoreSpot {
  const used = new Set(taken);
  let id = `spot-${Date.now().toString(36)}`;
  let n = 2;
  while (used.has(id)) id = `spot-${Date.now().toString(36)}-${n++}`;
  return { id, title: "new cue", sceneIds, note: "" };
}

/** This step's spots in the vocabulary `cuesFrom` reads. The editing state
 *  (`proposed`, `fromMovement`) is dropped rather than carried down: it is a
 *  fact about the spotting session, and nothing below this line — a span, a
 *  duration, a vendor brief — may be different because a row was proposed. */
export function toCueSpots(spots: ScoreSpot[]): CueSpot[] {
  return spots.map(({ id, title, sceneIds, note, bpm }) => ({
    id,
    title,
    sceneIds,
    note,
    ...(bpm === undefined ? {} : { bpm }),
  }));
}
