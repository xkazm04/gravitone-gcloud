import { describe, expect, it } from "vitest";

import { redoOf, staleAfter, type Production } from "@gt/domain/productionGraph";
import type { ScoutGraph } from "@gt/domain/scoutGraph";

import type { CanvasView } from "../../app/(studio)/scout/canvas/_port/contract.ts";
import imported from "../../app/(studio)/scout/canvas/_port/fixtureProduction.json" with { type: "json" };
import { buildScene } from "../../app/(studio)/scout/canvas/_canvas/scene/index.ts";
import { basinFacts, becameStale, clock, countLine, counts, driftName, hours, lanesOf, nextVariant, playsAt, receipt, redoMinutes, rulerOf, scenesOf, sectionAt, stationsOf, unfed } from "../../app/(studio)/scout/canvas/_canvas/production/model.ts";

// The production street (spark character-cores S1) on the fixture WP1 imported from the Unlatched clip's first 1:46:
// what a recast makes stale, and the three readings the street's variants draw (stations, lanes on the clock, scenes).

const P = (imported as unknown as { production: Production }).production;
const ids = (st: string): string[] => P.nodes.filter((n) => n.station === st).map((n) => n.id);
/** The keyframes drawn without the lead: a recast leaves them as they are. */
const NO_LEAD = ["kf:E01a", "kf:E01m", "kf:P202"];

describe("a recast's stale set on the Unlatched fixture", () => {
  const stale = staleAfter(P.nodes, "cast");

  it("stales every keyframe the lead is in, all six takes and the cut", () => {
    const kfs = ids("keyframe").filter((id) => !NO_LEAD.includes(id));
    expect(kfs).toHaveLength(34);
    expect(stale.filter((id) => id.startsWith("kf:")).sort()).toEqual(kfs.sort());
    expect(stale.filter((id) => id.startsWith("clip:"))).toEqual(["clip:K00", "clip:K01", "clip:K02", "clip:K03", "clip:K04", "clip:K05"]);
    expect(stale).toContain("cut");
  });

  it("never stales the track, the look, a plate, the cast itself or a keyframe drawn without her", () => {
    for (const id of ["track", "look", "cast", ...ids("look"), ...NO_LEAD]) expect(stale).not.toContain(id);
  });

  it("prices the redo in the work's units", () => {
    const r = redoOf(P.nodes, stale);
    expect(r).toEqual({ keyframes: { n: 34, minEach: 4 }, clips: { n: 6, minEach: 25 }, cuts: 1 });
    expect(receipt(r)).toBe("34 keyframes × ~4 min · 6 clips × ~25 min · 1 cut");
    expect(redoMinutes(r)).toBe(286);
    expect(hours(redoMinutes(r))).toBe("~4 h 46 min");
  });

  it("names exactly the nodes an accept made stale", () => {
    const set = new Set(stale);
    const after: Production = { ...P, nodes: P.nodes.map((n) => (set.has(n.id) ? { ...n, state: "stale" } : n)) };
    expect(becameStale(P, after)).toEqual(stale);
    expect(becameStale(after, after)).toEqual([]);
    expect(countLine(counts(after.nodes))).toBe(`${P.nodes.length - stale.length} made · ${stale.length} stale`);
  });
});

