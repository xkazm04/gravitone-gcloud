import { describe, expect, it } from "vitest";

import type { Episode } from "@gt/domain/channel";
import type { GraphGroup, GraphNode, GraphState, ScoutGraph } from "@gt/domain/scoutGraph";

import type { CanvasChannel, CanvasView } from "../../app/(studio)/scout/canvas/_port/contract.ts";
import { buildScene, rescene } from "../../app/(studio)/scout/canvas/_canvas/scene/index.ts";
import { anchorOf, anchorPoint, blockPoints, blocksUnder, briefLine, itemsUnder } from "../../app/(studio)/scout/canvas/_canvas/scene/scopes.ts";

// The scout canvas's territory (docs/scout-canvas-port.md): which river a node flows in, what waits on the operator,
// and how a verdict moves a river. Characterised against the contest winner on real data when ported (the same 367
// blocking points); these are the rules that count held as small cases.

const effort = { runs: 0, gpuMin: 0, geminiUsd: 0, uncappedUsd: 0 };
const node = (id: string, state: GraphState, extra: Partial<GraphNode> = {}): GraphNode => ({ id, stage: "idea", kind: "idea", label: id, state, at: "2026-11-16", packet: "pkt:scout:2026-11-16", audience: "kids", genre: "comedy", ...extra });
const group = (key: string): GraphGroup => ({ key, nodes: 1, live: 1, dead: 0, effort });
const graph = (nodes: readonly GraphNode[], edges: readonly (readonly [string, string])[] = []): ScoutGraph => ({
  builtAt: "t", nodes, edges: edges.map(([from, to]) => ({ from, to })), groups: [group("kids"), group("kids/comedy")], nights: 1, batches: 1, open: {}, paused: [],
});
const episode = (id: string, candidate?: string, state: Episode["state"] = "made"): Episode => ({ id, channel: "D1", title: `T ${id}`, logline: `L ${id}`, beats: ["Hook: a", "b", "c", "d", "End: e"], spec: "s", state, at: "2026-11-16T00:00:00Z", ...(candidate === undefined ? {} : { candidate }) });
const reelChannel = (eps: readonly Episode[]): CanvasChannel => ({ channel: { id: "D1", group: "Data", name: "Came From Nowhere", audience: "a", promise: "p", gap: "g", edge: "e", medium: "reel" }, episodes: eps });
const view = (g: ScoutGraph, channels: readonly CanvasChannel[] = []): CanvasView => ({
  graph: g, channels, media: {}, notes: [], goal: { text: "", targets: [] }, audio: {}, slots: [], today: "2026-11-19",
  caps: { verdicts: true, notes: true, steer: true, audio: true, dispatch: false }, refusals: {},
});

