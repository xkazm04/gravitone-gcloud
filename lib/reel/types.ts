// THE REEL WIRE TYPES - one stat reel walked from an idea to its cuts by pipeline/reel.mts (the /reel skill
// wraps it). Nothing here imports Node, so the pure half (table, continuity, timing, state) is testable without
// a folder.
//
// A reel is a narration-free data video whose every frame is drawn by a page the session's text model writes
// (`strip.html` exposing `window.renderFrameAt(i)`, the strip contract of pipeline/strips/CONTRACT.md). No image
// model, no video model and no model call at render time: the only generated thing is the page's code, and the
// only numbers it may show are the ones this CLI issued to it.
//
//   <dir>/
//     reel.json              ReelState - the stage, the idea, the table's hash, each cut's record
//     table.json             ReelTable - the controlled content: real observations and dated events
//     continuity.json        Continuity - the measured shape of the table (steps, cast, lead changes)
//     <cut>/inputs/          CONTRACT.md, REEL.md, CUT.md, brief.json, data.json (the block, issued whole)
//     <cut>/out/strip.html   the page the session wrote
//     <cut>/proof/           twelve cold frames, f-<i>.png, for the eye
//     <cut>/render/          strip.mp4, strip.webm, poster.jpg, sheet.png, gates.json

/** Where the numbers came from. A reel with no named source and licence is not a real-data reel. */
export interface ReelSource {
  /** The line the screen shows: `Source: <name>`. */
  readonly name: string;
  readonly url: string;
  /** The licence as the source states it ("CC BY 4.0", "US public domain"). Never guessed. */
  readonly licence: string;
  /** ISO date the table was fetched or assembled. */
  readonly fetchedAt: string;
}

export interface ReelEntity {
  readonly id: string;
  readonly name: string;
  /** One value per period; null where the entity has no observation (drawn as absent, counted as 0). */
  readonly values: readonly (number | null)[];
}

/** A dated real-world event the data reacts to: the teaching layer of a format with no narrator. */
export interface ReelEvent {
  readonly id: string;
  /** Index into `periods`. */
  readonly period: number;
  /** The card's headline, at most 60 characters. */
  readonly title: string;
  /** The date as the screen shows it. */
  readonly date: string;
  /** One sentence of evidence, at most 140 characters. */
  readonly fact: string;
  /** Where the fact can be read. */
  readonly url: string;
}

export interface ReelTable {
  readonly v: 1;
  /** What one value counts ("wins", "TWh", "page views"). */
  readonly unit: string;
  /** What one period is ("race", "month", "day", "year"). */
  readonly granularity: string;
  /** True when values are running totals (a cumulative race driven by discrete events). */
  readonly cumulative: boolean;
  /** One label per REAL observation. An interpolated step does not belong here. */
  readonly periods: readonly string[];
  readonly entities: readonly ReelEntity[];
  readonly events: readonly ReelEvent[];
  readonly source: ReelSource;
}

/** The two cuts one table yields. The Short tests appetite; the long cut earns watch hours. */
export type ReelCut = "short" | "long";

export interface CutSpec {
  readonly lane: "stat" | "edu";
  readonly width: number;
  readonly height: number;
  /** Frames before the data starts moving: the question. */
  readonly hookFrames: number;
  /** Frames the final order is held: the answer, once. */
  readonly endFrames: number;
  /** Timeline frames per period, and the clamp on the timeline's length. */
  readonly framesPerPeriod: number;
  readonly minTimeline: number;
  readonly maxTimeline: number;
}

export const REEL_FPS = 30;

/** The length a cut may be, in seconds. A track outside it was made for another cut. */
export const CUT_SECONDS: Readonly<Record<ReelCut, readonly [number, number]>> = { short: [30, 60], long: [120, 240] };

