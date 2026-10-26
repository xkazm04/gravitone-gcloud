// THE DECISION GRAPH'S BUILDER - server only (spark scout-decision-graph WP-S2). Every night, every seed batch and
// the steer, joined into one @gt/domain/scoutGraph ScoutGraph; effort read from the kernel store when one is
// handed in (./effort.ts). `graphOf` is the pure half - the /scout screen's fixture side builds its universe
// through it too, so the two sides cannot disagree about a rule.
//
// THE NODES. A seed is `seed:<batch>/sd-NNN` (stage `seed`, or `derived` when it narrows a parent), its state
// its batch's commit. A candidate is `cand:<night>/<c-id>`: an idea artboard (a stats idea is a `reel`) at
// stage `idea`; a style, scene, game asset, direction, finding, watch line or track at stage `run`; a
// visualizer at stage `output` - kept, it IS the output; a storyboard at stage `board`, linked from its idea. Its state is the two-level triage rule (the Board's
// runVerdictOf): any kept cell keeps it, every cell rejected rejects it; an uncommitted candidate is its
// render's (`pending`, `failed`) or `open`. What a kept run LEFT that is real is `out:<night>/<c-id>`: a
// kept style's look, a scene's kept clip, a kept game asset's mesh, a kept finding's or watch line's
// knowledge line. A dry commit admitted nothing, so it leaves no output; a kept reel, direction, track or
// storyboard leaves none either (a reel's real data, a direction's nights, a track's visualizer, a
// storyboard's full video are later work).
//
// THE BRANCH. A candidate inherits its `fromSeed` seed's facets and sits under that seed's pause; with no
// seed it is BEFORE_SEEDS. The groups are audience, then `<audience>/<genre>`, then BEFORE_SEEDS last.
//
// ONE GRAPH PER WING (spark scout-muse). A wing is a root with its own nights, seeds and steer, so each graph is
// built inside its wing's scope and never joins the other's: the groups, the open packets and the shares are the
// wing's own. A muse node carries `wing: "muse"` and is decided on `pkt:scout:muse:<night>`.

import {
  BEFORE_SEEDS,
  GRAPH_STAGES,
  type GraphEdge,
  type GraphEffort,
  type GraphGroup,
  type GraphKind,
  type GraphNode,
  type GraphStage,
  type GraphState,
  type ScoutGraph,
} from "@gt/domain/scoutGraph";
import type { Store } from "@gt/kernel/store";

import { effortOf, sumEffort } from "./effort";
import { nextPart, openOf, partRunId } from "./parts";
import { ancestryOf, listSeedBatches, seedOf, seedsPacketId } from "./seedStore";
import { pausedUnder, readSteer } from "./steer";
import { readAllNights } from "./store";
import { parseCellId, SEED_AUDIENCES, SEED_REF_RE, seedRef, type Candidate, type Night, type SeedBatch, type Steer } from "./types";
import { DEFAULT_WING, SCOUT_WINGS, wingRunId, type ScoutWing } from "./wing";
import { activeWing, withWing } from "./wingScope";

export type GraphOptions = {
  /** The kernel store effort is read from (spend rows, job events); absent: no node carries effort. */
  readonly store?: Store;
  readonly now?: Date;
};

/** What the pure builder joins: the store's reads, already made. */
export type GraphInput = {
  readonly nights: readonly Night[];
  readonly batches: readonly SeedBatch[];
  readonly steer: Steer;
  /** By `<night>/<c-id>` (./effort.ts effortOf). */
  readonly effort?: ReadonlyMap<string, GraphEffort>;
  readonly now: Date;
  /** Whose nights these are; absent: the scout wing's. */
  readonly wing?: ScoutWing;
};

/** The nights a group's actual share is read over: the newest live ones. */
export const SHARE_NIGHTS = 7;

