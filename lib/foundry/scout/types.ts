// THE SCOUT WIRE TYPES - one night of the /scout loop, shared by the night store
// (./store.ts, server only), the ingest and scene producers, the CLI
// (pipeline/scout.mts), the Board's `scout` decision source and the Library's
// scout feed. Nothing here imports Node, so a client component may hold it.
//
// A NIGHT is one bounded run of the loop: the skill finds SOURCES on the web
// (a picture, a video, a page), the ingest producer brings each onto this box,
// and the night turns them into CANDIDATES - an extracted still style, a scene
// recipe with its replica keyframes and at most `clipCap` clips, a craft
// finding, a watchlist addition - and a GAME ASSET briefed in our own words (at most
// `assetCap` a night): concepts drawn from the brief, then a mesh asset made on this box.
// Everything one night made is ONE Board packet,
// `pkt:scout:<nightId>`, and only that packet's commit admits anything.
//
// The manifest mirrors foundry-out/scout/<nightId>/night.json. Optional keys
// are OMITTED, never null: a value nobody has produced yet is absent, and a
// render that failed keeps its candidate with `status: "failed"` and the
// vendor's or the tool's sentence verbatim in `error`.
//
// RIGHTS. A source is third-party material held on this box for study: it is
// `reference-only` by construction and no key here can say otherwise. It seeds
// WORDS (a style's recipe, a scene's recipe) and is never sent to a generator
// as a reference - a clip animates OUR replica still, never a source frame
// (visual-style-locking / style-onboarding-from-sample).

import type { AssetId, MeshBrief } from "../mesh/types";

/* ── Ids and limits ──────────────────────────────────────────────────────── */

/** `YYYY-MM-DD`, then `-2`, `-3` for a second run the same day (after-workday). */
export type NightId = string;
/** `s-01`, `s-02`, ... in the order the skill added them. */
export type SourceId = string;
/** `c-01`, `c-02`, ... in the order the night made them. */
export type CandidateId = string;

export const NIGHT_ID_RE = /^\d{4}-\d{2}-\d{2}(-\d{1,2})?$/;
export const SOURCE_ID_RE = /^s-\d{2,3}$/;
export const CANDIDATE_ID_RE = /^c-\d{2,3}$/;

/** The operator's night (spark media-training-loop, waves 2 and 4). */
export const DEFAULT_CEILING_USD = 15;
export const DEFAULT_TARGET = 20;
export const DEFAULT_CLIP_CAP = 2;
/** Game assets a night briefs while every 3D engine is still being profiled (spark game-3d-assets, wave 3). */
export const DEFAULT_ASSET_CAP = 3;
/** Hailuo takes 5 or 10 (lib/imaging/video/types.ts CLIP_DURATIONS); the night renders the short one. */
export const CLIP_SECONDS = 5;

/** A finding is a headline, not a paragraph; its quote is the evidence, verbatim. */
export const CLAIM_MAX = 140;
export const QUOTE_MAX = 400;
export const WHY_MAX = 200;
/** A run's USE: the content it can serve (a children's cartoon series, a music video, an explainer), one line. */
export const USE_MAX = 140;
export const MAX_SOURCES_PER_NIGHT = 60;

/* ── The night ───────────────────────────────────────────────────────────── */

/** `open` while the loop runs; `closed` once it stopped (and why); `committed` once the Board applied a verdict. */
export const NIGHT_STATES = ["open", "closed", "committed"] as const;
export type NightState = (typeof NIGHT_STATES)[number];

export const STOP_REASONS = ["deadline", "budget", "target", "failure", "sources-exhausted", "operator"] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export type Night = {
  readonly id: NightId;
  readonly startedAt: string;
  /** ISO instant the loop must stop launching by. */
  readonly deadline?: string;
  readonly ceilingUsd: number;
  readonly target: number;
  readonly clipCap: number;
  /**
   * Game assets the night may brief (`asset3d` candidates that reached the mesh stage or may
   * still). Absent on a night opened before 2026-10-22: DEFAULT_ASSET_CAP.
   */
  readonly assetCap?: number;
  /** A dry night ran on stand-ins; its packet can be triaged but commits nothing. */
  readonly dry: boolean;
  readonly state: NightState;
  readonly stop?: StopReason;
  readonly closedAt?: string;
  readonly sources: readonly ScoutSource[];
  readonly candidates: readonly Candidate[];
  /** Kernel job ids this night launched, in order - the budget is summed over them. */
  readonly jobs: readonly string[];
  /** Written by the Board's apply (lib/decision/v1/sources/scout.ts). */
  readonly committed?: NightCommit;
};