/** 30-60 s vertical and 2-4 min landscape, at 30 fps. The timeline grows with the table inside its clamp. */
export const CUTS: Readonly<Record<ReelCut, CutSpec>> = {
  short: { lane: "stat", width: 1080, height: 1920, hookFrames: 60, endFrames: 90, framesPerPeriod: 4, minTimeline: 750, maxTimeline: 1650 },
  long: { lane: "edu", width: 1920, height: 1080, hookFrames: 90, endFrames: 210, framesPerPeriod: 12, minTimeline: 3300, maxTimeline: 6900 },
};

/** The measured shape of a table against the continuity gate (registry data-video-virality/continuity-gate). */
export interface Continuity {
  readonly ok: boolean;
  readonly steps: number;
  readonly entities: number;
  /** Median count of entities with a value above zero inside the top N, per period. */
  readonly onScreen: number;
  readonly leadChanges: number;
  /** Adjacent overtakes inside the top N across the whole table. */
  readonly movements: number;
  readonly events: number;
  /** Each leader in order, with the period label where it took the lead. */
  readonly leaders: readonly { readonly entity: string; readonly from: string }[];
  /** One sentence per floor the table is under, naming the measured value and the bar. */
  readonly failures: readonly string[];
}

export interface TimingPlan {
  readonly v: 1;
  readonly fps: number;
  readonly cut: ReelCut;
  readonly sections: { readonly hookEnd: number; readonly timelineEnd: number; readonly total: number };
  readonly topN: number;
  /** [frame, period], cumulative: the frame -> period map's knots. */
  readonly knots: readonly (readonly [number, number])[];
  /** Per period, the top N as indices into the table's `entities`, in the order the viewer sees. */
  readonly orders: readonly (readonly number[])[];
  /** Each event with the frame its period is reached. */
  readonly events: readonly { readonly id: string; readonly period: number; readonly frame: number; readonly dwell: number }[];
  /** Change per second by calendar group, uniform clock against this plan: how even the warp made it. */
  readonly evenness: { readonly cvUniform: number; readonly cvWarped: number };
}

export type ReelStage = "idea" | "data" | "planned";
export type CutStage = "briefed" | "proofed" | "cut";

export interface CutRecord {
  readonly stage: CutStage;
  readonly frames: number;
  /** sha256 of the issued data block; a page whose block differs is refused. */
  readonly dataSha: string;
}

export interface ReelIdea {
  readonly title: string;
  /** The question the first two seconds ask. It never names the winner. */
  readonly hook: string;
  /** Why someone keeps watching, with names and dates (registry path-over-conclusion). */
  readonly path: string;
}

/** The music bed a cut is planned to: the whole track plays, so the cut is as long as the track. */
export interface TrackRecord {
  /** File name inside the cut's folder. */
  readonly file: string;
  readonly seconds: number;
  readonly sha: string;
}

/* ── the film: one timeline, two faces (spark reel-studio, 2026-11-18) ───────────────────────────────────────
 *
 * The owner's rule (knowledge/reel/look.md): the desktop film runs at normal speed, 60 to 120 s; the phone film is
 * the SAME timeline rendered at 2x (`--step 2`), so it lasts half as long. One page pair shares one module:
 * `reel-desktop.html` (1920x1080) and `reel.html` (1080x1920), both exposing `window.REEL.frames` at desktop speed.
 * Everything a film owns lives under `<slug>/film/`. A field that has no value yet is OMITTED, never null or 0.
 */
export type FilmFace = "desktop" | "phone";
export const FILM_FACES: readonly FilmFace[] = ["desktop", "phone"];

export interface FilmFaceSpec {
  readonly width: number;
  readonly height: number;
  /** Render every `step`-th frame of the timeline: the phone film is the desktop timeline at 2x. */
  readonly step: 1 | 2;
  /** The page, film-relative. */
  readonly page: string;
  /** The silent master the render writes, film-relative. */
  readonly file: string;
  /** The master with its bed laid under it. */
  readonly mix: string;
  /** The compressed publish copy. */
  readonly release: string;
  /** What the publish copy is encoded to (2-pass libx264); the owner's band is +-30 MB around 50 MB. */
  readonly targetBytes: number;
}

