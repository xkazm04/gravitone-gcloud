// THE MUSIC-VIDEO QUEUE - wire types (client-safe: no node imports).
//
// Audio's Settled column is a second hand-switched queue. A finished track
// (a take with local bytes, or a kept Suno clip, downloaded when the job runs)
// dropped there becomes an `MvJob`; once Start is pressed the worker
// (lib/sound/mv/queue.ts) analyses the track, has an LLM write a treatment
// from the TITLE AND THE ANALYSIS ONLY (operator, 2026-10-12: no lyrics, even
// where Suno has them), renders one Leonardo still through the studio pool,
// animates particles and the low-band light over it, and writes the YouTube
// proposal. (The code-drawn pulsing element was descoped on 2026-10-12: the
// operator judged it low quality next to the light effects. Its types and the
// compositor's drawing code stay for a later return; nothing sets it now.) It is rung 1 ("visualizer") of the registry's
// music-video form ladder (music-video-production/form-follows-what-the-track-gives).
//
// ABSENT VALUES ARE OMITTED KEYS, never null or "" - except `verdict`, where
// null is a real state ("not judged yet"), as on Suno clips.

import type { MvLookId } from "./looks";

/** Where the audio came from. `take` = a Sound-lab take with local bytes
 *  (including a folder import); `clip` = a kept Suno clip, fetched from its
 *  audioUrl when the job first runs. */
export type MvSourceKind = "take" | "clip";

export interface MvSource {
  kind: MvSourceKind;
  /** The take id or the Suno clip id. */
  id: string;
  /** The track's display title, as the card showed it when queued. */
  title: string;
}

export type MvJobState = "queued" | "active" | "done" | "failed" | "cancelled";

/** What the worker is doing on an active job, in order. */
export type MvPhase = "fetching" | "analysing" | "treating" | "imaging" | "rendering" | "writing";
export const MV_PHASES: readonly MvPhase[] = ["fetching", "analysing", "treating", "imaging", "rendering", "writing"];

/** What Regenerate can redo. `image` = a new treatment (or the operator's own
 *  prompt) AND a new still, then a re-render; `motion` = new effect parameters on the SAME still, then a
 *  re-render; `metadata` = new YouTube text only, no render. Everything not
 *  named is kept byte-identical (registry law edit-do-not-regenerate). */
export type MvPart = "image" | "motion" | "metadata";
export const MV_PARTS: readonly MvPart[] = ["image", "motion", "metadata"];

export type MvVerdict = "keep" | "drop";

/** The one code-drawn element the compositor can pulse on the beat. Position
 *  and radius are normalised to the frame (0..1; r against the frame height).
 *  DESCOPED 2026-10-12 - the treatment no longer asks for one and the render
 *  never draws one; kept for a later, better-looking return. */
export type MvFocalKind = "halo" | "ring" | "light" | "orb";
export const MV_FOCAL_KINDS: readonly MvFocalKind[] = ["halo", "ring", "light", "orb"];

export interface MvFocal {
  kind: MvFocalKind;
  x: number;
  y: number;
  r: number;
  /** 0..360. */
  hue: number;
}

/** The compositor's knobs the treatment sets. Ranges are clamped by the
 *  engine; the LLM's numbers are proposals. */
export interface MvMotion {
  /** Descoped (see MvFocal): only jobs made before 2026-10-12 carry it, and the
   *  render ignores it. */
  focal?: MvFocal;
  /** 0..1 - how many particles relative to the compositor's default. */
  particleDensity: number;
  /** 0..360. */
  particleHue: number;
  /** 0..1 - how strongly the low band drives the pulse. */
  pulseStrength: number;
}

/** The LLM's answer for `mv-treatment`. */
export interface MvTreatment {
  /** The Leonardo prompt. Never asks for text in the image (registry law
   *  checkability-routes-the-pixel). */
  prompt: string;
  negativePrompt?: string;
  motion: MvMotion;
  /** One line: why this image for this track. */
  rationale: string;
}

/** One chapter, from the section pass over the envelope (seconds). */
export interface MvChapter {
  startS: number;
  label: string;
}