export type NightCommit = {
  readonly at: string;
  readonly by: string;
  /** Packet cell ids (see `cellId`). */
  readonly kept: readonly string[];
  readonly rejected: readonly string[];
  /** A rejected cell's reasons (the `scout` source's words), by cell id - the next night's taste. */
  readonly reasons: Readonly<Record<string, readonly string[]>>;
  /** A verdict's note, by cell id, where the operator wrote one. */
  readonly notes: Readonly<Record<string, string>>;
  /** True when the night was dry: the verdicts are recorded and nothing else was written. */
  readonly dry: boolean;
};

/* ── Sources ─────────────────────────────────────────────────────────────── */

export const SOURCE_KINDS = ["image", "video", "page"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_STATUSES = ["pending", "ingested", "failed"] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export type ScoutSource = {
  readonly id: SourceId;
  readonly url: string;
  readonly kind: SourceKind;
  readonly title: string;
  /** The channel, site or account the material is from, as the page names it. */
  readonly channel?: string;
  /** Why the skill picked it - one line, the skill's own words. */
  readonly why: string;
  readonly found: "watchlist" | "search";
  /** The watchlist line that led here, verbatim, when `found` is `watchlist`. */
  readonly watch?: string;
  /**
   * Set when the source teaches a whole mechanism, not one finding: the skill's line on what (spark
   * registry-feedback-loop). A keep from it queues a `source-rich` lead nominating the URL to the
   * registry's /intake.
   */
  readonly rich?: string;
  readonly rights: "reference-only";
  readonly status: SourceStatus;
  readonly error?: string;
  /** Night-relative files: the picture, or a video's gated keyframes (`sources/s-01/k-003.jpg`). */
  readonly files: readonly string[];
  /** A video's length as ffprobe read it. */
  readonly durationS?: number;
  /** A keyframe's timestamp in the source, by file, for a video. */
  readonly at?: Readonly<Record<string, number>>;
};

/* ── Candidates ──────────────────────────────────────────────────────────── */

export const CANDIDATE_KINDS = ["style", "scene", "finding", "watch", "asset3d"] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export const CANDIDATE_STATUSES = ["pending", "rendered", "failed"] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

type CandidateBase = {
  readonly id: CandidateId;
  readonly sourceIds: readonly SourceId[];
  readonly status: CandidateStatus;
  readonly error?: string;
  /** The kernel job that rendered it, when one did (findings and watch lines are written, not rendered). */
  readonly jobId?: string;
  /** What content the run can help make (operator, 2026-10-22: "we need the use stated" - a run with
   *  no purpose is a mindless output). Rejected with the `use case` reason, it steers the next nights
   *  away from that direction (taste.ts). Absent on runs from before the field. */
  readonly use?: string;
};

/** A still style: an ordinary extract run over this candidate's source pictures/keyframes. */
export type StyleCandidate = CandidateBase & {
  readonly kind: "style";
  /** foundry-out/extract/<runId> - its looks are the packet's rows for this candidate. */
  readonly extractRunId?: string;
};

export const SHOT_SIZES = ["extreme-wide", "wide", "medium", "close", "extreme-close", "insert"] as const;
export type ShotSize = (typeof SHOT_SIZES)[number];

/** A scene in WORDS. Never a subject's, a person's or a franchise's name: craft, not content. */
export type SceneRecipe = {
  readonly shot: ShotSize;
  /** Lens and placement: "low angle, 24mm, subject left third". */
  readonly camera: string;
  /** What moves and how: "slow push-in; dust drifts right to left". */
  readonly motion: string;
  readonly composition: string;
  readonly lighting: string;
  /** Named colours with their jobs: "teal ground", "amber accent". */
  readonly palette: readonly string[];
  /** The cut's pace around this shot, as read from the source's cut timestamps. */
  readonly rhythm: string;
  /** The shot's length in the source, seconds. */
  readonly durationS: number;
  /** The generation prompt the replica stills were made from, verbatim. */
  readonly prompt: string;
};

export type SceneClip = {
  /** Night-relative mp4 (`scenes/c-04/clip.mp4`). */
  readonly path: string;
  readonly durationS: number;
  /** The replica still it animates - ALWAYS one of `replicas`, never a source file. */
  readonly from: string;
  /** What rendered it: `ltx-local` on this box's ComfyUI (free, no spend row) or `hailuo` on Leonardo. Absent on a clip written before 2026-10-22. */
  readonly engine?: "ltx-local" | "hailuo";
  readonly usd?: number;
};

export type SceneCandidate = CandidateBase & {
  readonly kind: "scene";
  /** The source keyframes the recipe was read from (reference-only, the row's ref). */
  readonly keyframes: readonly string[];
  readonly recipe?: SceneRecipe;
  /** Night-relative replica stills (`scenes/c-04/replica-1.jpg`). */
  readonly replicas: readonly string[];
  /** Set when the launch asked for a clip - what the night's clip cap counts, rendered or not. */
  readonly clipRequested?: true;
  readonly clip?: SceneClip;
};

/** A craft line for knowledge/<template>/steps/<step>/PATTERNS.md, with its evidence. */
export type FindingCandidate = CandidateBase & {
  readonly kind: "finding";
  /** A knowledge/templates/<template> directory name. */
  readonly template: string;
  /** A steps/<step> directory name under it (`02-frames`). */
  readonly step: string;
  readonly claim: string;
  /** The source's words (a transcript line, a caption) or the skill's measurement, verbatim. */
  readonly quote: string;
  /**
   * `<night>/<candidate>` of a finding an earlier night KEPT that this one says again from another
   * source (spark registry-feedback-loop): kept, it is the second observation (n=2) and queues a
   * `finding-restated` lead.
   */
  readonly restates?: string;
};

/** A line the skill proposes for knowledge/scout/watchlist.md. */
export type WatchCandidate = CandidateBase & {
  readonly kind: "watch";
  readonly entry: string;
  readonly why: string;
};

/**
 * A game asset briefed from the night's gap analysis (spark game-3d-assets WP4): no source - the
 * brief is OUR words, and a found picture never becomes a concept or geometry. Its job draws the
 * concepts and hands off to the mesh store (lib/foundry/mesh/); `rendered` means that hand-off
 * happened, and what the mesh and finish jobs then made is read off the asset, never copied here.
 */
export type Asset3dCandidate = CandidateBase & {
  readonly kind: "asset3d";
  readonly brief: MeshBrief;
  /** Night-relative concept images, OURS (`assets/c-05/concept-1.png`), in the request's order. */
  readonly concepts: readonly string[];
  /** The mesh asset the hand-off wrote (lib/foundry/mesh/store.ts), once it did. */
  readonly assetId?: AssetId;
};

export type Candidate = StyleCandidate | SceneCandidate | FindingCandidate | WatchCandidate | Asset3dCandidate;

/* ── Packet cells ────────────────────────────────────────────────────────── */

/**
 * A packet cell id: `<candidateId>/<part>`. Style cells reuse the extract
 * adapter's own (`c-01/<look>/replica-1`), scene cells are `c-04/replica-1`,
 * `c-04/clip`, a finding or watch line is `c-07/text`, a game asset's variant `c-05/t2`. The Board, the apply and
 * `NightCommit` all spell it through this one function.
 */
export const cellId = (candidate: CandidateId, part: string): string => `${candidate}/${part}`;

/** The inverse of {@link cellId}; null for anything it could not have produced. */
export function parseCellId(id: string): { readonly candidate: CandidateId; readonly part: string } | null {
  const i = id.indexOf("/");
  if (i <= 0 || i === id.length - 1) return null;
  const candidate = id.slice(0, i);
  return CANDIDATE_ID_RE.test(candidate) ? { candidate, part: id.slice(i + 1) } : null;
}

/* ── Summaries ───────────────────────────────────────────────────────────── */

export type NightSummary = {
  readonly id: NightId;
  readonly state: NightState;
  readonly stop?: StopReason;
  readonly dry: boolean;
  readonly startedAt: string;
  readonly sources: number;
  /** Candidates by status - what the morning packet will hold. */
  readonly rendered: number;
  readonly failed: number;
  readonly pending: number;
};
