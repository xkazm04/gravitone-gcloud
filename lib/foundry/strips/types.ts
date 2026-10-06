// THE STRIP WIRE TYPES — shared by the pipeline that authors and renders
// code-rendered strips (pipeline/strips/*, Node) and the /foundry Strips tab
// (client). Nothing here imports Node.
//
// A strip is an 8-second clip whose every frame is computed by an LLM-written
// page (`strip.html` exposing `window.renderFrameAt(i)`), captured headless and
// encoded by ffmpeg. Plan: docs/code-rendered-strips-plan.md. On disk:
//
//   foundry-out/strips/<runId>/
//     run.json                 StripRun — written by pipeline/strips/run.mts
//     verdicts.json            StripVerdicts — written only by the app
//     <cardId>/strip.html      the authored page (LLM-written code: served only
//                              to a sandboxed iframe, never same-origin)
//     <cardId>/style.json      StyleModule — the reusable half
//     <cardId>/strip.mp4       h264, the master
//     <cardId>/strip.webm      the grid's playback copy
//     <cardId>/poster.jpg      frame 120
//     <cardId>/sheet.png       4x3 contact sheet, frames evenly spaced
//     <cardId>/meta.json       StripCard (the same record run.json carries)

export type StripLane = "edu" | "stat";

/** The closed medium vocabulary — what draws the frame. */
export type StripMedium = "svg" | "canvas" | "dom" | "css3d" | "webgl";

/** The closed motion vocabulary — how the frame changes over time. */
export type MotionGrammar = "draw-on" | "morph" | "camera" | "stepped" | "particle" | "reflow" | "type";

/** What a Leonardo supporting asset may be. Never text, logos or people. */
export type SupportAsset = "none" | "texture" | "backdrop" | "sprite";

/** One approach card from pipeline/strips/approaches.json. */
export interface Approach {
  id: string; // "E03", "S14"
  lane: StripLane;
  /** The brief this approach renders in round 1 (pipeline/strips/data/<case>.json). */
  case: string;
  name: string;
  medium: StripMedium;
  grammar: MotionGrammar;
  density: "low" | "mid" | "high";
  /** Stats lane only: a chart seat or a concept/landing seat. */
  seat?: "chart" | "concept";
  leonardo: SupportAsset;
  /** The Leonardo prompt when `leonardo` is not "none". No text, logos, people. */
  leonardoPrompt?: string;
  /** Packages inlined from node_modules into the page; nothing else may load. */
  vendored?: string[];
  /** The direction, in a few lines: palette, type, composition, signature move. */
  direction: string;
  /** Written before rendering: the most likely way this card loses. */
  falsifier: string;
}

export interface GateResult {
  ok: boolean;
  /** Short, factual: the measured value and the bar. */
  detail: string;
}

/** The four automated pre-gates. Recorded and shown; they never hide a strip. */
export interface StripGates {
  /** Cold, out-of-order frames equal the sequential capture. */
  seek: GateResult;
  /** Smallest visible text >= 26 px at 1080 wide, text inside the safe box. */
  legibility: GateResult;
  /** Motion in >= 3 of 8 seconds, no black frames. */
  motion: GateResult;
  /** Exactly STRIP_FRAMES frames captured. */
  length: GateResult;
}

export type CardStatus = "rendered" | "lint-failed" | "render-failed" | "author-failed";

export interface StripCard {
  /** "<lane>-<case>--<approachId>", "--r2" for a replica, "--ctrl" for a control. */
  id: string;
  lane: StripLane;
  case: string;
  /** The approach id, or "CTRL" for a brief's positive control. */
  approach: string;
  /** Present on a replica: the card id it replicates. */
  replicaOf?: string;
  effort: string;
  status: CardStatus;
  /** Lint errors (rule + excerpt), when status is lint-failed or after fixes. */
  lint?: string[];
  gates?: StripGates;
  /** Fix rounds spent (0..2). */
  rounds: number;
  /** Seat time spent authoring and fixing. */
  authorMs: number;
  renderMs: number;
  costUsd?: number;
  /** The Leonardo asset, when one was made. */
  asset?: { file: string; provider: string; costUsd?: number };
  /** Card-relative files that exist. */
  files: Partial<Record<"html" | "style" | "mp4" | "webm" | "poster" | "sheet", string>>;
  error?: string;
}

export interface StripRun {
  version: 1;
  id: string;
  at: string;
  width: { edu: number; stat: number };
  height: { edu: number; stat: number };
  fps: number;
  frames: number;
  /** Approach cards, copied from approaches.json at run start. */
  approaches: Approach[];
  cards: StripCard[];
  /** Replica discrimination per approach that has a replica: approach-to-
   *  approach sheet distance over author-to-author distance. >= 1.5 may author
   *  registry content; below it the picks are still picks. */
  discrimination?: Record<string, number>;
  status: "running" | "awaiting-triage" | "committed";
}

/** The closed reason vocabulary. Free notes cannot be aggregated; these can. */
export const STRIP_CHIPS = ["concept", "legibility", "motion", "craft", "identity", "too-busy", "generic", "broken"] as const;
export type StripChip = (typeof STRIP_CHIPS)[number];

export interface StripVerdict {
  verdict: "keep" | "reject";
  at: string;
  note?: string;
  chips?: StripChip[];
}

export type StripVerdicts = Record<string, StripVerdict>;

/** The reusable half of a strip: what round 2 hands the author INSTEAD of a
 *  prose description. A code renderer's style is a module, not a prompt block. */
export interface StyleModule {
  name: string;
  palette: { role: string; hex: string }[];
  type: { family: string; role: string; weight?: number }[];
  motion: { easing: string; cues: string[]; tempo: string };
  primitives: string[];
  textures: string[];
  notes?: string;
}

export const STRIP_FPS = 30;
export const STRIP_FRAMES = 240;
export const STRIP_SIZE = { edu: { width: 1920, height: 1080 }, stat: { width: 1080, height: 1920 } } as const;
