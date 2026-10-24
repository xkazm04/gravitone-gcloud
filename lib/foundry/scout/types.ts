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

import type { Aspect } from "../../imaging/types";
import type { CharacterCard, MuseJudge } from "./muse";
import type { AssetId, ExportProject, MeshBrief } from "../mesh/types";

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
/** Idea artboards a night draws in the Leonardo studio beside its plan (spark scout-idea-artboards: "always 20-30 ideas"). */
export const DEFAULT_IDEA_CAP = 25;
export const MAX_IDEA_CAP = 40;
/** An idea's title is its headline on the Board (question taste 2026-08-30: claim = headline <= 90 chars). */
export const IDEA_TITLE_MAX = 90;
export const IDEA_PROMPT_MAX = 1500;
/** What a kept idea becomes on the next night, through the act of that name. `stats` (spark stats-reels): a
 *  data video authored in code - kept, the next night researches its real data and renders the full strip.
 *  `character` (spark scout-muse, the muse wing only): a fictional adult woman's card - kept, it joins
 *  knowledge/scout-muse/characters.md and later nights draw her in other looks and situations. */
export const IDEA_TARGETS = ["scene", "style", "asset3d", "stats", "character"] as const;
export type IdeaTarget = (typeof IDEA_TARGETS)[number];
/** Where an idea came from: a watchlist line, a registry gap (registry.md), or neither (`free`). */
export const IDEA_ANCHORS = ["watch", "gap", "free"] as const;
export type IdeaAnchorKind = (typeof IDEA_ANCHORS)[number];
/** Stats-reel ideas a night authors beside its artboards (spark stats-reels, wave 1: "up to 6"). They count
 *  toward this cap only - not the idea cap, the ~20-row target or the clip cap. */
export const DEFAULT_REEL_CAP = 6;
export const MAX_REEL_CAP = 12;
/** The one inline block a reel's strip holds ALL its numbers in, so a kept reel's real data swaps in whole. */
export const REEL_DATA_ID = "strip-data";
/** A reel brief's data shapes (the strips fixtures' two race kinds, and three a stats reel also tells). */
export const REEL_KINDS = ["level-race", "cumulative-race", "counter", "ranking", "share"] as const;
export type ReelKind = (typeof REEL_KINDS)[number];
/** The strips vocabulary a reel's approach is written in (lib/foundry/strips/types.ts), less `webgl`: the
 *  harness's chromium runs --disable-gpu and draws it black. One list for the ideas door and the reel step. */
export const REEL_MEDIA = ["svg", "canvas", "dom", "css3d"] as const;
export const REEL_GRAMMARS = ["draw-on", "morph", "camera", "stepped", "particle", "reflow", "type"] as const;
export const REEL_DENSITIES = ["low", "mid", "high"] as const;

/**
 * What every night's work is FOR (operator, 2026-10-23): a YouTube video - a Short (~30 s) or a short
 * video (up to 5 minutes). A style is only ever the baseline look of such a video; nothing here is
 * made to be printed, hung or sold as an image.
 */
export const VIDEO_FORMATS = ["short", "video"] as const;
export type VideoFormat = (typeof VIDEO_FORMATS)[number];
/** A direction's premise: the story or the bit in a sentence or two. */
export const PREMISE_MAX = 280;
export const GENRE_MAX = 80;
/** Hailuo takes 5 or 10 (lib/imaging/video/types.ts CLIP_DURATIONS); the night renders the short one. */
export const CLIP_SECONDS = 5;

/** Suno tracks a night makes from kept music seeds (spark scout-decision-graph): one create each, ~4 clips. */
export const DEFAULT_TRACK_CAP = 4;
export const MAX_TRACK_CAP = 8;
/** Full-song visualizers a night renders from kept track clips (~20-30 min each on box.render). */
export const DEFAULT_VISUALIZER_CAP = 2;
export const MAX_VISUALIZER_CAP = 4;

