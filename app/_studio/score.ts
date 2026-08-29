// Glass Harbor's sound and cut: the music cues (one refused, honestly) and
// the timeline the Cut phase renders — drift and gaps included.

import type { MusicErrorKind } from "@/lib/music/errors";

import type { Cue, TimelineClip, TrackId } from "./projectTypes";

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
};

// Glass Harbor's standing music identity — the style block restated on every
// cue call (consistency is carried, never remembered; the same rule the
// imaging style block runs on). Per-cue direction rides in the cue's note.
export const MUSIC_STYLE_BLOCK = [
  "dark orchestral",
  "modern trailer production",
  "low strings and brass",
  "restrained percussion",
];

export const CUES: SpottingCue[] = [
  {
    id: "cue-1",
    title: "The door (build)",
    bpm: 84,
    startS: 0,
    durS: 13,
    status: "rendered",
    note: "Sits under scenes 1–2.",
    // The claim that used to ride in the note, demoted to what it actually is.
    declaredNotPerformed: "duck −6dB under VO",
  },
  {
    id: "cue-2",
    title: "Never at the gate (turn)",
    bpm: 112,
    startS: 13,
    durS: 13,
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
    startS: 26,
    durS: 5,
    status: "rendered",
    note: "Tail rings 1.5s past picture — intended.",
  },
];

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