/** Where a night's open cells are decided: its own packet, or - committed in part - its remainder (./parts.ts). */
const nightPacket = (wing: ScoutWing, id: string, part = 1): string => `pkt:scout:${wingRunId(wing, id, part)}`;
/** Where a batch's open seeds are decided: its own packet, or its remainder. */
const batchPacket = (b: SeedBatch): string => seedsPacketId(partRunId(b.id, nextPart(b.committed) ?? 1));
const stageAt = (s: GraphStage): number => GRAPH_STAGES.indexOf(s);

export async function buildGraph(o: GraphOptions = {}): Promise<ScoutGraph> {
  const now = o.now ?? new Date();
  const [nights, batches, steer] = await Promise.all([readAllNights(), listSeedBatches(), readSteer()]);
  const wing = activeWing();
  if (o.store === undefined) return graphOf({ nights, batches, steer, now, wing });
  const effort = effortOf(o.store, nights, now);
  if (!effort.ok) throw effort.error;
  return graphOf({ nights, batches, steer, now, wing, effort: effort.value });
}

/** Every wing's graph, each built inside its own wing's scope. */
export async function buildGraphs(o: GraphOptions = {}): Promise<Record<ScoutWing, ScoutGraph>> {
  const now = o.now ?? new Date();
  const built = await Promise.all(SCOUT_WINGS.map((w) => withWing(w, () => buildGraph({ ...o, now }))));
  return Object.fromEntries(SCOUT_WINGS.map((w, i) => [w, built[i]])) as Record<ScoutWing, ScoutGraph>;
}

/* ── Nodes ───────────────────────────────────────────────────────────────── */

function stageKind(c: Candidate): { readonly stage: GraphStage; readonly kind: GraphKind } {
  if (c.kind === "idea") return { stage: "idea", kind: c.target === "stats" ? "reel" : "idea" };
  if (c.kind === "visualizer") return { stage: "output", kind: "visualizer" };
  // A kept idea composed as frames + words before any full video (spark scout-storyboards): its own column.
  if (c.kind === "storyboard") return { stage: "board", kind: "storyboard" };
  return { stage: "run", kind: c.kind };
}

/** The candidate's verdict, by the two-level rule; uncommitted, its render's. A cell still waiting on a remainder
 *  packet (a commit in parts, ./parts.ts) keeps its candidate open, whatever its other cells were given. */
export function candidateState(n: Night, c: Candidate): GraphState {
  const mine = (ids: readonly string[]): boolean => ids.some((id) => parseCellId(id)?.candidate === c.id);
  if (mine(openOf(n.committed))) return "open";
  if (n.committed !== undefined) {
    if (mine(n.committed.kept)) return "kept";
    if (mine(n.committed.rejected)) return "rejected";
  }
  if (c.status === "failed") return "failed";
  if (c.status === "pending") return "pending";
  return "open";
}

function trackTitle(nights: readonly Night[], ref: string): string | undefined {
  const [night, cid, part] = ref.split("/");
  const t = nights.find((n) => n.id === night)?.candidates.find((c) => c.id === cid);
  return t?.kind === "track" ? t.clips.find((k) => k.part === part)?.title : undefined;
}

/** The node's own words: the idea's title, the run's use, else what the run is of. */
function labelOf(c: Candidate, n: Night, nights: readonly Night[]): string {
  const source = n.sources.find((s) => c.sourceIds.includes(s.id))?.title;
  switch (c.kind) {
    case "idea":
    case "direction":
    case "storyboard":
      return c.title;
    case "finding":
      return c.claim;
    case "watch":
      return c.entry;
    case "track":
      return c.sentence;
    case "asset3d":
      return c.use ?? c.brief.subject;
    case "visualizer":
      return c.use ?? trackTitle(nights, c.track) ?? c.track;
    default:
      return c.use ?? source ?? `${c.kind} ${c.id}`;
  }
}

