// Glass Harbor's sound and cut: the music cues (one refused, honestly) and
// the timeline the Cut phase renders — drift and gaps included.

import type { MusicErrorKind } from "@/lib/music/errors";
import { cueDurationS, cueStartS } from "@/lib/music/plan";
import type { CuePicture } from "@/lib/music/types";

import { PROJECT, SCENES } from "./scenes";
import type { Cue, Scene, TimelineClip, TrackId } from "./projectTypes";

/**
 * A cue as the spotting session holds it — and deliberately NOT `Cue` verbatim.
 *
 * WHY `model` IS OMITTED. A cue is a REQUEST: a span of picture, a tempo, a
 * purpose. A model is a property of the TAKE that answered it, and this app
 * already records that properly — `MusicProvenance` (lib/music/types.ts) comes
 * back from every render carrying the vendor, the model id, the milliseconds
 * asked for and the plan sent. `Cue.model` was a second, hand-typed copy of
 * that fact, and being hand-typed it was free to be wrong: every cue here
 * declared `model: "lyria-3"` while the only engine this surface can reach is
 * ElevenLabs (lib/music/elevenlabs.ts). A fixture that names a vendor the code
 * never contacts is not a placeholder, it is a false receipt.
 *
 * So the model is not stored on the request at all. The surface shows one only
 * when a take has actually come back and brought its own provenance; a cue with
 * no take shows no model, because there is none to show.
 *
 * (`Cue.model` in projectTypes.ts now has no reader anywhere. It is that file's
 * own rule that a field with no reader either goes or says why it stays —
 * flagged for its owner rather than edited from here.)
 */
export type SpottingCue = Omit<Cue, "model"> & {
  /**
   * Why a `failed` cue failed, in the ONE vocabulary this codebase can actually
   * produce: `MusicErrorKind` (lib/music/errors.ts). Prose could attribute a
   * refusal to anyone; a kind cannot — every value here is a state the adapter
   * really reaches, so a fixture cannot claim a failure mode the engine has no
   * way of returning.
   */
  failure?: MusicErrorKind;
  /**
   * A behaviour this cue is SPECIFIED to get and does not have yet.
   *
   * It exists because the alternative was worse: cue-1's note used to end
   * "ducks -6dB under VO automatically", rendered verbatim to the user, while
   * `grep -rn "duck" app/ lib/ components/` matched that sentence and nothing
   * else in the repo. There is no mixing layer, no ducking, and no plan to
   * fake one. The intent is real and worth keeping on the record; asserting it
   * in the indicative was the defect. The surface renders this marked NOT
   * PERFORMED, so it reads as a commitment outstanding rather than a feature.
   */
  declaredNotPerformed?: string;
  /**
   * The film this cue plays under — DERIVED, never authored. See `cuesFrom`.
   *
   * `startS` and `durS` above are derived from it too, which is the point: the
   * span drawn on the clock, the length of music requested from the vendor, and
   * the scenes the model is told about are now three views of one fact instead
   * of three numbers somebody typed on three different days.
   */
  picture: CuePicture;
};

/**
 * WHAT A HUMAN SPOTS — and nothing else.
 *
 * A spotting session decides WHERE a cue goes and WHAT IT IS FOR. That decision
 * is here, as scene ids: cue-1 plays under scenes 1 and 2. Everything that
 * follows from it — where the cue starts on the clock, how long it runs, what
 * the model is told about the moment — is computed from the project's scene
 * record by `cuesFrom` below.
 *
 * DECIDING WHERE CUES GO IS NOT AUTOMATED HERE AND SHOULD NOT BE. A human
 * spots; this type is the shape of that human's decision.
 */
export interface CueSpot {
  id: string;
  title: string;
  bpm: number;
  /** The scenes this cue plays under, in order. The spotting itself. */
  sceneIds: string[];
  status: Cue["status"];
  note: string;
  failure?: MusicErrorKind;
  declaredNotPerformed?: string;
}

// Glass Harbor's standing music identity — the style block restated on every
// cue call (consistency is carried, never remembered; the same rule the
// imaging style block runs on). Per-cue direction rides in the cue's note.
export const MUSIC_STYLE_BLOCK = [
  "dark orchestral",
  "modern trailer production",
  "low strings and brass",
  "restrained percussion",
];

/**
 * The spotting: three cues over Glass Harbor's five scenes.
 *
 * Note what is NOT here — no `startS`, no `durS`. Those used to be typed
 * beside `sceneIds`' worth of prose ("Sits under scenes 1–2") with nothing
 * connecting the two, so the note and the number were free to disagree with the
 * picture and with each other. Now the scenes ARE the span.
 */