/** A finding is a headline, not a paragraph; its quote is the evidence, verbatim. */
export const CLAIM_MAX = 140;
export const QUOTE_MAX = 400;
export const WHY_MAX = 200;
/** A run's USE: the content it can serve (a children's cartoon series, a music video, an explainer), one line. */
export const USE_MAX = 140;
/** A brief's application (what the output is for), a closed list; its specific target rides beside it. */
export const USE_APPS = ["videogame", "dating-sim", "roleplay", "companion-chat", "genre-video", "short", "other"] as const;
export type UseApp = (typeof USE_APPS)[number];
/** WHY the run was chosen, one free sentence (not the prompt). */
export const AIM_MAX = 200;
/** A look direction's slug, the key of the muse repeat guard. */
export const LOOK_SLUG = /^[a-z0-9-]{3,40}$/;
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
  /** Idea artboards the night may draw (`idea` candidates). Absent on a night opened before 2026-10-23: DEFAULT_IDEA_CAP. */
  readonly ideaCap?: number;
  /** Stats-reel ideas the night may author (`idea` candidates with target `stats`). Absent: DEFAULT_REEL_CAP. */
  readonly reelCap?: number;
  /** Suno tracks the night may make (`track` candidates). Absent on a night opened before 2026-10-23: DEFAULT_TRACK_CAP. */
  readonly trackCap?: number;
  /** Visualizers the night may render (`visualizer` candidates). Absent: DEFAULT_VISUALIZER_CAP. */
  readonly visualizerCap?: number;
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
  /** `idea`: one of OUR kept idea artboards, brought in to be developed (`fromIdea`). */
  readonly found: "watchlist" | "search" | "idea";
  /** The watchlist line that led here, verbatim, when `found` is `watchlist`. */
  readonly watch?: string;
  /**
   * Set when the source teaches a whole mechanism, not one finding: the skill's line on what (spark
   * registry-feedback-loop). A keep from it queues a `source-rich` lead nominating the URL to the
   * registry's /intake.
   */
  readonly rich?: string;
  /** `ours` only for a kept idea's artboard (`fromIdea`): we drew it, so it may be a replica's input. */
  readonly rights: "reference-only" | "ours";
  /** `<night>/<c-id>` of the kept idea artboard this source IS (spark scout-idea-artboards WP-I4). */
  readonly fromIdea?: string;
  /** The kept idea's seed, copied when the idea is brought in, so what develops it inherits the branch (spark scout-decision-graph). */
  readonly fromSeed?: SeedRef;
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

export const CANDIDATE_KINDS = ["style", "scene", "finding", "watch", "asset3d", "idea", "direction", "track", "visualizer"] as const;
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
  /** The application `use` names (the closed list); absent on runs from before spark scout-use-aim. */
  readonly app?: UseApp;
  /** Why this run was chosen: the question `use` raises answered in one sentence. The image prompt is NOT the aim. */
  readonly aim?: string;
  /** The look direction as a slug (muse character briefs): two briefs sharing one are a repeat. */
  readonly look?: string;
  /** `<night>/<c-id>` of the kept idea this candidate develops - it takes the idea off the to-develop list (taste.ts). */
  readonly fromIdea?: string;
  /**
   * The kept SEED this candidate grows from (spark scout-decision-graph): `<batch>/sd-NNN`. Set by the door
   * that takes it (ideas, track, direction) and copied from the idea onto whatever develops it, so every
   * run's effort rolls up to a branch. Absent on work from before seeds existed ("before seeds").
   */
  readonly fromSeed?: SeedRef;
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
/**
 * What a game asset is FOR (operator, 2026-10-23, after rejecting every asset of the first 3D nights for having no
 * stated use: "we cannot create assets without purpose ... either to create new type of project, or helping
 * existing"): an existing game project it helps (the export targets, lib/foundry/mesh/types.ts EXPORT_PROJECTS),
 * or a new kind of project it would open. Absent on assets briefed before the field.
 */
