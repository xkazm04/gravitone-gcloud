// THE CUT, DERIVED — the project's own steps laid end to end on one clock.
//
// Until 2026-10-05 the Cut drew `TIMELINE` (app/_studio/score.ts) for every
// project: ten hand-typed Glass Harbor clips, whatever the project was. This
// is the function that replaces it, and it is PURE — project record + the
// frames record + the score record in, lanes out — so the probe
// (tests/golden-path/cut.probe.spec.ts) can drive it on synthetic step data.
//
// WHERE EACH LANE COMES FROM, scouted before a line of this was written:
//
//   picture  `FramesStepData.frames` (frames/useFrames.ts:107), key "frames".
//            Order and duration are NOT stored: `Frame.atS` is the beat's
//            start, and a frame holds until the next placeable beat, which is
//            `durationOf` (frames/frames.ts:224). `pictureFromFrames`
//            (score/picture.ts) already projects that into `Scene`s with
//            `targetS` holds — the Score step spots against exactly this, so
//            the Cut and the Score draw ONE clock rather than two derivations
//            that could drift. The image is `Frame.plate.src` (a data: URL or
//            a public path) when `plate.state === "ready"`. A Frame's CLIP has
//            no URL and never will until a render seam exists: `FrameClip` is
//            authored, never rendered (frames.ts — "No progress bar. No fake
//            preview."), so the picture lane carries stills, honestly.
//
//   voice    NOTHING RECORDS A VOICE. No speech engine exists in lib/ or
//            app/api/ (grep, 2026-10-05). What does exist is the line each
//            frame says (`Frame.line`), so the voice lane draws one MISSING
//            block per spoken line: written, not recorded. That is the true
//            state of the work, and it is the finish line's job to say so.
//
//   music    `ScoreStepData.spots` (stepStore.ts), key "score": the creator's
//            spotting. A spot's span is DERIVED from the scenes it covers by
//            `cuesFrom` (app/_studio/score.ts) — the same call the Score step
//            makes — so the block here is the same seconds the vendor is asked
//            for. A TAKE is not persisted anywhere: it is an object URL held in
//            ScoreSpotting's state and dead on navigation (ADR
//            .vault/Architect/decisions/2026-08-29-score-take-persistence.md,
//            undecided). So a spot is a missing block unless a take is loaded
//            into THIS session (`takes` below), and nothing claims otherwise.
//
// THE FIXTURE. `TIMELINE` is Glass Harbor's cut and nobody else's — it names
// sc-1..sc-5 and runs 31s, which is `PROJECT` in app/_studio/scenes.ts. So it is
// the fallback for exactly one project, the seeded `seed-glass-harbor`, and only
// while that project has no frames of its own. Every derived cut says which of
// the three it is (`origin`), and the surface prints it.

import { PROJECT, SCENES } from "../../_studio/scenes";
import { TIMELINE, cuesFrom, sceneClock } from "../../_studio/score";
import type { TimelineClip, TrackId } from "../../_studio/projectTypes";
import type { Frame } from "../frames/frames";
import { pictureFromFrames } from "../score/picture";
import { toCueSpots, type ScoreSpot } from "../score/spots";

/** The one seeded project whose story the fixture tells. */
export const FIXTURE_PROJECT_ID = "seed-glass-harbor";

/** The upstream step that owns a clip — where "open its step" goes. */
export type OwnerStep = "frames" | "score" | "script";

export interface CutClip extends TimelineClip {
  /** The frame id (picture, voice) or cue id (music) this block stands for. */
  ref: string;
  owner: OwnerStep;
  /** Why the block is missing, in the work's own words. */
  why?: string;
  /** Picture: the plate. Music: the session take's object URL. */
  src?: string;
  /** The line spoken over it, or the cue's purpose — the work, verbatim. */
  note?: string;
}

export interface CutScene {
  id: string;
  index: number;
  label: string;
  /** The beat's role (project) or the fixture's mood. `/turn/i` places the
   *  act-two mark, as it always has. */
  mood: string;
  startS: number;
  durS: number;
  /** Fixture only: the picked candidate's gradient (scenes.ts), the one
   *  picture the fixture has. */
  tone?: string;
}

/** project → derived from this project's own steps; fixture → Glass Harbor's
 *  hand-typed cut; empty → nothing upstream to lay out yet. */
export type CutOrigin = "project" | "fixture" | "empty";

export interface Unplaced {
  label: string;
  why: string;
  owner: OwnerStep;
}

export interface DerivedCut {
  origin: CutOrigin;
  /** Seconds on the ruler: the sum of the scenes' holds. */
  totalS: number;
  /** The project record's target runtime; null when unread or unset. */
  targetS: number | null;
  scenes: CutScene[];
  clips: CutClip[];
  /** Beats and spots that have no honest place on the clock. */
  unplaced: Unplaced[];
  /** Frames by id, for the monitor's compositor. Empty for the fixture. */
  frames: Record<string, Frame>;
}

export interface CutInput {
  projectId: string;
  project: { title: string; logline: string; targetS: number } | null;
  /** `null` = no frames record; `[]` = a record with no frames in it. */
  frames: Frame[] | null;
  /** `null` = the Score step never saved a spotting. */
  spots: ScoreSpot[] | null;
  /** Cue id → a take loaded into this session. */
  takes?: Record<string, string>;
}

export const LANES: { id: TrackId; label: string }[] = [
  { id: "video", label: "picture" },
  { id: "vo", label: "voice" },
  { id: "music", label: "music" },
];