/** What a kept run left that is real, or nothing. */
function outputKind(n: Night, c: Candidate, state: GraphState): { readonly kind: GraphKind; readonly cell?: string } | undefined {
  if (state !== "kept" || n.dry || n.committed?.dry === true) return undefined;
  if (c.kind === "style") return { kind: "look" };
  if (c.kind === "asset3d") return { kind: "mesh" };
  if (c.kind === "finding" || c.kind === "watch") return { kind: "knowledge" };
  if (c.kind === "scene") {
    const cell = `${c.id}/clip`;
    return n.committed?.kept.includes(cell) === true ? { kind: "clip", cell } : undefined;
  }
  return undefined;
}

/** `cand:<night>/<c-id>` (or `seed:<ref>`) of a committed cell named `<night>/<cell id>`. */
function cellNode(ref: string): string | undefined {
  if (SEED_REF_RE.test(ref)) return `seed:${ref}`;
  const i = ref.indexOf("/");
  const cell = i < 0 ? null : parseCellId(ref.slice(i + 1));
  return cell === null ? undefined : `cand:${ref.slice(0, i)}/${cell.candidate}`;
}

/* ── The builder ─────────────────────────────────────────────────────────── */

export function graphOf(input: GraphInput): ScoutGraph {
  const { nights, batches, steer } = input;
  const wing = input.wing ?? DEFAULT_WING;
  const own = wing === "scout" ? {} : { wing };
  const oldest = <T extends { readonly id: string }>(xs: readonly T[], at: (x: T) => string): T[] => [...xs].sort((a, b) => at(a).localeCompare(at(b)) || a.id.localeCompare(b.id));
  const nodes: GraphNode[] = [];
  const links: GraphEdge[] = [];
  const pausedAt = (ref: string | undefined): boolean => ref !== undefined && pausedUnder(steer, ancestryOf(batches, ref)) !== undefined;
  const facetsOf = (ref: string | undefined) => {
    const s = ref === undefined ? undefined : seedOf(batches, ref)?.seed;
    return s === undefined ? {} : { audience: s.audience, genre: s.genre, subgenre: s.subgenre };
  };

  for (const b of oldest(batches, (x) => x.createdAt)) {
    for (const s of b.seeds) {
      const ref = seedRef(b.id, s.id);
      const k = b.committed;
      const state: GraphState = k?.kept.includes(s.id) === true ? "kept" : k?.rejected.includes(s.id) === true ? "rejected" : "open";
      nodes.push({
        id: `seed:${ref}`,
        stage: s.parent === undefined ? "seed" : "derived",
        kind: "seed",
        label: s.sentence,
        state,
        ...(pausedAt(ref) ? { paused: true as const } : {}),
        at: b.id,
        packet: state === "open" ? batchPacket(b) : seedsPacketId(b.id),
        cell: s.id,
        audience: s.audience,
        genre: s.genre,
        subgenre: s.subgenre,
        seed: ref,
      });
      if (s.parent !== undefined) links.push({ from: `seed:${s.parent}`, to: `seed:${ref}` });
    }
  }

  for (const n of oldest(nights, (x) => x.startedAt)) {
    for (const c of n.candidates) {
      const key = `${n.id}/${c.id}`;
      const id = `cand:${key}`;
      const state = candidateState(n, c);
      const effort = input.effort?.get(key);
      const branch = {
        ...(pausedAt(c.fromSeed) ? { paused: true as const } : {}),
        at: n.id,
        packet: nightPacket(wing, n.id, state === "open" ? (nextPart(n.committed) ?? 1) : 1),
        ...own,
        ...facetsOf(c.fromSeed),
        ...(c.fromSeed === undefined ? {} : { seed: c.fromSeed }),
      };
      const label = labelOf(c, n, nights);
      nodes.push({ id, ...stageKind(c), label, state, ...branch, ...(effort === undefined ? {} : { effort }) });

      if (c.fromIdea !== undefined) links.push({ from: `cand:${c.fromIdea}`, to: id });
      else if (c.fromSeed !== undefined && c.kind !== "visualizer") links.push({ from: `seed:${c.fromSeed}`, to: id });
      if (c.kind === "direction") for (const ref of c.basedOn) {
        const from = cellNode(ref);
        if (from !== undefined) links.push({ from, to: id });
      }
      if (c.kind === "finding" && c.restates !== undefined) links.push({ from: `cand:${c.restates}`, to: id });
      if (c.kind === "visualizer") {
        const [night, cid] = c.track.split("/");
        links.push({ from: `cand:${night ?? ""}/${cid ?? ""}`, to: id });
      }

      const out = outputKind(n, c, state);
      if (out !== undefined) {
        nodes.push({ id: `out:${key}`, stage: "output", kind: out.kind, label, state: "kept", ...branch, ...(out.cell === undefined ? {} : { cell: out.cell }) });
        links.push({ from: id, to: `out:${key}` });
      }
    }
  }

  const have = new Set(nodes.map((x) => x.id));
  const seen = new Set<string>();
  const edges = links.filter((e) => {
    const k = `${e.from}>${e.to}`;
    if (seen.has(k) || !have.has(e.from) || !have.has(e.to) || e.from === e.to) return false;
    seen.add(k);
    return true;
  });

  const newest = <T extends { readonly id: string }>(xs: readonly T[], at: (x: T) => string): T[] => oldest(xs, at).reverse();
  const openBatch = newest(batches, (x) => x.createdAt).find((b) => b.committed === undefined || nextPart(b.committed) !== undefined);
  const openNight = newest(nights, (x) => x.startedAt).find((n) => n.state === "closed");
  return {
    builtAt: input.now.toISOString(),
    nodes,
    edges,
    groups: groupsOf(nodes, nights, batches, steer),
    nights: nights.length,
    batches: batches.length,
    open: {
      ...(openBatch === undefined ? {} : { seeds: { packet: batchPacket(openBatch), undecided: openBatch.committed === undefined ? openBatch.seeds.length : openOf(openBatch.committed).length } }),
      ...(openNight === undefined ? {} : { night: { packet: nightPacket(wing, openNight.id, nextPart(openNight.committed) ?? 1), undecided: openNight.committed === undefined ? openNight.candidates.filter((c) => c.status === "rendered").length : openOf(openNight.committed).length } }),
    },
    paused: [...steer.paused],
  };
}

