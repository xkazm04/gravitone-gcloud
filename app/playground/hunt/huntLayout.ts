// THE LAYOUT — the tree as fixed-unit boxes and SVG edge paths.
// Named huntLayout.ts, not layout.ts: in a Next.js App Router directory
// `layout` is a reserved route-file name, so a module by that name here would
// be type-checked as a route layout.

import type { HuntTree, MapRow } from "./tree";

/* ── the layout ────────────────────────────────────────────────────────── */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapLayout {
  width: number;
  height: number;
  root: Box;
  columns: {
    id: string;
    header: Box;
    rows: { id: string; kind: MapRow["kind"]; box: Box }[];
  }[];
  /** SVG path data, in layout coordinates. `to` names the node the edge enters. */
  edges: { id: string; to: string; d: string }[];
}

export const DIMS = {
  pad: 12,
  rootW: 208,
  rootH: 236,
  /** Between the root and the branch cards — where the fan curves live. */
  fanW: 40,
  headerW: 200,
  /** Between a branch card and its first leaf — where the comb's spine runs. */
  busW: 26,
  leafW: 256,
  leafH: 204,
  leafGap: 12,
  /** The comb above each line of leaves. */
  combH: 16,
  lineGap: 12,
  groupH: 30,
  branchGap: 26,
} as const;

export type Dims = { [K in keyof typeof DIMS]: number };

/** The width of everything left of the first leaf, plus the right margin. */
const fixedW = (d: Dims) =>
  d.pad + d.rootW + d.fanW + d.headerW + d.busW + d.pad;

/** How many leaves a line holds in a viewport `viewW` wide — at least one,
 *  at most six (past six a branch stops reading as one row of answers). */
export function leavesPerLine(viewW: number, d: Dims = DIMS): number {
  const n = Math.floor((viewW - fixedW(d) + d.leafGap) / (d.leafW + d.leafGap));
  return Math.max(1, Math.min(6, n));
}

/**
 * A left-to-right mind map in fixed layout units: the idea on the left, a
 * card per branch fanned to its right, and each branch's leaves combed into
 * lines of `perLine` beside it. Fixed card sizes keep the board deterministic
 * — the cards clamp their text to fit; the layout never measures the DOM.
 * `perLine` is the one input the viewport decides, so a wide screen gets
 * wider rows instead of smaller type.
 */
export function layoutTree(
  tree: HuntTree,
  perLine: number,
  d: Dims = DIMS,
): MapLayout {
  const per = Math.max(1, Math.floor(perLine));
  const linesW = per * d.leafW + (per - 1) * d.leafGap;
  const width = fixedW(d) + linesW;
  const hx = d.pad + d.rootW + d.fanW;
  const x0 = hx + d.headerW + d.busW;
  const busX = hx + d.headerW + d.busW / 2;

  const columns: MapLayout["columns"] = [];
  const edges: MapLayout["edges"] = [];
  let y = d.pad;

  for (const c of tree.columns) {
    // Lines: a group row breaks the line and takes a thin line of its own.
    type Line = { group: MapRow } | { leaves: MapRow[] };
    const lines: Line[] = [];
    for (const r of c.rows) {
      const last = lines[lines.length - 1];
      if (r.kind === "group") lines.push({ group: r });
      else if (last && "leaves" in last && last.leaves.length < per)
        last.leaves.push(r);
      else lines.push({ leaves: [r] });
    }

    const top = y;
    const header: Box = { x: hx, y: top + d.combH, w: d.headerW, h: d.leafH };
    const hookY = header.y + 30;
    const rows: MapLayout["columns"][number]["rows"] = [];
    let ly = top;
    for (const line of lines) {
      if ("group" in line) {
        rows.push({
          id: line.group.id,
          kind: "group",
          box: { x: x0, y: ly, w: linesW, h: d.groupH },
        });
        ly += d.groupH + 4;
        continue;
      }
      const busY = ly + d.combH / 2;
      const boxes = line.leaves.map((r, i) => ({
        id: r.id,
        kind: "leaf" as const,
        box: {
          x: x0 + i * (d.leafW + d.leafGap),
          y: ly + d.combH,
          w: d.leafW,
          h: d.leafH,
        },
      }));
      rows.push(...boxes);
      const lastCx = boxes[boxes.length - 1].box.x + d.leafW / 2;
      edges.push({
        id: `${c.id}>line@${ly}`,
        to: c.id,
        d: `M ${hx + d.headerW} ${hookY} H ${busX} V ${busY} H ${lastCx}`,
      });
      for (const b of boxes) {
        const cx = b.box.x + d.leafW / 2;
        edges.push({
          id: `${c.id}>${b.id}`,
          to: b.id,
          d: `M ${cx} ${busY} V ${b.box.y}`,
        });
      }
      ly += d.combH + d.leafH + d.lineGap;
    }
    const bottom = Math.max(header.y + header.h, ly - d.lineGap);
    columns.push({ id: c.id, header, rows });
    y = bottom + d.branchGap;
  }

  // The idea sits level with the first branch rather than at the middle of
  // the board: a tall map would otherwise open on an empty corner, with the
  // one card that names the problem a screen below the fold.
  const root: Box = {
    x: d.pad,
    y: columns[0]?.header.y ?? d.pad + d.combH,
    w: d.rootW,
    h: d.rootH,
  };
  const rootOut = { x: root.x + root.w, y: root.y + 30 };
  for (const c of columns) {
    const ty = c.header.y + 30;
    const cx = rootOut.x + d.fanW / 2;
    edges.unshift({
      id: `root>${c.id}`,
      to: c.id,
      d: `M ${rootOut.x} ${rootOut.y} C ${cx} ${rootOut.y}, ${cx} ${ty}, ${hx} ${ty}`,
    });
  }

  const height = Math.max(y - d.branchGap, root.y + root.h) + d.pad;
  return { width, height, root, columns, edges };
}

/** The scale that fits a layout's width into a viewport, never enlarging past
 *  1 — the board scrolls down, so only the width has to fit. */
export const fitScale = (layoutW: number, viewW: number) =>
  layoutW <= 0 || viewW <= 0 ? 1 : Math.min(1, viewW / layoutW);