const OWNER: Record<TrackId, OwnerStep> = { video: "frames", vo: "script", music: "score" };

const PLATE_WHY: Record<string, string> = {
  empty: "no plate",
  generating: "plate generating",
  refused: "plate refused",
};

function fromFixture(targetS: number | null): DerivedCut {
  const scenes: CutScene[] = sceneClock(SCENES).map(({ scene, startS }) => ({
    id: scene.id,
    index: scene.index,
    label: scene.slug,
    mood: scene.mood,
    startS,
    durS: scene.targetS,
    tone: scene.frames.find((f) => f.id === scene.pickedFrameId)?.tone,
  }));
  return {
    origin: "fixture",
    totalS: PROJECT.totalS,
    targetS,
    scenes,
    clips: TIMELINE.map((c) => ({
      ...c,
      // A fixture picture clip names its scene in its label ("sc-3 rooftop");
      // that is the only join the fixture offers, and the monitor and the
      // strip need it to find the scene a block stands for.
      ref: c.track === "video" ? (SCENES.find((s) => c.label.startsWith(`${s.id} `))?.id ?? c.id) : c.id,
      owner: OWNER[c.track],
      ...(c.status === "missing" ? { why: "missing in the fixture" } : {}),
    })),
    unplaced: [],
    frames: {},
  };
}

export function deriveTimeline(input: CutInput): DerivedCut {
  const { projectId, project, frames, spots, takes = {} } = input;
  const targetS = project && project.targetS > 0 ? project.targetS : null;

  if (!frames || frames.length === 0) {
    if (projectId === FIXTURE_PROJECT_ID) return fromFixture(targetS);
    // Zero on the clock, not the target: there is nothing to play, and a
    // transport that runs a needle across nothing is a dead control dressed
    // as a live one.
    return { origin: "empty", totalS: 0, targetS, scenes: [], clips: [], unplaced: [], frames: {} };
  }

  // The project's record closes the last beat; an unread record passes 0 and
  // the last beat takes durationOf's 1s floor — a sliver, never a guess.
  const picture = pictureFromFrames(frames, project?.targetS ?? 0);
  const byId: Record<string, Frame> = Object.fromEntries(frames.map((f) => [f.id, f]));
  const clock = sceneClock(picture.scenes);

  const scenes: CutScene[] = clock.map(({ scene, startS }) => ({
    id: scene.id,
    index: scene.index,
    label: scene.slug,
    mood: scene.mood,
    startS,
    durS: scene.targetS,
  }));

  const clips: CutClip[] = [];
  for (const sc of scenes) {
    const f = byId[sc.id];
    const ready = f.plate.state === "ready" && Boolean(f.plate.src);
    clips.push({
      id: `pic-${sc.id}`,
      track: "video",
      label: sc.label,
      startS: sc.startS,
      durS: sc.durS,
      status: ready ? "ok" : "missing",
      ref: sc.id,
      owner: "frames",
      ...(ready ? { src: f.plate.src } : { why: PLATE_WHY[f.plate.state] ?? "no plate" }),
    });
  }

  for (const sc of scenes) {
    const line = byId[sc.id].line.trim();
    if (!line) continue;
    clips.push({
      id: `vo-${sc.id}`,
      track: "vo",
      label: line,
      startS: sc.startS,
      durS: sc.durS,
      status: "missing",
      ref: sc.id,
      owner: "script",
      why: "written, not recorded",
      note: line,
    });
  }

  const unplaced: Unplaced[] = picture.unplaced.map((f) => ({
    label: f.title,
    why: `"${f.at}" is not a timecode`,
    owner: "frames",
  }));

  if (spots) {
    const { cues, unspottable } = cuesFrom(toCueSpots(spots), picture.scenes, {
      title: project?.title ?? "",
      logline: project?.logline ?? "",
    });
    for (const cue of cues) {
      const take = takes[cue.id];
      clips.push({
        id: `mus-${cue.id}`,
        track: "music",
        label: cue.title,
        startS: cue.startS,
        durS: cue.durS,
        status: take ? "ok" : "missing",
        ref: cue.id,
        owner: "score",
        ...(take ? { src: take } : { why: "no take in hand" }),
        ...(cue.note ? { note: cue.note } : {}),
      });
    }
    for (const u of unspottable) unplaced.push({ label: u.spot.title, why: u.why, owner: "score" });
  }

  return { origin: "project", totalS: picture.totalS, targetS, scenes, clips, unplaced, frames: byId };
}

/** Index of the scene under `t`, or -1 past either end. Binary search: the
 *  monitor asks this on every clock tick through a selector. */
export function sceneIndexAt(scenes: CutScene[], t: number): number {
  let lo = 0;
  let hi = scenes.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const sc = scenes[mid];
    if (t < sc.startS) hi = mid - 1;
    else if (t >= sc.startS + sc.durS) lo = mid + 1;
    else return mid;
  }
  // The very end of the cut belongs to the last scene, not to nothing: a
  // playhead parked at `totalS` is still looking at the final frame.
  const last = scenes[scenes.length - 1];
  return last && t === last.startS + last.durS ? scenes.length - 1 : -1;
}

/** Where the act-two turn lands, read off the scenes — the rule the old Cut
 *  applied to the fixture's moods, now applied to whatever the cut is. */
export function turnOf(scenes: CutScene[]): { atS: number; label: string } | null {
  const sc = scenes.find((s) => /turn/i.test(s.mood));
  return sc ? { atS: sc.startS, label: sc.label } : null;
}