export const SPOTS: CueSpot[] = [
  {
    id: "cue-1",
    title: "The door (build)",
    bpm: 84,
    sceneIds: ["sc-1", "sc-2"],
    status: "rendered",
    note: "Hold the patience of the approach; do not resolve.",
    // The claim that used to ride in the note, demoted to what it actually is.
    declaredNotPerformed: "duck −dB under VO",
  },
  {
    id: "cue-2",
    title: "Never at the gate (turn)",
    bpm: 112,
    sceneIds: ["sc-3", "sc-4"],
    status: "failed",
    // The engine behind this button is ElevenLabs, and `refused` is the kind it
    // returns when the model declines a brief (elevenlabs.ts's vendorFailure:
    // a 451, or a 4xx naming moderation). Both halves of the old sentence were
    // wrong — the vendor and, by implication, the reason.
    failure: "refused",
    note: "ElevenLabs declined this brief — no clip was produced. The cut plays silence here and says so.",
  },
  {
    id: "cue-3",
    title: "Waterline (release)",
    bpm: 84,
    sceneIds: ["sc-5"],
    status: "rendered",
    note: "Land it. Tail rings 1.5s past picture — intended.",
  },
];

/**
 * WHERE EVERY SCENE SITS ON THE PROJECT CLOCK.
 *
 * The one derivation of the timeline, from `targetS` alone. The Score surface
 * used to compute this inline while the cue rows carried their own hand-typed
 * `startS`, which is two clocks that agreed by luck.
 */
export function sceneClock(scenes: Scene[] = SCENES): { scene: Scene; startS: number }[] {
  let at = 0;
  return scenes.map((scene) => {
    const startS = at;
    at += scene.targetS;
    return { scene, startS };
  });
}

/** A spot's scenes, in the engine's vocabulary. `null` when the project has no
 *  picture for it — see `cuesFrom`. */
export function pictureFor(spot: CueSpot, scenes: Scene[] = SCENES): CuePicture | null {
  const clock = sceneClock(scenes);
  const found = spot.sceneIds
    .map((id) => clock.find((c) => c.scene.id === id))
    .filter((c): c is { scene: Scene; startS: number } => Boolean(c));
  if (found.length !== spot.sceneIds.length || !found.length) return null;
  return {
    projectTitle: PROJECT.title,
    logline: PROJECT.logline,
    scenes: found.map(({ scene, startS }) => ({
      index: scene.index,
      slug: scene.slug,
      mood: scene.mood,
      startS,
      durS: scene.targetS,
    })),
  };
}

/**
 * Spots + picture → cues. THE HONEST-ABSENCE RULE LIVES HERE.
 *
 * A spot whose scenes the project does not have is NOT turned into a cue with a
 * default length. It has no span on the clock, nothing to tell the model about,
 * and no film to score — so it is not a cue, and it comes back in
 * `unspottable` with the reason, for the surface to say out loud.
 *
 * A project with no scenes at all therefore yields NO cues. That is the whole
 * point: a default cue standing in for a film that does not exist is worse than
 * an empty timeline, because an empty timeline is true.
 */
export function cuesFrom(
  spots: CueSpot[] = SPOTS,
  scenes: Scene[] = SCENES,
): { cues: SpottingCue[]; unspottable: { spot: CueSpot; why: string }[] } {
  const cues: SpottingCue[] = [];
  const unspottable: { spot: CueSpot; why: string }[] = [];
  for (const spot of spots) {
    const picture = pictureFor(spot, scenes);
    if (!picture) {
      unspottable.push({
        spot,
        why: scenes.length
          ? `covers ${spot.sceneIds.join(", ")}, which this project does not have`
          : "this project has no scenes yet — there is no picture to spot against",
      });
      continue;
    }
    const { sceneIds: _sceneIds, ...rest } = spot;
    cues.push({
      ...rest,
      // Derived, both of them. The cue's span IS the film it covers.
      startS: cueStartS(picture),
      durS: cueDurationS(picture),
      picture,
    });
  }
  return { cues, unspottable };
}

const SPOTTED = cuesFrom();

export const CUES: SpottingCue[] = SPOTTED.cues;
/** Spots that could not become cues, and why. Rendered, not swallowed. */
export const UNSPOTTABLE = SPOTTED.unspottable;

export const TIMELINE: TimelineClip[] = [
  { id: "t-v1", track: "video", label: "sc-1 pier walk", startS: 0, durS: 6, status: "ok" },
  { id: "t-v2", track: "video", label: "sc-2 crane cab", startS: 6, durS: 7, status: "ok" },
  { id: "t-v3", track: "video", label: "sc-3 rooftop", startS: 13, durS: 6, status: "missing" },
  { id: "t-v4", track: "video", label: "sc-4 the door", startS: 19, durS: 7, status: "missing" },
  { id: "t-v5", track: "video", label: "sc-5 waterline", startS: 26, durS: 5, status: "missing" },
  { id: "t-a1", track: "vo", label: "cold open (aud-1)", startS: 0.4, durS: 11.4, status: "ok" },
  { id: "t-a2", track: "vo", label: "heist beat (aud-2)", startS: 13.2, durS: 14.8, status: "drift", offsetMs: 300 },
  { id: "t-m1", track: "music", label: "cue-1 build", startS: 0, durS: 13, status: "ok" },
  { id: "t-m2", track: "music", label: "cue-2 turn", startS: 13, durS: 13, status: "missing" },
  { id: "t-m3", track: "music", label: "cue-3 release", startS: 26, durS: 5, status: "ok" },
];

export const TRACKS: { id: TrackId; label: string }[] = [
  { id: "video", label: "picture" },
  { id: "vo", label: "voice" },
  { id: "music", label: "music" },
];
