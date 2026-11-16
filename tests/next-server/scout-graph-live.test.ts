import { describe, expect, it } from "vitest";

import type { GraphGroup, GraphNode, GraphState, ScoutGraph } from "@gt/domain/scoutGraph";

import { bandsOf, goneOf, liveBands, openAtFirst, shownIn } from "../../app/(studio)/scout/_scout/bands.ts";

// The live view of /scout: what counts as a dead branch, and which bands are left to draw.

const node = (id: string, state: GraphState, extra: Partial<GraphNode> = {}): GraphNode => ({ id, stage: "idea", kind: "idea", label: id, state, at: "2026-10-26", packet: "pkt:scout:2026-10-26", audience: "kids", genre: "comedy", ...extra });
const effort = { runs: 0, gpuMin: 0, geminiUsd: 0, uncappedUsd: 0 };
const group = (key: string, extra: Partial<GraphGroup> = {}): GraphGroup => ({ key, nodes: 1, live: 1, dead: 0, effort, ...extra });
const graph = (nodes: readonly GraphNode[], edges: readonly (readonly [string, string])[], groups: readonly GraphGroup[] = []): ScoutGraph => ({ builtAt: "t", nodes, edges: edges.map(([from, to]) => ({ from, to })), groups, nights: 1, batches: 1, open: {}, paused: [] });

describe("goneOf", () => {
  it("takes the rejected, the failed and the muse archive", () => {
    const g = graph([node("r", "rejected"), node("f", "failed"), node("a", "kept", { archive: true }), node("k", "kept")], []);
    expect([...goneOf(g)].sort()).toEqual(["a", "f", "r"]);
  });

  it("takes a kept node once everything grown from it is gone, up the chain", () => {
    const g = graph([node("seed", "kept"), node("idea", "kept"), node("run", "rejected")], [["seed", "idea"], ["idea", "run"]]);
    expect([...goneOf(g)].sort()).toEqual(["idea", "run", "seed"]);
  });

  it("keeps a branch with one line still going", () => {
    const g = graph([node("seed", "kept"), node("bad", "rejected"), node("good", "kept")], [["seed", "bad"], ["seed", "good"]]);
    expect([...goneOf(g)]).toEqual(["bad"]);
  });

  it("never takes a node awaiting its verdict, or a kept leaf", () => {
    const g = graph([node("open", "open"), node("pending", "pending"), node("bad", "rejected"), node("leaf", "kept")], [["open", "bad"], ["pending", "bad"]]);
    expect([...goneOf(g)]).toEqual(["bad"]);
  });

  it("does not read a cycle as dead", () => {
    const g = graph([node("a", "kept"), node("b", "kept")], [["a", "b"], ["b", "a"]]);
    expect(goneOf(g).size).toBe(0);
  });
});

describe("the bands the live view lists", () => {
  const nodes = [node("k1", "kept", { genre: "comedy" }), node("r1", "rejected", { genre: "horror" }), node("old", "failed", { audience: undefined, genre: undefined })];
  const groups = [group("kids", { audience: "kids" }), group("kids/comedy", { audience: "kids", genre: "comedy" }), group("kids/horror", { audience: "kids", genre: "horror", live: 0, dead: 1 }), group("before seeds", { live: 0, dead: 1 })];
  const g = graph(nodes, [], groups);
  const gone = goneOf(g);

  it("drops a genre with nothing left, and a top band with nothing at all", () => {
    expect(liveBands(bandsOf(g), gone).map((b) => [b.group.key, b.genres.map((x) => x.group.key)])).toEqual([["kids", ["kids/comedy"]]]);
  });

  it("counts an audience by what its genres draw", () => {
    expect(bandsOf(g).map((b) => shownIn(b, gone))).toEqual([1, 0]);
  });

  it("opens the audiences and folds every genre", () => {
    expect(openAtFirst(bandsOf(g))).toEqual({ kids: true, "kids/comedy": false, "kids/horror": false, "before seeds": false });
  });
});
