// THE SCREEN'S READING OF THE GRAPH - pure: which nodes and links each band draws, which bands open first, which
// paused seed holds a node, and the split editor's fields to and from the steer's split.
//
// A BAND is a group of the graph (@gt/domain/scoutGraph GraphGroup): an audience holds its genres' bands (the
// genre band draws the nodes - every seed names a genre, so an audience's nodes are its genres'), and
// BEFORE_SEEDS draws its own. A link crossing two bands (a child seed narrowed into another genre) is drawn in
// neither; the node panel names what a node grew from.

import { BEFORE_SEEDS, type GraphEdge, type GraphGroup, type GraphNode, type ScoutGraph } from "@gt/domain/scoutGraph";
import { isDeadNode } from "@gt/ui/components/graph/stageGraph.ts";

import type { SplitInput } from "../_port/contract.ts";

export type Band = {
  readonly group: GraphGroup;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  /** An audience's genre bands, in the graph's order. */
  readonly genres: readonly Band[];
};

const bandKey = (n: GraphNode): string => (n.audience === undefined ? BEFORE_SEEDS : n.genre === undefined ? n.audience : `${n.audience}/${n.genre}`);

export function bandsOf(g: ScoutGraph): Band[] {
  const nodes = new Map<string, GraphNode[]>();
  const where = new Map<string, string>();
  for (const n of g.nodes) {
    const k = bandKey(n);
    where.set(n.id, k);
    const xs = nodes.get(k);
    if (xs === undefined) nodes.set(k, [n]);
    else xs.push(n);
  }
  const edges = new Map<string, GraphEdge[]>();
  for (const e of g.edges) {
    const k = where.get(e.from);
    if (k === undefined || where.get(e.to) !== k) continue;
    const xs = edges.get(k);
    if (xs === undefined) edges.set(k, [e]);
    else xs.push(e);
  }
  const leaf = (group: GraphGroup): Band => ({ group, nodes: nodes.get(group.key) ?? [], edges: edges.get(group.key) ?? [], genres: [] });
  const out: Band[] = [];
  for (const group of g.groups) {
    if (group.key === BEFORE_SEEDS || group.audience === undefined) out.push(leaf(group));
    else if (group.genre === undefined) out.push({ ...leaf(group), genres: g.groups.filter((x) => x.audience === group.audience && x.genre !== undefined).map(leaf) });
  }
  return out;
}

/** Bands with no live node start folded. */
export function openAtFirst(bands: readonly Band[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const b of bands) {
    out[b.group.key] = b.group.live > 0;
    for (const g of b.genres) out[g.group.key] = g.group.live > 0;
  }
  return out;
}

/** A seed ref's chain, nearest first, itself included - read off the graph's seed-to-seed links. */
function ancestry(g: ScoutGraph, ref: string): string[] {
  const parent = new Map<string, string>();
  for (const e of g.edges) if (e.from.startsWith("seed:") && e.to.startsWith("seed:")) parent.set(e.to.slice(5), e.from.slice(5));
  const out: string[] = [];
  for (let at: string | undefined = ref; at !== undefined && !out.includes(at); at = parent.get(at)) out.push(at);
  return out;
}

/** What Pause or Resume acts on for a node: its seed, or the paused seed above it that holds it. */
export function steerRefOf(g: ScoutGraph, n: GraphNode): { readonly ref: string; readonly paused: boolean } | undefined {
  if (n.seed === undefined) return undefined;
  const held = ancestry(g, n.seed).find((r) => g.paused.includes(r));
  return held === undefined ? { ref: n.seed, paused: false } : { ref: held, paused: true };
}

/** The node a link names, when the graph holds it. */
export const nodeOf = (g: ScoutGraph, id: string): GraphNode | undefined => g.nodes.find((n) => n.id === id);

/* ── The venture filter (spark scout-vision S2) ─────────────────────────── */

/** The filter's value for every node, whatever its venture. A venture id is `vn-...`, so it never collides. */
export const ALL_VENTURES = "all";

/**
 * The graph narrowed to one venture's nodes (GraphNode.venture), the links between them, and the groups that still
 * hold a node with their node counts recounted - so a band reads as that venture's. `all` is the graph itself. The
 * split editor and the node panel read the whole graph: a venture filter narrows what is drawn, not the steer.
 */
export function byVenture(g: ScoutGraph, venture: string): ScoutGraph {
  if (venture === ALL_VENTURES) return g;
  const nodes = g.nodes.filter((n) => n.venture === venture);
  const ids = new Set(nodes.map((n) => n.id));
  const tally = new Map<string, { nodes: number; dead: number }>();
  const count = (key: string, dead: boolean): void => {
    const t = tally.get(key) ?? { nodes: 0, dead: 0 };
    tally.set(key, { nodes: t.nodes + 1, dead: t.dead + (dead ? 1 : 0) });
  };
  for (const n of nodes) {
    const dead = isDeadNode(n);
    count(bandKey(n), dead);
    if (n.audience !== undefined && n.genre !== undefined) count(n.audience, dead);
  }
  const groups = g.groups.flatMap((x) => {
    const t = tally.get(x.key);
    return t === undefined ? [] : [{ ...x, nodes: t.nodes, live: t.nodes - t.dead, dead: t.dead }];
  });
  return { ...g, nodes, edges: g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)), groups };
}

/* ── The split editor ────────────────────────────────────────────────────── */

/** The editor's fields, by group key (`kids`, `kids/comedy`): the split's whole percents as text, empty when unset. */
export type SplitFields = Readonly<Record<string, string>>;

export function fieldsOf(split: SplitInput | undefined): SplitFields {
  const out: Record<string, string> = {};
  for (const [a, v] of Object.entries(split?.audience ?? {})) out[a] = String(v);
  for (const [a, genres] of Object.entries(split?.genre ?? {})) for (const [g, v] of Object.entries(genres)) out[`${a}/${g}`] = String(v);
  return out;
}

/** The fields as the steer's split: an empty field is no share; a genre level only where one is filled. */
export function splitOf(fields: SplitFields): SplitInput {
  const audience: Record<string, number> = {};
  const genre: Record<string, Record<string, number>> = {};
  for (const [key, raw] of Object.entries(fields)) {
    const text = raw.trim();
    if (text === "") continue;
    const v = Number(text);
    const i = key.indexOf("/");
    if (i < 0) audience[key] = v;
    else {
      const a = key.slice(0, i);
      genre[a] = { ...(genre[a] ?? {}), [key.slice(i + 1)]: v };
    }
  }
  return Object.keys(genre).length === 0 ? { audience } : { audience, genre };
}