/* ── Groups ──────────────────────────────────────────────────────────────── */

/** The group keys a node counts in: its audience and its genre, or BEFORE_SEEDS. */
export function groupKeysOf(n: Pick<GraphNode, "audience" | "genre">): readonly string[] {
  if (n.audience === undefined) return [BEFORE_SEEDS];
  return n.genre === undefined ? [n.audience] : [n.audience, `${n.audience}/${n.genre}`];
}

export const isLive = (n: Pick<GraphNode, "state" | "paused">): boolean => n.paused !== true && (n.state === "open" || n.state === "pending" || n.state === "kept");
export const isDead = (n: Pick<GraphNode, "state">): boolean => n.state === "rejected" || n.state === "failed";

/** The steer's advisory target for a group key, in percent of a night's runs; undefined when the split names none. */
export function targetOf(steer: Steer, key: string): number | undefined {
  if (key === BEFORE_SEEDS || steer.split === undefined) return undefined;
  const [a, ...rest] = key.split("/");
  const audience = (steer.split.audience as Readonly<Record<string, number | undefined>>)[a ?? ""];
  if (rest.length === 0 || audience === undefined) return audience;
  const genres = (steer.split.genre as Readonly<Record<string, Readonly<Record<string, number>> | undefined>> | undefined)?.[a ?? ""];
  const g = genres?.[rest.join("/")];
  return g === undefined ? undefined : Math.round(audience * g) / 100;
}

