// THE /scout VENTURE FILTER (spark scout-vision S2): `byVenture` narrows the graph the bands draw to one venture's
// nodes, the links between them and the groups that still hold a node, recounted; `all` is the graph untouched.
// The fixture view carries one venture so the filter draws in fixture mode, and its nodes carry that venture.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { GraphGroup, GraphNode, ScoutGraph } from "@gt/domain/scoutGraph";

import { fixtureScout } from "../../app/(studio)/scout/_port/fixture.ts";
import { ALL_VENTURES, bandsOf, byVenture } from "../../app/(studio)/scout/_scout/bands.ts";

const node = (id: string, genre: string, over: Partial<GraphNode> = {}): GraphNode => ({ id, stage: "idea", kind: "idea", label: id, state: "open", at: "2026-10-24", packet: "pkt:scout:2026-10-24", audience: "adults", genre, ...over });
const group = (key: string, over: Partial<GraphGroup> = {}): GraphGroup => ({ key, nodes: 0, live: 0, dead: 0, effort: { runs: 0, gpuMin: 0, geminiUsd: 0, uncappedUsd: 0 }, ...over });

const G: ScoutGraph = {
  builtAt: "2026-10-25T00:00:00.000Z",
  nodes: [node("a", "comedy", { venture: "vn-quiet-desk" }), node("b", "comedy", { venture: "vn-quiet-desk", state: "rejected" }), node("c", "comedy"), node("d", "noir")],
  edges: [
    { from: "a", to: "b" },
    { from: "a", to: "c" },
  ],
  groups: [group("adults", { audience: "adults", nodes: 4, live: 3, dead: 1 }), group("adults/comedy", { audience: "adults", genre: "comedy", nodes: 3, live: 2, dead: 1 }), group("adults/noir", { audience: "adults", genre: "noir", nodes: 1, live: 1 })],
  nights: 1,
  batches: 0,
  open: {},
  paused: [],
};

describe("byVenture", () => {
  it("`all` is the graph itself", () => {
    expect(byVenture(G, ALL_VENTURES)).toBe(G);
  });

  it("keeps the venture's nodes, the links inside them and the groups that still hold one, recounted", () => {
    const v = byVenture(G, "vn-quiet-desk");
    expect(v.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(v.edges).toEqual([{ from: "a", to: "b" }]);
    expect(v.groups.map((x) => [x.key, x.nodes, x.live, x.dead])).toEqual([
      ["adults", 2, 1, 1],
      ["adults/comedy", 2, 1, 1],
    ]);
    expect(bandsOf(v).map((b) => [b.group.key, b.genres.map((x) => x.nodes.length)])).toEqual([["adults", [2]]]);
  });

  it("a venture no node carries draws no band", () => {
    expect(bandsOf(byVenture(G, "vn-nobody"))).toEqual([]);
  });
});

describe("the fixture view", () => {
  it("carries one venture, and one graph whose scout nodes - none of its archive nodes - produce for it", async () => {
    const r = await fixtureScout.view();
    if (!r.ok) throw r.error;
    expect(r.value.ventures).toEqual([{ id: "vn-quiet-desk", name: "Quiet Desk" }]);
    expect(r.value.graph.nodes.filter((n) => n.venture === "vn-quiet-desk").length).toBeGreaterThan(0);
    expect(r.value.graph.nodes.filter((n) => n.archive === true).length).toBeGreaterThan(0);
    expect(r.value.graph.nodes.some((n) => n.archive === true && n.venture !== undefined)).toBe(false);
  });
});