export const FILM_SPEC: Readonly<Record<FilmFace, FilmFaceSpec>> = {
  desktop: { width: 1920, height: 1080, step: 1, page: "reel-desktop.html", file: "film-desktop.mp4", mix: "mix-desktop.mp4", release: "release-desktop.mp4", targetBytes: 50_000_000 },
  phone: { width: 1080, height: 1920, step: 2, page: "reel.html", file: "film-phone.mp4", mix: "mix-phone.mp4", release: "release-phone.mp4", targetBytes: 30_000_000 },
};

/** The folder inside a reel that holds its film. */
export const FILM_DIR = "film";

/** How long the DESKTOP film may run, in seconds. The phone film is half of it. */
export const FILM_SECONDS: readonly [number, number] = [60, 120];

/** One rendered silent master. */
export interface FilmRender {
  /** Film-relative file name (FILM_SPEC[face].file). */
  readonly file: string;
  /** Frames in the file (the phone film holds half the timeline's frames). */
  readonly frames: number;
  readonly seconds: number;
  readonly bytes: number;
  /** sha256 of the file, computed once when the render landed. */
  readonly sha: string;
  readonly renderedAt: string;
}

/** One compressed publish copy (bed included when the film has one). */
export interface FilmCopy {
  readonly file: string;
  readonly seconds: number;
  readonly bytes: number;
  readonly sha: string;
  readonly encodedAt: string;
  /** The bed the copy carries; absent for a silent copy. */
  readonly bedSha?: string;
  /** VMAF of the copy's picture against the master, when measured. A reading, never a gate. */
  readonly vmaf?: { readonly mean: number; readonly min: number };
}

/** What the operator typed into Suno to make the bed: recorded so a later spark can learn to make beds itself. */
export interface BedPrompt {
  readonly style: string;
  readonly title?: string;
  readonly lyrics?: string;
  /** The Suno model as the operator names it ("v5.5"). */
  readonly model?: string;
  /** The song's page on suno.com. */
  readonly url?: string;
  readonly note?: string;
}

/** The music bed under a film. One bed serves both faces: as-is on desktop, at atempo 2 on the phone. */
export interface BedRecord {
  /** Film-relative file name, `bed.<ext>`. */
  readonly file: string;
  readonly seconds: number;
  readonly sha: string;
  /** Integrated loudness as measured on attach. */
  readonly lufs?: number;
  /** The sound store take the bed was uploaded as, when it came through the take upload. */
  readonly takeId?: string;
  readonly prompt?: BedPrompt;
  readonly attachedAt: string;
}

export interface FilmRecord {
  /** The timeline's frame count at desktop speed (`window.REEL.frames`). */
  readonly frames: number;
  readonly renders: Partial<Record<FilmFace, FilmRender>>;
  readonly bed?: BedRecord;
  readonly copies: Partial<Record<FilmFace, FilmCopy>>;
  /** Film-relative jpgs: 12 frames spread across each face, and one poster. */
  readonly thumbs?: { readonly desktop: readonly string[]; readonly phone: readonly string[]; readonly poster: string };
  /** Set when the film was brought in from a folder made outside the pipeline. */
  readonly imported?: { readonly from: string; readonly at: string };
}

export interface ReelState {
  readonly v: 1;
  readonly slug: string;
  readonly stage: ReelStage;
  readonly idea: ReelIdea;
  readonly tableSha?: string;
  /** A track attached to a cut before it is planned. Absent: the cut is silent and as long as its table asks. */
  readonly tracks?: Partial<Record<ReelCut, TrackRecord>>;
  readonly cuts: Partial<Record<ReelCut, CutRecord>>;
  /** The film (one timeline, desktop and phone faces). Absent until a page pair was authored or imported. */
  readonly film?: FilmRecord;
  readonly updatedAt: string;
}

/** A refusal the operator can act on: the message is the one line the CLI prints. */
export class ReelError extends Error {
  readonly code: string;
  constructor(message: string, code = "refused") {
    super(message);
    this.name = "ReelError";
    this.code = code;
  }
}