export type AssetServes = { readonly project: ExportProject } | { readonly newProject: string };

export type Asset3dCandidate = CandidateBase & {
  readonly kind: "asset3d";
  readonly brief: MeshBrief;
  readonly serves?: AssetServes;
  /** Night-relative concept images, OURS (`assets/c-05/concept-1.png`), in the request's order. */
  readonly concepts: readonly string[];
  /** The mesh asset the hand-off wrote (lib/foundry/mesh/store.ts), once it did. */
  readonly assetId?: AssetId;
};

/**
 * A rough intent drawn in the operator's Leonardo studio (spark scout-idea-artboards): one artboard,
 * no source - the brief is OUR words, anchored to a watchlist line or a registry gap. Kept, the next
 * night builds it into its `target` through that act; blocked, its title and reasons are banned from
 * the next ideation (taste.ts). The studio generation is deleted once the pixels are held.
 */
export type IdeaCandidate = CandidateBase & {
  readonly kind: "idea";
  readonly title: string;
  readonly target: IdeaTarget;
  /** The studio prompt, verbatim. */
  readonly prompt: string;
  /** The genre it tries (`animated comedy sketch`, `music video`, `data explainer`): what the night spreads across. Absent on the first batch. */
  readonly genre?: string;
  readonly anchor: { readonly kind: IdeaAnchorKind; readonly ref: string };
  /** Night-relative artboard, OURS (`ideas/c-12.png`), once drawn. A stats idea's is its strip's frame 120. */
  readonly image?: string;
  /** A stats idea's strip and its inputs, night-relative under `ideas/<c-id>/` (present only on target `stats`). */
  readonly reel?: ReelFiles;
  /** The still's aspect when it is not the scout wing's 16:9 (a muse portrait is 9:16). Absent: 16:9. */
  readonly aspect?: Aspect;
  /** A character idea's card (muse wing, target `character`). */
  readonly card?: CharacterCard;
  /** The eye's read of the drawn still (muse wing). A still that failed it was deleted; the candidate says why. */
  readonly judge?: MuseJudge;
};

/**
 * What the skill writes for a stats idea (the `ideas` door's `reel` field, spark stats-reels). The brief is
 * ILLUSTRATIVE on the night that proposes it (wave 2: triage ideas, not datasets) - plausible numbers in the
 * shape a real fixture would have (pipeline/strips/data/*.json), the source line on screen saying so. The
 * approach is the seat's own design (wave 2: topic + free design), in a strips approach card's fields.
 */
export type ReelBrief = {
  readonly brief: {
    readonly case: string;
    readonly title: string;
    readonly hook: string;
    readonly unit: string;
    readonly kind: ReelKind;
    /** The numbers, in the fixture's shape: free JSON the strip reads from its REEL_DATA_ID block. */
    readonly data: unknown;
    readonly steps?: readonly string[];
    readonly illustrative: true;
  };
  readonly approach: {
    readonly name: string;
    readonly medium: (typeof REEL_MEDIA)[number];
    readonly grammar: (typeof REEL_GRAMMARS)[number];
    readonly density: (typeof REEL_DENSITIES)[number];
    readonly direction: string;
    readonly falsifier: string;
  };
};

/** Where a stats idea's files live, night-relative. */
export type ReelFiles = {
  readonly brief: string;
  readonly approach: string;
  /** Present once the author turn wrote a strip that passed the lint. */
  readonly strip?: string;
};

/**
 * A DIRECTION to confirm (operator, 2026-10-23: "using Notes more as confirmation of direction - we
 * are going with animated comedy sketch, with xy artstyle, dark humor for adults, story around xy,
 * based on the approved decisions"). Words, no render: kept, it is a confirmed direction the next
 * nights work inside (taste.ts); rejected, a refused one they steer away from.
 */