describe("the street's readings", () => {
  it("A: six stations in order, keyframes by their place on the clock", () => {
    const cols = stationsOf(P);
    expect(cols.map((c) => c.station)).toEqual(["track", "look", "cast", "keyframe", "clip", "cut"]);
    const kf = cols[3]?.nodes.map((n) => n.at ?? -1) ?? [];
    expect(kf).toHaveLength(37);
    expect([...kf].sort((a, b) => a - b)).toEqual(kf);
  });

  it("B: a keyframe sits where it plays, a take spans its seconds, a plate stands where it is first used", () => {
    const lanes = lanesOf(P);
    expect(lanes.map((l) => l.station)).toEqual(["look", "cast", "keyframe", "clip", "cut"]);
    const kf = lanes[2]?.items.find((i) => i.node.id === "kf:K00");
    expect(kf?.x0).toBeCloseTo(38.1 / P.track.seconds, 6);
    const k00 = lanes[3]?.items.find((i) => i.node.id === "clip:K00");
    expect((k00?.x1 ?? 0) - (k00?.x0 ?? 0)).toBeCloseTo(12.958 / P.track.seconds, 6);
    const plate = P.nodes.find((n) => n.id === "plate:P-K00");
    expect(plate === undefined ? null : playsAt(P, plate)).toBe(38.1);
    expect(lanes[1]?.items[0]).toMatchObject({ x0: 0, x1: 1 });
  });

  it("B: the ruler's sections, a tick per beat (every fourth a bar) and a mark every ten seconds", () => {
    const r = rulerOf(P.track);
    expect(r.sections[0]).toEqual({ name: "Verse 1", x0: 0, x1: 40 / 107 });
    expect(r.beats).toHaveLength(P.track.beats.length);
    expect(r.beats.filter((b) => b.bar)).toHaveLength(Math.ceil(P.track.beats.length / 4));
    expect(r.marks.map((m) => m.label).slice(0, 3)).toEqual(["0:00", "0:10", "0:20"]);
    expect(r.lyrics).toHaveLength(P.track.lyrics.length);
  });

  it("C: six takes in clock order, each with the keyframe it starts from and its section", () => {
    const sc = scenesOf(P);
    expect(sc.map((x) => x.clip.id)).toEqual(["clip:K00", "clip:K01", "clip:K02", "clip:K03", "clip:K04", "clip:K05"]);
    expect(sc.map((x) => x.first?.id)).toEqual(["kf:K00", "kf:K01", "kf:K02", "kf:K03", "kf:K04", "kf:K05"]);
    expect(sc[0]?.section).toBe(sectionAt(P.track, 38.1));
    expect(sc[0]?.keyframes.map((n) => n.id)).toEqual(["kf:K00", "kf:B10", "kf:C101", "kf:C102", "kf:C103"]);
  });

  it("C: the storyboard before the first take feeds no take", () => {
    const before = unfed(P);
    expect(before.length).toBeGreaterThan(0);
    for (const n of before) expect(n.at ?? 0).toBeLessThan(38.1);
    expect(before.map((n) => n.id)).not.toContain("kf:B10");
  });

  it("speaks the clock, the drift and the basin's facts in one voice", () => {
    expect(clock(106.375)).toBe("1:46");
    expect(clock(0)).toBe("0:00");
    expect(driftName({ identity: "holds", room: "drifts", wardrobe: "holds", reason: "door shut", by: "fable-5.2" })).toBe("identity holds · room drifts · wardrobe holds: door shut");
    expect(basinFacts(P)[0]).toBe(`${P.title} · cast ${P.cast.name}`);
    expect(nextVariant("a")).toBe("b");
    expect(nextVariant("c")).toBe("a");
  });
});

describe("the production basin on the map", () => {
  const graph: ScoutGraph = { builtAt: "t", nodes: [], edges: [], groups: [], nights: 0, batches: 0, open: {}, paused: [] };
  const view: CanvasView = { graph, channels: [], media: {}, notes: [], goal: { text: "", targets: [] }, audio: {}, slots: [], today: "2026-11-20", caps: { verdicts: true, notes: true, steer: true, audio: true, dispatch: false }, refusals: {} };

  it("is drawn only while a side holds a production: one river of six stations south of the reels", () => {
    expect(buildScene(view).basins.map((b) => b.key)).toEqual(["song", "video", "reel"]);
    const s = buildScene(view, [P]);
    expect(s.basins.map((b) => b.key)).toEqual(["song", "video", "reel", "production"]);
    const r = s.riverBy.get(`prod:${P.id}`);
    expect(r?.prod).toBe(P);
    expect(r?.stationPts.map((p) => p.s.id)).toEqual(["track", "look", "cast", "keyframes", "clips", "cut"]);
    expect(r?.y0 ?? 0).toBeGreaterThan(s.basins[2]?.y1 ?? Infinity);
    expect(s.total.n).toBe(0);
  });
});
