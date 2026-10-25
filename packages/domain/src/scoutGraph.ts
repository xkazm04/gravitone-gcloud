// THE SCOUT'S DECISION GRAPH - zod-free, pure, so the /scout screen's client island may hold it (spark
// scout-decision-graph, 2026-10-23).
//
// The operator: "a major overview in Scout module to see large decision graph of active/inactive paths,
// which will help user to see how far decisions developed to become real outputs ... The graph will also
// highlight actively spent effort". The server builds it (lib/foundry/scout/graph.ts) from every night,
// every seed batch, the steer and the kernel's spend and job events; the screen only draws it.
//
// STAGES are the columns, left to right: a SEED (a branch root), a DERIVED child seed, an IDEA artboard, a
// STORYBOARD (spark scout-storyboards), a RUN (a style, a scene, a game asset, a stats reel, a direction, a track...), and an OUTPUT - what a kept
// run left that is real (a Library look, a clip, a mesh, a knowledge line, a visualizer). How far right a
// branch's live nodes reach is how far its decisions developed.
//
// A node's STATE is its verdict, never inferred: `open` is undecided or not yet committed, `pending` and
// `failed` are a render's, `kept` and `rejected` the operator's. `paused` is the steer's and marks a node
// whose branch the operator paused. Effort is what the kernel recorded, absent when nothing ran.

export const GRAPH_STAGES = ["seed", "derived", "idea", "board", "run", "output"] as const;
export type GraphStage = (typeof GRAPH_STAGES)[number];

export const GRAPH_KINDS = [
  // stage seed / derived
  "seed",
  // stage idea
  "idea",
  // stage board (spark scout-storyboards): a kept idea composed as frames + words before any full video
  "storyboard",
  // stage run
  "style",
  "scene",
  "asset3d",
  "reel",
  "direction",
  "finding",
  "watch",
  "track",
  // spark scout-vision S2: the night's proposals to birth a genre or a venture
  "genre",
  "venture",
  // stage output
  "look",
  "clip",
  "mesh",
  "knowledge",
  "visualizer",
  // spark scout-vision S2: a genre's piece - kept, it IS the output
  "piece",
] as const;
export type GraphKind = (typeof GRAPH_KINDS)[number];

export const GRAPH_STATES = ["open", "pending", "failed", "kept", "rejected"] as const;
export type GraphState = (typeof GRAPH_STATES)[number];

/** The group of everything made before the first seed was kept: work with no branch root. */
export const BEFORE_SEEDS = "before seeds";

/**
 * What a node (or a group, summed) cost. `geminiUsd` is the night ceiling's money (budget.ts `capped`);
 * `uncappedUsd` the studio, Suno and seat rows; `gpuMin` is claimed-to-done of its `gpu.local` jobs from the
 * kernel's append-only events. `shared` marks a node whose job served a batch (ideas, reels): its numbers
 * are the batch's divided evenly over the batch's candidates.
 */
export type GraphEffort = {
  readonly runs: number;
  readonly gpuMin: number;
  readonly geminiUsd: number;
  readonly uncappedUsd: number;
  readonly shared?: true;
};

export type GraphNode = {
  /** `seed:<batch>/sd-NNN`, `cand:<night>/<c-id>`, or `out:<night>/<c-id>`. */
  readonly id: string;
  readonly stage: GraphStage;
  readonly kind: GraphKind;
  /** The node's own words: the seed's sentence, the idea's title, the run's use or label. */
  readonly label: string;
  readonly state: GraphState;
  /** Set when the node or an ancestor sits under a paused seed. */
  readonly paused?: true;
  /** The night or batch it was made in (an id, `YYYY-MM-DD[-n]`). */
  readonly at: string;
  /** Where it is decided: `pkt:seeds:<batch>`, `pkt:scout:<night>` or `pkt:scout:muse:<night>`, and its cell when it has one. */
  readonly packet: string;
  readonly cell?: string;
  /** The branch root's facets (a seed's own; a candidate inherits its seed's). Absent: before seeds. */
  readonly audience?: string;
  readonly genre?: string;
  readonly subgenre?: string;
  /** The seed ref a run grows from, when it has one - what the steer's pause and the groups key on. */
  readonly seed?: string;
  readonly effort?: GraphEffort;
  /** The scout wing that made it (spark scout-muse): `muse`, or absent for the scout loop's own. */
  readonly wing?: "muse";
  /** The venture (`vn-...`) it was made inside (spark scout-vision S2): the run's own, or a trial's or piece's genre's. */
  readonly venture?: string;
};

export type GraphEdge = { readonly from: string; readonly to: string };

/**
 * A row band of the graph: an audience, then a genre inside it (key `kids`, `kids/comedy`), or BEFORE_SEEDS.
 * `depth` is the furthest stage a LIVE node in it reached. `share` sets the steer's advisory target against
 * the share of the last nights' runs the group actually took (percent).
 */
export type GraphGroup = {
  readonly key: string;
  readonly audience?: string;
  readonly genre?: string;
  readonly nodes: number;
  readonly live: number;
  readonly dead: number;
  readonly depth?: GraphStage;
  readonly effort: GraphEffort;
  readonly share?: { readonly target?: number; readonly actual: number };
  readonly paused?: true;
};

/** The packet a morning opens next, with its undecided count. */
export type GraphOpen = { readonly packet: string; readonly undecided: number };

export type ScoutGraph = {
  readonly builtAt: string;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  /** Audience groups then their genre groups, in the order the screen draws them; BEFORE_SEEDS last. */
  readonly groups: readonly GraphGroup[];
  readonly nights: number;
  readonly batches: number;
  /** The newest uncommitted seeds packet and night packet, when there is one. */
  readonly open: { readonly seeds?: GraphOpen; readonly night?: GraphOpen };
  /** The seed refs the steer holds paused. */
  readonly paused: readonly string[];
};
