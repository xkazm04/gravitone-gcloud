// THE STAGE GRAPH'S GEOMETRY - pure: which nodes a view draws, where each one sits, and the links between them
// (spark scout-decision-graph WP-S2). Five columns, left to right, one per GRAPH_STAGES stage; a node is a row
// in its stage's column.
//
// ONE GEOMETRY, SHARED BY EVERYTHING THAT DRAWS OR AIMS AT A NODE (canvas-graph: edge-management, "shared anchor
// geometry" - the day-line's rule, ../runs/dayline.ts). `layout` decides every node's column and row, `nodeBox`
// turns that into the box the node is drawn in, and every link is drawn from those boxes: a link cannot miss
// its node because there is only one answer to where the node is. Nothing is read back from the DOM.
//
// THE ORDER inside a column follows the branches: a column's nodes sort by the mean row of what they grow from
// in the columns to their left (a barycentre, one pass left to right), so an idea sits beside its seed and a run
// beside its idea and the links run mostly flat. A node nothing to its left feeds keeps the caller's order
// (chronological) below the ones that are fed.
//
// THE VIEW. `all` draws every node; `live` hides the dead (rejected, failed) and every link that touches one, and
// each column counts what it hid - the `+N` its head shows. A paused node is not dead: it stays, marked.

import { GRAPH_STAGES, type GraphEdge, type GraphNode, type GraphStage, type GraphState } from "@gt/domain/scoutGraph";

import { tokens, type TokenName } from "../../tokens.ts";
import type { StatusEntry } from "../status/status.ts";

export type GraphView = "live" | "all";

const px = (name: TokenName): number => Number.parseFloat(tokens[name]);

/** The tokens' own numbers: a node is a field's height wide as a lane's label, columns two gutters apart. */
export const GEOMETRY = {
  col: px("w-lane"),
  gap: px("sp-7") * 2,
  node: px("h-field"),
  row: px("sp-2"),
  head: px("h-row"),
} as const;

/** A node's verdict as a Look (../status/status.ts) and its word. Undecided waits on the operator (amber). */
export const GRAPH_LOOK: { readonly [S in GraphState]: StatusEntry } = {
  open: { look: "awaiting", label: "open" },
  pending: { look: "running", label: "pending" },
  failed: { look: "failed", label: "failed" },
  kept: { look: "done", label: "kept" },
  rejected: { look: "failed", label: "rejected" },
};

export const isDeadNode = (n: Pick<GraphNode, "state">): boolean => n.state === "rejected" || n.state === "failed";

export type Placed = { readonly node: GraphNode; readonly col: number; readonly row: number };
export type Column = { readonly stage: GraphStage; readonly placed: readonly Placed[]; readonly hidden: number };
export type Link = {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly d: string;
  /** Either end paused: the link is held, not live. */
  readonly held: boolean;
  /** Either end dead (drawn only under `all`). */
  readonly dead: boolean;
};
export type Laid = { readonly columns: readonly Column[]; readonly links: readonly Link[]; readonly width: number; readonly height: number; readonly shown: number };

export type Box = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

/** The box a node is drawn in, below the column heads. */
export function nodeBox(col: number, row: number): Box {
  return { x: col * (GEOMETRY.col + GEOMETRY.gap), y: GEOMETRY.head + row * (GEOMETRY.node + GEOMETRY.row), w: GEOMETRY.col, h: GEOMETRY.node };
}

/** A cubic from the right edge of `a` to the left edge of `b`; within one column, a loop out to its right. */
export function linkPath(a: Box, b: Box): string {
  const y1 = a.y + a.h / 2;
  const y2 = b.y + b.h / 2;
  const x1 = a.x + a.w;
  if (b.x > a.x) {
    const x2 = b.x;
    const mx = Math.max(GEOMETRY.gap / 2, (x2 - x1) / 2);
    return `M${x1},${y1} C${x1 + mx},${y1} ${x2 - mx},${y2} ${x2},${y2}`;
  }
  const out = GEOMETRY.gap / 2;
  const x2 = b.x + b.w;
  return `M${x1},${y1} C${x1 + out},${y1} ${x2 + out},${y2} ${x2},${y2}`;
}

/** The nodes a view draws, by id. */
export function visibleOf(nodes: readonly GraphNode[], view: GraphView): GraphNode[] {
  return view === "all" ? [...nodes] : nodes.filter((n) => !isDeadNode(n));
}

export function layout(nodes: readonly GraphNode[], edges: readonly GraphEdge[], view: GraphView): Laid {
  const shown = visibleOf(nodes, view);
  const ids = new Set(shown.map((n) => n.id));
  const kept = edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const preds = new Map<string, string[]>();
  for (const e of kept) {
    const xs = preds.get(e.to);
    if (xs === undefined) preds.set(e.to, [e.from]);
    else xs.push(e.from);
  }

  const rowOf = new Map<string, number>();
  const colOf = new Map<string, number>();
  const columns: Column[] = GRAPH_STAGES.map((stage, col) => {
    const mine = shown.filter((n) => n.stage === stage);
    const order = new Map(mine.map((n, i) => [n.id, i]));
    const bary = (n: GraphNode): number => {
      const rows = (preds.get(n.id) ?? []).filter((p) => (colOf.get(p) ?? col) < col).map((p) => rowOf.get(p) ?? 0);
      return rows.length === 0 ? Number.POSITIVE_INFINITY : rows.reduce((a, b) => a + b, 0) / rows.length;
    };
    const keyed = mine.map((n) => ({ n, b: bary(n), i: order.get(n.id) ?? 0 }));
    keyed.sort((p, q) => (p.b === q.b ? p.i - q.i : p.b - q.b));
    const placed = keyed.map(({ n }, row) => {
      rowOf.set(n.id, row);
      colOf.set(n.id, col);
      return { node: n, col, row };
    });
    const hidden = view === "live" ? nodes.filter((n) => n.stage === stage && isDeadNode(n)).length : 0;
    return { stage, placed, hidden };
  });

  const byId = new Map(shown.map((n) => [n.id, n]));
  const links: Link[] = [];
  for (const e of kept) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const ca = colOf.get(e.from);
    const cb = colOf.get(e.to);
    if (a === undefined || b === undefined || ca === undefined || cb === undefined) continue;
    const d = linkPath(nodeBox(ca, rowOf.get(e.from) ?? 0), nodeBox(cb, rowOf.get(e.to) ?? 0));
    links.push({ key: `${e.from}>${e.to}`, from: e.from, to: e.to, d, held: a.paused === true || b.paused === true, dead: isDeadNode(a) || isDeadNode(b) });
  }

  const rows = Math.max(1, ...columns.map((c) => c.placed.length));
  const width = GRAPH_STAGES.length * GEOMETRY.col + (GRAPH_STAGES.length - 1) * GEOMETRY.gap;
  const height = GEOMETRY.head + rows * GEOMETRY.node + (rows - 1) * GEOMETRY.row;
  return { columns, links, width, height, shown: shown.length };
}

/** What a node is called by assistive technology: its words, its kind, its stage, its verdict, its pause. */
export function spokenNode(n: GraphNode): string {
  return `${n.label}, ${n.kind}, ${n.stage}, ${GRAPH_LOOK[n.state].label}${n.paused === true ? ", paused" : ""}`;
}

/** What the graph's group is called: its name and the whole graph's count, drawn or not. */
export function spokenGraph(name: string, nodes: readonly GraphNode[], view: GraphView): string {
  const dead = nodes.filter(isDeadNode).length;
  return `${name}: ${nodes.length} nodes, ${dead} dead${view === "live" && dead > 0 ? " hidden" : ""}`;
}
