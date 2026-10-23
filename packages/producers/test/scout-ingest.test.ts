import { describe, expect, it } from "vitest";

import { ingestRunId, ingestStep, parseIngestRunId, planIngest } from "../src/scout-ingest/define.ts";
import { BLANK_STD, EDGE_MIN, dhash, hamming, keepOrThrow, measureGray, ptsTimes, spreadEvenly } from "../src/scout-ingest/gates.ts";

// The pure half of the scout ingest: the gates ported from pipeline/vlm-probe/ingest.py
// on synthetic thumbnails, and the plan over a night view (the bound run, over stub
// tools, is tests/next-server/scout-ingest-engine.test.ts).

const W = 160;
const H = 90;
const flat = (v: number) => new Uint8Array(W * H).fill(v);
const noise = (seed: number) => {
  const b = new Uint8Array(W * H);
  let x = seed;
  for (let i = 0; i < b.length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    b[i] = x & 0xff;
  }
  return b;
};

describe("the gates", () => {
  it("reads showinfo's pts_time in frame order", () => {
    expect(ptsTimes("[Parsed_showinfo_1] n:0 pts:1001 pts_time:1.001 duration:1\n[Parsed_showinfo_1] n:1 pts:2 pts_time:12.5 x")).toEqual([1.001, 12.5]);
  });

  it("measures a flat frame as blank and a noisy one as detailed", () => {
    const f = measureGray(flat(40));
    expect(f.std).toBe(0);
    expect(f.edge).toBe(0);
    const n = measureGray(noise(3));
    expect(n.std).toBeGreaterThan(BLANK_STD);
    expect(n.edge).toBeGreaterThan(EDGE_MIN);
  });

  it("a horizontal ramp has contrast but little edge energy: the dissolve gate's no-detail", () => {
    const ramp = Uint8Array.from({ length: W * H }, (_, i) => Math.floor(((i % W) * 255) / (W - 1)));
    const m = measureGray(ramp);
    expect(m.std).toBeGreaterThan(BLANK_STD);
    expect(m.edge).toBeLessThan(EDGE_MIN);
  });

  it("hashes one frame twice to distance 0 and two shots far apart", () => {
    expect(hamming(dhash(noise(5), W, H), dhash(noise(5), W, H))).toBe(0);
    expect(hamming(dhash(noise(5), W, H), dhash(noise(6), W, H))).toBeGreaterThan(6);
  });

  it("keeps or throws in the python's order: blank, then no detail, then a repeat", () => {
    const at = (frame: string, i: number, px: Uint8Array) => ({ frame, at: i, measure: measureGray(px) });
    const g = keepOrThrow([at("a", 0, noise(1)), at("b", 1, flat(0)), at("c", 2, noise(1)), at("d", 3, noise(2))]);
    expect(g.kept.map((k) => k.frame)).toEqual(["a", "d"]);
    expect(g.thrown.map((t) => `${t.frame}:${t.reason}`)).toEqual(["b:blank", "c:duplicate"]);
  });

  it("spreads a cap evenly across the runtime", () => {
    expect(spreadEvenly([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 4)).toEqual([0, 2, 5, 7]);
    expect(spreadEvenly([1, 2], 24)).toEqual([1, 2]);
  });
});

describe("the plan", () => {
  const night = {
    id: "2026-10-22",
    sources: [
      { id: "s-01", kind: "image", status: "pending" },
      { id: "s-02", kind: "video", status: "ingested" },
      { id: "s-03", kind: "video", status: "pending" },
    ],
  } as const;

  it("names a unit per pending source in scope that the job has not booked", () => {
    const whole = { nightId: "2026-10-22" };
    expect(planIngest(whole, night, new Set()).map((s) => s.name)).toEqual(["ingest:s-01", "ingest:s-03"]);
    expect(planIngest(whole, night, new Set([ingestStep("s-01")])).map((s) => s.name)).toEqual(["ingest:s-03"]);
    expect(planIngest({ nightId: "2026-10-22", sourceId: "s-03" }, night, new Set()).map((s) => `${s.name} $${s.estimate.usd}`)).toEqual(["ingest:s-03 $0"]);
  });

  it("round-trips its run id and refuses anything else", () => {
    expect(parseIngestRunId(ingestRunId({ nightId: "2026-10-22-2", sourceId: "s-04" }))).toEqual({ nightId: "2026-10-22-2", sourceId: "s-04" });
    expect(parseIngestRunId(ingestRunId({ nightId: "2026-10-22" }))).toEqual({ nightId: "2026-10-22" });
    expect(parseIngestRunId("extract-2026")).toBeNull();
    expect(parseIngestRunId("scout-ingest:a:b:c")).toBeNull();
  });
});