describe("the territory", () => {
  it("puts a node with an audience in its genre's river, and a seed's verdict in the seeds weir", () => {
    const s = buildScene(view(graph([node("i1", "open"), node("s1", "open", { kind: "seed", stage: "seed" }), node("k1", "kept")])));
    const r = s.riverBy.get("video:kids/comedy");
    expect(r?.items.map((it) => it.id).sort()).toEqual(["i1", "k1", "s1"]);
    expect(s.total).toMatchObject({ verdict: 1, seeds: 1, audio: 0, slot: 0, n: 2 });
  });

  it("merges a genre with no live work into the audience's dry bed", () => {
    const s = buildScene(view(graph([node("a", "kept"), node("x", "rejected", { genre: "horror" }), node("y", "failed", { genre: "food" })])));
    expect(s.riverBy.has("video:kids/horror")).toBe(false);
    const dry = s.riverBy.get("video:kids/dry");
    expect(dry?.name).toBe("dry beds · horror, food");
    expect(dry?.items.map((it) => it.id).sort()).toEqual(["x", "y"]);
  });

  it("flows a channel's candidate (and what grew from it) in the channel's river, and moors its episodes as ships", () => {
    const g = graph([node("cand:2026-11-16/c-01", "kept", { audience: undefined, genre: undefined, kind: "reel", stage: "run" }), node("out:2026-11-16/c-01", "kept", { audience: undefined, genre: undefined, kind: "reel-cut", stage: "output" })], [["cand:2026-11-16/c-01", "out:2026-11-16/c-01"]]);
    const s = buildScene(view(g, [reelChannel([episode("D1-01", "2026-11-16/c-01"), episode("D1-02")])]));
    const r = s.riverBy.get("chan:D1");
    expect(r?.basin).toBe("reel");
    expect(r?.items.map((it) => it.id).sort()).toEqual(["cand:2026-11-16/c-01", "ep:D1-02", "out:2026-11-16/c-01"]);
    expect(s.chanById.get("D1")?.port?.ships.map((x) => x.label)).toEqual(["T D1-01", "T D1-02"]);
  });

  it("makes a kept silent reel an audio weir until its cut is laid, then a slot weir, then nothing", () => {
    const g = graph([node("out:2026-11-16/c-02", "kept", { kind: "reel-cut", stage: "output", genre: "data explainer" })]);
    const s = buildScene(view(g));
    const it = s.itemBy.get("out:2026-11-16/c-02");
    expect(it?.block).toBe("audio");
    if (it?.audio == null) throw new Error("no reel road");
    it.audio.step = 4;
    rescene(s, [it.river]);
    expect(it.block).toBe("slot");
    it.audio.step = 5;
    rescene(s, [it.river]);
    expect(it.block).toBe(null);
  });

  it("lets a strip whose full cut is kept wait on nothing", () => {
    const g = graph([node("cand:n/c-03", "kept", { kind: "reel", stage: "run", genre: "data explainer" }), node("out:n/c-03", "kept", { kind: "reel-cut", stage: "output", genre: "data explainer" })], [["cand:n/c-03", "out:n/c-03"]]);
    const s = buildScene(view(g));
    expect(s.itemBy.get("cand:n/c-03")?.block).toBe(null);
    expect(s.itemBy.get("out:n/c-03")?.block).toBe("audio");
  });

  it("moves a river's reach when a verdict kills its furthest live lot", () => {
    const s = buildScene(view(graph([node("seed", "kept", { kind: "seed", stage: "seed" }), node("run", "open", { kind: "scene", stage: "run" })])));
    const r = s.riverBy.get("video:kids/comedy");
    expect(r?.reach).toBe(4);
    const run = s.itemBy.get("run");
    if (run === undefined || r === undefined) throw new Error("missing");
    run.state = "rejected";
    rescene(s, [r]);
    expect(r.reach).toBe(0);
    expect(r.dryPts).not.toBe(null);
  });
});

describe("scopes and anchors", () => {
  it("walks the blocking points kind first, the furthest stage first", () => {
    const s = buildScene(view(graph([node("a", "open", { stage: "seed", kind: "seed" }), node("b", "open", { stage: "run", kind: "scene" }), node("c", "open")])));
    expect(blockPoints(s).map((p) => `${p.kind}@${p.scope.ref.si}`)).toEqual(["verdict@4", "verdict@2", "seeds@0"]);
  });

  it("finds a note's anchor again on the map, and drops it when the place is gone", () => {
    const s = buildScene(view(graph([node("a", "open")])));
    const r = s.riverBy.get("video:kids/comedy");
    if (r === undefined) throw new Error("no river");
    const a = anchorOf({ type: "river", ref: r });
    expect(a).toEqual({ kind: "genre", key: "video:kids/comedy", name: "kids / comedy" });
    expect(anchorPoint(s, { kind: "genre", key: "video:kids/comedy" })).not.toBe(null);
    expect(anchorPoint(s, { kind: "genre", key: "video:kids/horror" })).toBe(null);
    expect(briefLine({ kind: "genre", name: "kids / comedy", stance: "turn", text: "try animals" })).toBe("note[genre kids / comedy · turn]: try animals");
  });

  it("names what waits under a place", () => {
    const s = buildScene(view(graph([node("a", "open"), node("b", "kept")])));
    const r = s.riverBy.get("video:kids/comedy");
    if (r === undefined) throw new Error("no river");
    expect(itemsUnder(s, { type: "river", ref: r })).toHaveLength(2);
    expect(blocksUnder(s, { type: "river", ref: r }).verdict.map((it) => it.id)).toEqual(["a"]);
  });
});
