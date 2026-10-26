// The scout's stage graph (spark scout-decision-graph WP-S2): the columns, the order that follows the branches,
// the shared geometry links are drawn from, what `live` hides and counts, and the markup through react-dom/server.
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { GRAPH_STAGES, type GraphEdge, type GraphNode } from "@gt/domain/scoutGraph";

import { ShareMeter, spokenShare } from "../../src/components/graph/ShareMeter.tsx";
import { StageGraph } from "../../src/components/graph/StageGraph.tsx";
import { GEOMETRY, layout, linkPath, nodeBox, spokenGraph, spokenNode } from "../../src/components/graph/stageGraph.ts";

const node = (id: string, stage: GraphNode["stage"], state: GraphNode["state"], more: Partial<GraphNode> = {}): GraphNode => ({ id, stage, kind: stage === "seed" || stage === "derived" ? "seed" : stage === "idea" ? "idea" : stage === "run" ? "scene" : "clip", label: `the ${id}`, state, at: "2026-10-21", packet: "pkt:scout:2026-10-21", ...more });

const NODES: readonly GraphNode[] = [
  node("s1", "seed", "kept"),
  node("s2", "seed", "rejected"),
  node("s3", "seed", "kept", { paused: true }),
  node("i0", "idea", "open"),
  node("i3", "idea", "kept", { paused: true }),
  node("i1", "idea", "kept"),
  node("r1", "run", "failed"),
  node("r2", "run", "pending"),
  node("o1", "output", "kept"),
];
const EDGES: readonly GraphEdge[] = [
  { from: "s1", to: "i1" },
  { from: "s3", to: "i3" },
  { from: "i1", to: "r1" },
  { from: "i1", to: "r2" },
  { from: "r2", to: "o1" },
];

describe("layout", () => {
  test("five columns in stage order; a node sits in its stage's column", () => {
    const l = layout(NODES, EDGES, "all");
    expect(l.columns.map((c) => c.stage)).toEqual([...GRAPH_STAGES]);
    expect(l.columns[2]?.placed.map((q) => q.node.id).sort()).toEqual(["i0", "i1", "i3"]);
    expect(l.shown).toBe(NODES.length);
  });

  test("a column follows the branches: what a node grows from orders it, the unfed keep their order below", () => {
    const ideas = layout(NODES, EDGES, "all").columns[2]?.placed.map((q) => q.node.id);
    // s1 is row 0, s3 row 2: i1 (from s1) above i3 (from s3), i0 (fed by nothing) last.
    expect(ideas).toEqual(["i1", "i3", "i0"]);
  });

  test("live hides the dead and every link that touches one, and each column counts what it hid", () => {
    const l = layout(NODES, EDGES, "live");
    const ids = l.columns.flatMap((c) => c.placed.map((q) => q.node.id));
    expect(ids).not.toContain("s2");
    expect(ids).not.toContain("r1");
    expect(ids).toContain("i3"); // paused is not dead
    expect(l.columns.map((c) => c.hidden)).toEqual([1, 0, 0, 0, 1, 0]);
    expect(l.links.map((k) => k.key)).not.toContain("i1>r1");
    expect(layout(NODES, EDGES, "all").columns.every((c) => c.hidden === 0)).toBe(true);
  });

  test("a link is drawn from the node boxes: right edge out, left edge in; held when either end is paused", () => {
    const l = layout(NODES, EDGES, "all");
    const k = l.links.find((x) => x.key === "s1>i1");
    const a = nodeBox(0, 0);
    const b = nodeBox(2, 0);
    expect(k?.d).toBe(linkPath(a, b));
    expect(k?.d.startsWith(`M${a.x + GEOMETRY.col},${a.y + GEOMETRY.node / 2} `)).toBe(true);
    expect(k?.d.endsWith(` ${b.x},${b.y + GEOMETRY.node / 2}`)).toBe(true);
    expect(l.links.find((x) => x.key === "s3>i3")?.held).toBe(true);
    expect(l.links.find((x) => x.key === "i1>r1")?.dead).toBe(true);
  });
});

describe("StageGraph", () => {
  const html = (view: "live" | "all", selected: string | null = null): string => renderToStaticMarkup(h(StageGraph, { name: "kids/comedy", nodes: NODES, edges: EDGES, view, selected, onSelect: () => undefined }));

  test("renders the five column heads and a button per drawn node, named by its words, kind, stage and verdict", () => {
    const out = html("all");
    for (const s of GRAPH_STAGES) expect(out).toContain(`>${s}`);
    expect((out.match(/<button/g) ?? []).length).toBe(NODES.length);
    expect(out).toContain(`aria-label="${spokenNode(node("s3", "seed", "kept", { paused: true }))}"`);
    expect(out).toContain('aria-label="the s3, seed, seed, kept, paused"');
  });

  test("under live a dead node is not in the markup, and its column says how many it hides", () => {
    const out = html("live");
    expect(out).not.toContain('data-node="s2"');
    expect(out).not.toContain('data-node="r1"');
    expect(out).toContain('data-node="i3"');
    expect(out).toContain("1 dead hidden");
    expect(out).toContain(`aria-label="${spokenGraph("kids/comedy", NODES, "live")}"`);
    expect(spokenGraph("kids/comedy", NODES, "live")).toBe("kids/comedy: 9 nodes, 2 dead hidden");
  });

  test("the selected node is pressed", () => {
    expect(html("all", "i1")).toMatch(/aria-pressed="true"[^>]*data-node="i1"|data-node="i1"[^>]*aria-pressed="true"/);
  });
});

describe("ShareMeter", () => {
  test("one image, named with what the group took and what the split sets", () => {
    expect(spokenShare({ label: "kids", actual: 29, target: 50 })).toBe("kids: took 29% of runs, split 50%");
    expect(spokenShare({ label: "before seeds", actual: 71 })).toBe("before seeds: took 71% of runs, no split set");
    const out = renderToStaticMarkup(h(ShareMeter, { label: "adult", actual: 41, target: 20 }));
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="adult: took 41% of runs, split 20%"');
  });
});
