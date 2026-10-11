// THE TREE — the hunt's flat node list normalised into columns, rows and leaves.
// Split from model.ts so the layout, the selection and the counts can import
// the tree on its own. The normalisation rules are in model.ts's header.

import type { HuntNode } from "@/lib/sound/types";

/* ── the tree ──────────────────────────────────────────────────────────── */

export type MapRow =
  | {
      kind: "group";
      id: string;
      label: string;
      axis: string;
      depth: number;
      node: HuntNode;
    }
  | { kind: "leaf"; id: string; depth: number; node: HuntNode };

export interface MapColumn {
  id: string;
  axis: string;
  label: string;
  rationale: string | null;
  /** null when the column was gathered from loose leaves sharing an axis. */
  node: HuntNode | null;
  rows: MapRow[];
}

export interface HuntTree {
  /** The parentless node that stands for the idea, when the drafter emitted one. */
  rootNode: HuntNode | null;
  columns: MapColumn[];
  /** Every leaf, in board order (column by column, top to bottom). */
  leaves: HuntNode[];
}

export function buildTree(nodes: readonly HuntNode[]): HuntTree {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const kids = new Map<string, HuntNode[]>();
  const tops: HuntNode[] = [];
  for (const n of nodes) {
    // A parent the list does not contain is no parent: the node is drawn at the
    // top rather than dropped, because a dropped leaf is a variant nobody hears.
    const p =
      n.parentId && n.parentId !== n.id && byId.has(n.parentId)
        ? n.parentId
        : null;
    if (p === null) tops.push(n);
    else kids.set(p, [...(kids.get(p) ?? []), n]);
  }
  const hasKids = (n: HuntNode) => (kids.get(n.id)?.length ?? 0) > 0;

  let rootNode: HuntNode | null = null;
  let level = tops;
  if (tops.length === 1 && hasKids(tops[0])) {
    rootNode = tops[0];
    level = kids.get(rootNode.id) ?? [];
  }

  const columns: MapColumn[] = [];
  const loose = new Map<string, HuntNode[]>();
  const seen = new Set<string>();
  const rowsOf = (n: HuntNode, depth: number): MapRow[] => {
    // A cycle in parentId would recurse forever; the second visit is cut.
    if (seen.has(n.id)) return [];
    seen.add(n.id);
    if (!hasKids(n)) return [{ kind: "leaf", id: n.id, depth, node: n }];
    return [
      { kind: "group", id: n.id, label: n.label, axis: n.axis, depth, node: n },
      ...(kids.get(n.id) ?? []).flatMap((c) => rowsOf(c, depth + 1)),
    ];
  };

  for (const n of level) {
    if (hasKids(n)) {
      seen.add(n.id);
      columns.push({
        id: n.id,
        axis: n.axis,
        label: n.label,
        rationale: n.rationale || null,
        node: n,
        rows: (kids.get(n.id) ?? []).flatMap((c) => rowsOf(c, 0)),
      });
    } else {
      const axis = n.axis.trim() || "variant";
      loose.set(axis, [...(loose.get(axis) ?? []), n]);
    }
  }
  for (const [axis, ns] of loose) {
    columns.push({
      id: `axis:${axis}`,
      axis,
      label: axis,
      rationale: null,
      node: null,
      rows: ns.map((n) => ({
        kind: "leaf" as const,
        id: n.id,
        depth: 0,
        node: n,
      })),
    });
  }

  const leaves = columns.flatMap((c) =>
    c.rows.flatMap((r) => (r.kind === "leaf" ? [r.node] : [])),
  );
  return { rootNode, columns, leaves };
}

export const isLeaf = (tree: HuntTree, id: string) =>
  tree.leaves.some((l) => l.id === id);