function groupsOf(nodes: readonly GraphNode[], nights: readonly Night[], batches: readonly SeedBatch[], steer: Steer): GraphGroup[] {
  const by = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    for (const k of groupKeysOf(n)) {
      const xs = by.get(k);
      if (xs === undefined) by.set(k, [n]);
      else xs.push(n);
    }
  }

  // The actual share: run-stage candidates of the newest live nights, by the group their seed puts them in.
  const window = [...nights].filter((n) => !n.dry).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, SHARE_NIGHTS);
  const took = new Map<string, number>();
  let runs = 0;
  for (const n of window) {
    for (const c of n.candidates) {
      if (stageKind(c).stage !== "run") continue;
      runs++;
      const s = c.fromSeed === undefined ? undefined : seedOf(batches, c.fromSeed)?.seed;
      for (const k of groupKeysOf(s === undefined ? {} : { audience: s.audience, genre: s.genre })) took.set(k, (took.get(k) ?? 0) + 1);
    }
  }

  const group = (key: string, facets: { readonly audience?: string; readonly genre?: string }): GraphGroup => {
    const mine = by.get(key) ?? [];
    const live = mine.filter(isLive);
    const deepest = live.reduce((d, n) => Math.max(d, stageAt(n.stage)), -1);
    const depth = deepest < 0 ? undefined : GRAPH_STAGES[deepest];
    const target = targetOf(steer, key);
    return {
      key,
      ...facets,
      nodes: mine.length,
      live: live.length,
      dead: mine.filter(isDead).length,
      ...(depth === undefined ? {} : { depth }),
      effort: sumEffort(mine.map((n) => n.effort)),
      share: { ...(target === undefined ? {} : { target }), actual: runs === 0 ? 0 : Math.round(((took.get(key) ?? 0) / runs) * 100) },
      ...(live.length === 0 && mine.some((n) => n.paused === true) ? { paused: true as const } : {}),
    };
  };

  const out: GraphGroup[] = [];
  const split = steer.split;
  for (const a of SEED_AUDIENCES) {
    const named = split?.genre?.[a];
    if (!by.has(a) && split?.audience[a] === undefined) continue;
    out.push(group(a, { audience: a }));
    const genres = new Set<string>([...nodes.filter((n) => n.audience === a && n.genre !== undefined).map((n) => n.genre ?? ""), ...Object.keys(named ?? {})]);
    const count = (g: string): number => by.get(`${a}/${g}`)?.length ?? 0;
    for (const g of [...genres].sort((x, y) => count(y) - count(x) || x.localeCompare(y))) out.push(group(`${a}/${g}`, { audience: a, genre: g }));
  }
  out.push(group(BEFORE_SEEDS, {}));
  return out;
}

/* ── The brief ───────────────────────────────────────────────────────────── */

const fmtMin = (x: number): string => String(Math.round(x * 10) / 10);

/** The taste brief's `## Branches`: each group's live depth, keeps, effort and its split target vs actual share. */
export function branchesSection(graph: ScoutGraph, steer: Steer): string[] {
  if (graph.nodes.length === 0) return [];
  const kept = new Map<string, number>();
  for (const n of graph.nodes) if (n.state === "kept") for (const k of groupKeysOf(n)) kept.set(k, (kept.get(k) ?? 0) + 1);
  const lines = ["## Branches", ""];
  for (const g of graph.groups) {
    const e = g.effort;
    const target = targetOf(steer, g.key);
    const parts = [
      g.key,
      `live ${g.live}`,
      `dead ${g.dead}`,
      `reached ${g.depth ?? "nothing live"}`,
      `kept ${kept.get(g.key) ?? 0}`,
      `${e.runs} runs, ${fmtMin(e.gpuMin)} GPU min, $${e.geminiUsd.toFixed(2)} Gemini`,
      ...(target === undefined ? [] : [`split ${Math.round(target)}% / took ${g.share?.actual ?? 0}%`]),
    ];
    lines.push(`${g.genre === undefined ? "" : "  "}- ${parts.join(" · ")}`);
  }
  lines.push("");
  return lines;
}
