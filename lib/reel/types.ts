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

export interface ReelState {
  readonly v: 1;
  readonly slug: string;
  readonly stage: ReelStage;
  readonly idea: ReelIdea;
  readonly tableSha?: string;
  readonly cuts: Partial<Record<ReelCut, CutRecord>>;
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
