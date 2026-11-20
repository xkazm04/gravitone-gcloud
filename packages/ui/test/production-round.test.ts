// A production's review round as a Board packet (spark character-cores WP3): one run per clip in clock order, the
// take-start keyframe then the clip, the timeline's verdicts as the cells' decisions, and the timeline's arithmetic.
import { describe, expect, test } from "vitest";

import { parseAt } from "@gt/domain/door";
import { candidateIdSchema, packetIdSchema } from "@gt/domain/ids";
import type { Production, ProductionNode } from "@gt/domain/productionGraph";

import { firstKeyframe, productionPacketId, productionRound, ROUND_GROUP } from "../src/board/productionRound.ts";
import { at01, beatTicks, blockAfter, blockAt, correction, lineAt, step, timecode, type TimelineBlock } from "../src/components/timeline/geometry.ts";

const file = (path: string) => `/api/foundry/file?run=demo&path=${encodeURIComponent(path)}&kind=production`;
const node = (n: Partial<ProductionNode> & Pick<ProductionNode, "id" | "station">): ProductionNode => ({ label: n.id, state: "made", madeFrom: [], inputsDigest: "d", ...n });

const NODES: ProductionNode[] = [
  node({ id: "track", station: "track" }),
  node({ id: "look", station: "look" }),
  node({ id: "cast", station: "cast" }),
  node({ id: "kf:B01", station: "keyframe", at: 2, media: { kind: "image", src: file("keyframes/B01.png") } }),
  node({ id: "kf:K01", station: "keyframe", at: 10, label: "K01 start", madeFrom: ["cast", "look"], media: { kind: "image", src: file("keyframes/K01-start.jpg") } }),
  node({ id: "kf:K00", station: "keyframe", at: 4, label: "K00 start", madeFrom: ["cast", "look"], media: { kind: "image", src: file("keyframes/K00-start.jpg") } }),
  // Listed out of clock order: the round sorts by `at`.
  node({ id: "clip:K01", station: "clip", at: 10, dur: 6, madeFrom: ["kf:K01", "clip:K00"], media: { kind: "video", src: file("takes/K01.mp4") }, verdict: { verdict: "reject", reasons: ["motion"], note: "hold the turn a beat longer" } }),
  node({ id: "clip:K00", station: "clip", at: 4, dur: 6, madeFrom: ["kf:B01", "kf:K00"], media: { kind: "video", src: file("takes/K00.webm") }, state: "stale" }),
  node({ id: "cut", station: "cut", madeFrom: ["clip:K00", "clip:K01"] }),
];
const PRODUCTION: Production = {
  id: "demo",
  title: "Demo",
  look: "look",
  cast: { id: "chr:lead", name: "Lead", identity: "i", portrait: "/p.jpg", origin: "test" },
  track: { title: "Demo", seconds: 20, bpm: 120, beats: [0, 0.5, 1, 1.5, 2], sections: [], lyrics: [] },
  nodes: NODES,
};
const AT = "2026-11-20T12:00:00.000Z";
const DOORS = { packet: (s: string) => parseAt("test packet", packetIdSchema, s), candidate: (s: string) => parseAt("test cell", candidateIdSchema, s) };

describe("productionRound", () => {
  const r = productionRound(PRODUCTION, 1, AT, DOORS);
  if (!r.ok) throw r.error;
  const { view, present } = r.value;

  test("the packet id is pkt:production:<id>:<round>, a video matrix cull of the scout source", () => {
    expect(view.id).toBe("pkt:production:demo:1");
    expect(productionPacketId("demo", "r2")).toBe("pkt:production:demo:r2");
    expect([view.lane, view.mode, view.source, view.state]).toEqual(["video", "matrix-cull", "scout", "open"]);
    expect(view.reasons.list).toContain("motion");
  });

  test("one run per clip in clock order, each its take-start keyframe then the clip", () => {
    expect(present.rows.map((x) => x.id)).toEqual(["K00", "K01"]);
    expect(present.rows.every((x) => x.group === ROUND_GROUP)).toBe(true);
    expect(view.items.map((i) => `${i.row}:${i.id}`)).toEqual(["K00:K00/start", "K00:K00/take", "K01:K01/start", "K01:K01/take"]);
    expect(view.items.map((i) => i.media.mime)).toEqual(["image/png", "video/webm", "image/jpeg", "video/mp4"]);
    expect(present.rows[0]?.poster).toBe(file("keyframes/B01.png"));
  });

  test("the first keyframe is the first input that is a keyframe, not the earliest on the clock", () => {
    const k00 = NODES.find((n) => n.id === "clip:K00") as ProductionNode;
    // kf:B01 is listed first in K00's inputs, so it is the take's start frame here.
    expect(firstKeyframe(PRODUCTION, k00)?.id).toBe("kf:B01");
  });

  test("a verdict on a node is its cell's decision, the note verbatim; the rest are undecided", () => {
    expect(view.decisions).toEqual([{ key: "pkt:production:demo:1::K01/take", verdict: "reject", reasons: ["motion"], note: "hold the turn a beat longer", rev: 0, by: "operator", surface: "timeline", at: AT }]);
    expect(view.undecided).toBe(3);
    expect(present.items["K00/take"]?.meta).toContain("stale");
  });

  test("a production with no clip is refused", () => {
    const none = productionRound({ ...PRODUCTION, nodes: NODES.filter((n) => n.station !== "clip") }, 1, AT, DOORS);
    expect(none.ok).toBe(false);
  });
});

describe("the timeline's arithmetic", () => {
  const B = (id: string, at: number, dur: number): TimelineBlock => ({ id, label: id, at, dur, state: "made", video: `/${id}.mp4` });
  const blocks = [B("b", 10, 6), B("a", 4, 6), B("c", 15, 4)];

  test("the block under the playhead, a gap, and the incoming take where two overlap", () => {
    expect(blockAt(blocks, 5)?.id).toBe("a");
    expect(blockAt(blocks, 3)).toBeNull();
    expect(blockAt(blocks, 15.5)?.id).toBe("c");
    expect(blockAt(blocks, 19)).toBeNull();
    expect(blockAfter(blocks, 5)?.id).toBe("b");
  });

  test("arrow keys walk the blocks in clock order and stop at the ends", () => {
    expect(step(blocks, null, 1)?.id).toBe("a");
    expect(step(blocks, null, -1)?.id).toBe("c");
    expect(step(blocks, "a", 1)?.id).toBe("b");
    expect(step(blocks, "a", -1)?.id).toBe("a");
    expect(step([], null, 1)).toBeNull();
  });

  test("bars every four beats, positions held to the track, the clock and the line sung", () => {
    expect(beatTicks([0, 1, 2, 3, 4]).map((b) => b.bar)).toEqual([true, false, false, false, true]);
    expect([at01(-1, 10), at01(5, 10), at01(12, 10), at01(1, 0)]).toEqual([0, 0.5, 1, 0]);
    expect(timecode(83.25)).toBe("1:23.3");
    expect(lineAt([{ t: 2, text: "one" }, { t: 6, text: "two" }], 5)).toBe("one");
    expect(lineAt([{ t: 2, text: "one" }], 1)).toBeNull();
  });

  test("a small drift is closed by rate, a large one by a seek", () => {
    expect(correction(0.02)).toEqual({ seek: false, rate: 1.04 });
    expect(correction(-0.2).rate).toBeCloseTo(0.9);
    expect(correction(0.5).seek).toBe(true);
  });
});
