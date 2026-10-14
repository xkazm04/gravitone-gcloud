// The project lifecycle's nouns — scenes walked through phases. Data lives
// in scenes.ts (story) and score.ts (music + the cut's timeline).
//
// SCOPED TO WHAT IS READ (2026-08-14). Deleting the Motion step left a tail of
// authored-but-unread shape here, and `Scene.clip: Clip` was the worst of it:
// it looked like the live clip model while the live one is `Frame.clip` in
// app/_phases/frames/frames.ts. Twelve types and fields with no reader anywhere
// are gone. What survives with no reader of its own survives for a stated
// reason, written next to it — being unable to tell "kept deliberately" from
// "nobody remembered to delete it" is the defect this pass closes.

export interface FrameCandidate {
  id: string;
  tone: string; // mock gradient stops
}

/** NOT Motion residue. Frames' own `FrameClip` reuses this union
 *  (app/_phases/frames/frames.ts) rather than declaring a second one, and
 *  `ClipStatusWord` in projectParts.tsx renders it for frames/LayerPanel.tsx.
 *  All four members are reachable through that path. */
export type ClipStatus = "rendered" | "rendering" | "failed" | "not-started";

export interface Scene {
  id: string;
  index: number; // 1-based, narrative order
  slug: string;
  /** Read, not decoration: the Cut finds the act-two turn by testing this for
   *  /turn/i (cut/CutTimeline.tsx) rather than hard-coding 13s. */
  mood: string;
  targetS: number;
  frames: FrameCandidate[];
  pickedFrameId: string | null;
}

export type CueStatus = "rendered" | "failed";

export interface Cue {
  id: string;
  title: string;
  bpm: number;
  startS: number;
  durS: number;
  status: CueStatus;
  model: string;
  note: string;
}

export type TrackId = "video" | "vo" | "music";

export interface TimelineClip {
  id: string;
  track: TrackId;
  label: string;
  startS: number;
  durS: number;
  status: "ok" | "drift" | "missing";
  /** Present when status === "drift". Read AND written by the Cut's sync bench
   *  (099d079) — it seeds the nudge control and moves the block on the ruler. */
  offsetMs?: number;
}