export type DirectionCandidate = CandidateBase & {
  readonly kind: "direction";
  /** The direction in one headline: `Animated comedy sketch, dark humour for adults`. */
  readonly title: string;
  readonly format: VideoFormat;
  readonly genre: string;
  /** The look: a kept style's name, or a style in words. */
  readonly style: string;
  /** The register: `deadpan, dark`. */
  readonly tone: string;
  readonly audience: string;
  /** The story or the bit, in a sentence or two. */
  readonly premise: string;
  /** The committed cells it rests on (`<night>/<cell id>`), at least one. */
  readonly basedOn: readonly string[];
};

/** One Suno clip of a track, held in the night (`tracks/c-NN/a1.mp3`). Part `a1`..`a4` is its packet cell. */
export type TrackClip = {
  readonly part: string;
  readonly path: string;
  /** The Suno model that rendered it (`v6`, `v6-wild`). */
  readonly model: string;
  readonly title: string;
  readonly durationS?: number;
  /** suno.json's clip id (`sc-...`): what a visualizer enqueues from. */
  readonly clipId: string;
};

/**
 * A kept music seed made into a TRACK (spark scout-decision-graph): one Suno create from the seed's
 * sentence (both models, ~4 clips), each clip a cell in the audio tab. Kept, a clip is the next night's
 * visualizer; the video starts only once the song is final (registry music-video-production).
 */
export type TrackCandidate = CandidateBase & {
  readonly kind: "track";
  /** The seed's sentence, verbatim: what Suno was asked for. */
  readonly sentence: string;
  /** The Suno job (`suno.json` `sj-...`) the create ran as. */
  readonly sunoJobId?: string;
  readonly clips: readonly TrackClip[];
};

/**
 * A kept track clip rendered as a full-song VISUALIZER (the music-video pipeline: one still, particles,
 * low-band edge light, 1080p). Kept, it is the first rung of the music ladder (sibling spark
 * music-video-ladder builds the full video and its Short on top).
 */
export type VisualizerCandidate = CandidateBase & {
  readonly kind: "visualizer";
  /** `<night>/<c-id>/<part>` of the kept track clip it plays. */
  readonly track: string;
  /** The mv record (`lib/sound/mv` queue id) the render ran as. */
  readonly mvId?: string;
  /** Night-relative mp4 (`visualizers/c-NN/visualizer.mp4`) once collected. */
  readonly video?: string;
  /** The still it used: a kept idea artboard under the same seed (ours), or the studio's (`visualizers/c-NN/still.png`). */
  readonly still?: string;
  readonly durationS?: number;
};

export type Candidate =
  | StyleCandidate
  | SceneCandidate
  | FindingCandidate
  | WatchCandidate
  | Asset3dCandidate
  | IdeaCandidate
  | DirectionCandidate
  | TrackCandidate
  | VisualizerCandidate;

/**
 * A scout track's Suno job (`sj-scout-<night>-<c-id>`, lib/foundry/scout/track.ts): its clips and the visualizer
 * rendered from one are judged on the night's packet, so the suno and mv piles leave them out (spark
 * scout-decision-graph - one place a night's music is judged).
 */
export const isScoutSunoJob = (sunoJobId: string | null | undefined): boolean => sunoJobId?.startsWith("sj-scout-") === true;

/* ── Seeds ───────────────────────────────────────────────────────────────── */

/**
 * A SEED (spark scout-decision-graph): one sentence naming a genre, a subgenre, a type of content, an
 * audience and a format - the cheapest question the loop asks. ~100 a batch, triaged on their own packet
 * `pkt:seeds:<batch>`, every reject with a reason. A kept seed is a branch root: the next night derives
 * 2-3 narrower child seeds (`parent`) and draws 1-2 idea artboards on it (`fromSeed`), and everything
 * built from those records it. Words only: a batch is written by the seat, no job, no spend.
 *
 * Stored under `<scoutRoot>/seeds/<batch>/batch.json` (./seedStore.ts). A batch id is a night-shaped id
 * (`YYYY-MM-DD`, `-2`...), its own sequence; listNights never sees it (NIGHT_ID_RE on the root only).
 */