/** The YouTube proposal. Held to lib/publish/youtube.ts `snippetProblem`
 *  (100-char title, 5000-byte description, 500 tag characters). The
 *  description already carries the chapter lines, drawn by code. */
export interface MvMetadata {
  title: string;
  description: string;
  tags: string[];
  chapters: MvChapter[];
}

/** The track's analysis summary - what the text turns are given beside the title. */
export interface MvAnalysis {
  durationS: number;
  /** Tempo candidates, strongest first (half/double siblings kept). */
  tempoBpm: number[];
  /** Mean energy per tenth of the track, 0..1 - the energy shape. */
  energyShape: number[];
  sections: MvChapter[];
}

/** Files the job owns, as store-relative paths (served by
 *  /api/sound/mv/jobs/<id>/file?kind=...). */
export interface MvFiles {
  audio?: string;
  still?: string;
  video?: string;
  /** Only jobs made before 2026-10-12: the thumbnail is now taken from a
   *  frame of the video by the operator, not drawn by the queue. */
  thumb?: string;
  envelope?: string;
}

export type MvFileKind = "audio" | "still" | "video" | "thumb";

export interface MvJob {
  /** `mj-` + 10 hex. */
  id: string;
  source: MvSource;
  state: MvJobState;
  phase?: MvPhase;
  analysis?: MvAnalysis;
  treatment?: MvTreatment;
  metadata?: MvMetadata;
  files: MvFiles;
  /** Set by Regenerate: the parts the next run redoes. Absent = a first run
   *  (every part). Cleared when the run lands. */
  redo?: MvPart[];
  /** The operator's note for the regenerated part, passed to the text turn. */
  note?: string;
  /** The operator's own still prompt for an `image` regenerate: used as the
   *  prompt instead of the treatment turn's (the no-text clause is still
   *  welded on). Cleared by a regenerate that does not carry one. */
  prompt?: string;
  /** Absolute path of a picture the operator supplied (an album's cover): the
   *  still step copies it instead of buying one, and no studio credits are
   *  spent. */
  stillFrom?: string;
  /** The album's look (lib/sound/mv/looks.ts): placed rain, fire and light
   *  drawn over the still. Absent = the treatment's particles and bloom only. */
  look?: MvLookId;
  verdict: MvVerdict | null;
  /** The driver's or engine's own sentence, verbatim. */
  error?: string;
  /** The schedule slot id once sent to Calendar. */
  slotId?: string;
  enqueuedAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface MvQueueState {
  running: boolean;
  /** Set when a crash stopped the queue mid-job: names the job and phase. */
  interrupted?: string;
}

/** Is the still-image vendor reachable? (the studio pool's signed-in profile) */
export interface MvDriverHealth {
  ok: boolean;
  reason?: string;
}

/** GET /api/sound/mv */
export interface MvSnapshot {
  jobs: MvJob[];
  queue: MvQueueState;
  driver: MvDriverHealth;
}

/** POST /api/sound/mv - a track per source; a source already holding a live
 *  (queued/active) job is skipped, not doubled. */
export interface MvEnqueueRequest {
  sources: MvSource[];
}

/** POST /api/sound/mv/jobs/<id> - Regenerate. `prompt` only with part
 *  `image`: the still is made from it as written, and no treatment turn runs. */
export interface MvRegenerateRequest {
  part: MvPart;
  note?: string;
  prompt?: string;
}

/** PATCH /api/sound/mv/jobs/<id> */
export interface MvPatchRequest {
  verdict?: MvVerdict | null;
  metadata?: Partial<Pick<MvMetadata, "title" | "description" | "tags">>;
}

/** POST /api/sound/mv/import - every audio file directly in `dir` becomes a
 *  finalized take; a file already imported (same path and size) is skipped. */
export interface MvImportRequest {
  dir: string;
}
export interface MvImportResult {
  added: number;
  skipped: number;
  takeIds: string[];
}

/** POST /api/sound/mv/jobs/<id>/calendar - a dry-run YouTube slot. */
export interface MvCalendarRequest {
  /** ISO 8601. */
  publishAt: string;
}
