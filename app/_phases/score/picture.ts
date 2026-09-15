// THE PICTURE THE SCORE STEP SPOTS AGAINST — the creator's own frames, projected
// into the scene vocabulary the music seam already speaks.
//
// WHY THIS FILE EXISTS. `sceneClock`, `pictureFor` and `cuesFrom`
// (app/_studio/score.ts) every one of them takes `scenes: Scene[]` and merely
// DEFAULTS to the Glass Harbor fixture. The plumbing has accepted real data
// since the day it was written; nobody ever passed any. The Score step imported
// the frozen `CUES` constant instead — computed at module load, with no
// arguments — so a creator who authored their own plates in Step 3 opened Step 4
// and was asked to spot five scenes that are not theirs, beside a button that
// spends real money at /api/music/generate. The seam was half-built: this is the
// half that was missing.
//
// A `Frame` (app/_phases/frames/frames.ts) is what Step 3 writes; a `Scene`
// (app/_studio/projectTypes.ts) is what the music seam reads. The projection is
// DELIBERATELY LOSSY and every loss is named below, because filling a field
// merely because the type has one is precisely how a fixture comes to be
// mistaken for somebody's project.

import type { Scene } from "../../_studio/projectTypes";
import { durationOf, type Frame } from "../frames/frames";

export interface DerivedPicture {
  /** The beats that have a place on the clock, in narrative order. */
  scenes: Scene[];
  /**
   * The beats that do not — `at` is not a timecode, so `durationOf` answers
   * null and there is no honest span to draw. See the note in `pictureFromFrames`
   * for why they are separated out rather than given a number.
   */
  unplaced: Frame[];
  /**
   * The seconds of film these scenes cover, summed from their own holds.
   *
   * NOT the project's `targetS`, and the difference is worth stating: `sceneClock`
   * lays scenes end to end from zero, so the drawn clock is the span from the
   * first placeable beat to the end of the cut. A cut whose first beat starts at
   * 0:02 has two seconds of lead-in that no scene claims; measuring the ruler
   * against `targetS` would leave a tail nothing can reach and quietly imply the
   * score is short of the film. This number and the spans drawn on it are one
   * fact, which is the property the whole surface is built on.
   */
  totalS: number;
}

/**
 * Frames → the picture, for one project.
 *
 * `targetS` is the project record's target runtime — the same number
 * `FramesAssembly` hands `durationOf` as `render.durationS`. It closes the LAST
 * placeable beat, which has no successor to end at. A project record that could
 * not be read passes 0, and the last beat then takes `durationOf`'s own 1s
 * floor: a visible sliver rather than a plausible invented length.
 */
export function pictureFromFrames(frames: Frame[], targetS: number): DerivedPicture {
  const held = frames.map((frame, i) => ({ frame, holdS: durationOf(frames, i, targetS) }));

  /* WHAT A NULL HOLD DOES TO THE CLOCK: nothing, and it says so.
   *
   * `durationOf` returns null for a beat whose `at` is not a timecode — "nobody
   * can place this beat", in the words of `Frame.atS`. A scene IS a span: it is
   * drawn to scale on the ruler, it decides where the next scene starts, and its
   * seconds are the seconds of music a cue buys. There is no length that could
   * stand in for an unknown one without changing all three of those, so an
   * unplaceable beat is not made into a scene at all. It is carried out in
   * `unplaced` for the surface to name — the same rule `cuesFrom` applies one
   * layer up, where a spot with no picture becomes `unspottable` rather than a
   * cue with a default length. Zero would have been the tempting number and it
   * is the worst one: a zero-length scene reads as a beat that was scored. */
  const unplaced = held.filter((h) => h.holdS === null).map((h) => h.frame);
  const placed = held.filter((h): h is { frame: Frame; holdS: number } => h.holdS !== null);

  const scenes: Scene[] = placed.map(({ frame, holdS }, i) => ({
    id: frame.id,
    // 1-based narrative order over the beats that are ON the clock. An
    // unplaceable beat does not take a number, because the number is what the
    // spotting session and the cue brief refer to a scene by, and referring to
    // something with no span invites a cue over it.
    index: i + 1,
    // The beat's own label. `Frame.title`'s own comment — "the beat's own label
    // — the scene title, not something invented here" — is the whole argument
    // for this being the honest source, and it is why the picture lane can now
    // show the creator's sluglines instead of "sc 1 … sc 5".
    slug: frame.title,
    /* MOOD ← KIND, and this one is a judgement call with a reader.
     *
     * `Scene.mood` is not decoration: `cut/CutTimeline.tsx` tests it for /turn/i
     * to place the act-two marker, and every scene's mood reaches the music
     * brief verbatim (`lib/music/plan.ts`, pinned by
     * tests/golden-path/music-cue-brief.probe.spec.ts). A Frame carries nothing
     * that is a mood in the fixture's sense — the fixture writes prose like
     * "vertigo / turn" and there is no field on a Frame that anybody wrote
     * prose like that into. What a Frame does carry is `kind`, the beat's
     * rhetorical role from the script, whose vocabulary INCLUDES `turn` and
     * whose `turn` is the reversal itself rather than a word that happens to
     * coincide with it (see frames.ts#PROBLEM_OF). So the Cut's marker becomes
     * true instead of lucky.
     *
     * The alternatives were both worse: an empty mood silently moves the Cut's
     * turn to nowhere and strips the one piece of intent the music brief gets
     * per section, and inventing prose from the kind ("turn" → "vertigo") would
     * be this surface writing direction nobody asked for. A role is a smaller
     * claim than a mood, and it is one the record actually makes. */
    mood: frame.kind,
    targetS: holdS,
    // UNMAPPED, and left empty rather than faked. `frames` is the fixture's
    // contact sheet of candidate stills for a scene and `pickedFrameId` the one
    // that was rung; Step 3 has no such contest — a Frame owns exactly one
    // plate. Manufacturing a one-candidate list here would put a chosen mark on
    // a choice nobody made. The only reader of either is the landing contact
    // sheet, which draws the fixture.
    frames: [],
    pickedFrameId: null,
  }));

  return { scenes, unplaced, totalS: scenes.reduce((n, s) => n + s.targetS, 0) };
}