export type SeedBatchId = string;
/** `sd-001`, `sd-002`, ... in the batch's order. */
export type SeedId = string;
/** `<batch>/sd-NNN`. */
export type SeedRef = string;

export const SEED_BATCH_ID_RE = NIGHT_ID_RE;
export const SEED_ID_RE = /^sd-\d{3}$/;
export const SEED_REF_RE = /^\d{4}-\d{2}-\d{2}(-\d{1,2})?\/sd-\d{3}$/;
export const seedRef = (batch: SeedBatchId, seed: SeedId): SeedRef => `${batch}/${seed}`;

/** Who a seed is for - the graph's first grouping and the split's first level (wave 3: "children content vs other"). */
export const SEED_AUDIENCES = ["kids", "family", "adult"] as const;
export type SeedAudience = (typeof SEED_AUDIENCES)[number];
export const SEED_SENTENCE_MAX = 200;
export const DEFAULT_SEED_BATCH = 100;
export const MAX_SEED_BATCH = 150;

export type Seed = {
  readonly id: SeedId;
  /** The one sentence: the seed as the operator reads it on the Board. */
  readonly sentence: string;
  readonly genre: string;
  readonly subgenre: string;
  /** The type of content (`animated comedy sketch`, `music video`, `lyric video`, `data explainer`). */
  readonly type: string;
  readonly audience: SeedAudience;
  readonly format: VideoFormat;
  /** The kept seed this one narrows (a child seed); absent on a fresh one. */
  readonly parent?: SeedRef;
};

export type SeedCommit = {
  readonly at: string;
  readonly by: string;
  /** Seed ids (the packet's cell ids). */
  readonly kept: readonly SeedId[];
  readonly rejected: readonly SeedId[];
  /** Every rejected seed's reasons (the `seeds` source requires at least one). */
  readonly reasons: Readonly<Record<SeedId, readonly string[]>>;
  readonly notes: Readonly<Record<SeedId, string>>;
  readonly dry: boolean;
};

export type SeedBatch = {
  readonly id: SeedBatchId;
  readonly createdAt: string;
  /** The night that wrote it at its start, absent for a batch written by day (`/scout seeds`). */
  readonly night?: NightId;
  /** A dry batch is triaged like any other and its verdicts kept, but nothing derives from it. */
  readonly dry: boolean;
  readonly seeds: readonly Seed[];
  /** Written by the Board's apply (lib/decision/v1/sources/seeds.ts). */
  readonly committed?: SeedCommit;
};

/**
 * THE OPERATOR'S STEER (spark scout-decision-graph waves 2-4), `<scoutRoot>/steer.json` (./steer.ts):
 * an ADVISORY split of a night's runs - shares per audience (summing to 100) and per genre within an
 * audience (summing to 100) - that the next night's brief carries, and the branches PAUSED (a seed ref;
 * the doors that take a seed refuse one under it). Every change is appended to `history`, so a split can
 * be read back and re-applied a month later (registry budget-reallocation-prescription).
 */
export type SteerSplit = {
  readonly audience: Readonly<Partial<Record<SeedAudience, number>>>;
  readonly genre?: Readonly<Partial<Record<SeedAudience, Readonly<Record<string, number>>>>>;
};
export type SteerEntry =
  | { readonly at: string; readonly by: string; readonly act: "split"; readonly split: SteerSplit }
  | { readonly at: string; readonly by: string; readonly act: "pause" | "resume"; readonly ref: SeedRef };
export type Steer = {
  readonly split?: SteerSplit;
  readonly paused: readonly SeedRef[];
  readonly history: readonly SteerEntry[];
};

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
