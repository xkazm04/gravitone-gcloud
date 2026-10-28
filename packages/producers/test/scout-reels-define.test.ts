import { describe, expect, it } from "vitest";

import { parseReelsRequest, reelBriefSchema, reelsPlan } from "../src/scout-reels/define.ts";

// The reels request and brief doors (spark scout-vision S5 WP-E), pure: a request entry with no kind is a stats idea (a
// request written before S5 reads as it did), a reel-cut names its frames and is planned on its own `cut` estimate, and
// a brief is illustrative or real - exactly one. The bound job is tests/next-server/scout-reel-real.test.ts.

const base = { nightId: "2026-12-01", reels: [{ candidateId: "c-01" }], estimates: { reel: { seconds: 1770, usd: 6.4 } }, by: "op" };
const brief = { case: "stat-x", title: "T", hook: "H", unit: "Mt", kind: "level-race", data: { a: 1 } };

describe("the reels request", () => {
  it("reads a pre-S5 request, and plans a cut on its own estimate", () => {
    expect(parseReelsRequest(base).ok).toBe(true);
    const r = parseReelsRequest({ ...base, reels: [{ candidateId: "c-01" }, { candidateId: "c-02", kind: "reel-cut", frames: 900 }], estimates: { reel: { seconds: 10, usd: 1 }, cut: { seconds: 460, usd: 1 } } });
    if (!r.ok) throw r.error;
    expect(reelsPlan(r.value, new Map()).map((s) => [s.name, s.estimate.seconds])).toEqual([
      ["reel:1", 10],
      ["reel:2", 460],
    ]);
  });

  it("refuses frames on anything but a cut, and frames outside 30 s - 2 min", () => {
    expect(parseReelsRequest({ ...base, reels: [{ candidateId: "c-01", kind: "reel", frames: 900 }] }).ok).toBe(false);
    expect(parseReelsRequest({ ...base, reels: [{ candidateId: "c-01", kind: "reel-cut", frames: 240 }] }).ok).toBe(false);
    expect(parseReelsRequest({ ...base, reels: [{ candidateId: "c-01", kind: "reel-cut", frames: 3601 }] }).ok).toBe(false);
  });
});

describe("the reel brief", () => {
  it("is illustrative or real, exactly one; only a real one names a cut and frames", () => {
    expect(reelBriefSchema.safeParse({ ...brief, illustrative: true }).success).toBe(true);
    expect(reelBriefSchema.safeParse({ ...brief, source: { kind: "table", name: "Source: x", url: "https://x.y" }, cut: ["a"], frames: 900, seconds: 30 }).success).toBe(true);
    expect(reelBriefSchema.safeParse(brief).success).toBe(false);
    expect(reelBriefSchema.safeParse({ ...brief, illustrative: true, source: { kind: "table", name: "Source: x" } }).success).toBe(false);
    expect(reelBriefSchema.safeParse({ ...brief, illustrative: true, cut: ["a"] }).success).toBe(false);
  });
});
