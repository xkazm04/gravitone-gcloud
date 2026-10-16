import { describe, expect, it } from "vitest";
import { capBatch, framesPlan, needsPlate, type FramesView } from "../src/frames/define.ts";
import { motionPlan, type MotionView } from "../src/motion/define.ts";
import { stillPlan } from "../src/still/define.ts";
import type { UnitPrice } from "../src/research/partAct.ts";

// The frames, motion and still act tables on literal views: which units an act plans, in which
// order, and the work's own sentence when it plans none (nothing is bought for a refused act).

const image: UnitPrice = { seconds: 30, usd: 0.039 };
const turn: UnitPrice = { seconds: 60, usd: null, unpricedReason: "seat", credit: "seat" };
const pic = (units: FramesView["units"]): FramesView => ({ face: "picture", units, shots: [] });
const names = (r: ReturnType<typeof framesPlan>): string[] => (r.ok ? r.value.units.map((u) => u.name) : [`refused: ${r.error.message}`]);

describe("frames acts", () => {
  const v = pic([
    { id: "u1", plate: "ready", stale: false },
    { id: "u2", plate: "empty", stale: false },
    { id: "u3", plate: "refused", stale: false },
    { id: "u4", plate: "ready", stale: true },
    { id: "u5", plate: "generating", stale: false },
  ]);

  it("render-plates buys exactly the missing, refused and stale plates - never a ready one, never one in flight", () => {
    expect(names(framesPlan(v, { act: "render-plates" }, { image, turn }))).toEqual(["plate:u2", "plate:u3", "plate:u4"]);
    expect(needsPlate({ id: "x", plate: "generating", stale: false })).toBe(false);
    expect(names(framesPlan(pic([{ id: "u1", plate: "ready", stale: false }]), { act: "render-plates" }, { image, turn }))).toEqual(["refused: every plate is composed"]);
  });

  it("a single plate and an alternative name their unit; an alternative needs a plate to vary", () => {
    expect(names(framesPlan(v, { act: "render-plate", target: "u1" }, { image, turn }))).toEqual(["plate:u1"]);
    expect(names(framesPlan(v, { act: "render-alternative", target: "u2" }, { image, turn }))).toEqual(["refused: u2 has no plate to offer an alternative to"]);
    expect(names(framesPlan(v, { act: "render-plate", target: "nope" }, { image, turn }))).toEqual(["refused: no unit nope"]);
  });

  it("direct-cut is one credit-priced turn over the whole cut; the plan job renders plates", () => {
    const d = framesPlan(v, { act: "direct-cut" }, { image, turn });
    expect(d.ok && d.value.units).toMatchObject([{ name: "direction", estimate: { usd: null }, credit: "seat" }]);
    expect(names(framesPlan(v, { act: null }, { image, turn }))).toEqual(["plate:u2", "plate:u3", "plate:u4"]);
  });

  it("ads takes: three per shot, for the targeted shot or every shot with none", () => {
    const ads: FramesView = { face: "ads", units: [], shots: [{ id: "s1", takes: 0 }, { id: "s2", takes: 3 }] };
    expect(names(framesPlan(ads, { act: "image-takes" }, { image, turn }))).toEqual(["take:s1:1", "take:s1:2", "take:s1:3"]);
    expect(names(framesPlan(ads, { act: "image-takes", target: "s2" }, { image, turn }))).toEqual(["take:s2:1", "take:s2:2", "take:s2:3"]);
    expect(names(framesPlan(ads, { act: "render-plates" }, { image, turn }))).toEqual(["refused: an ads frames part renders takes per shot"]);
  });

  it("the budget caps a batch to what the window affords, and a blocked window is a sentence naming when it frees", () => {
    const plan = framesPlan(v, { act: "render-plates" }, { image, turn });
    if (!plan.ok) throw plan.error;
    const partial = capBatch(plan.value, { verdict: "partial", affordable: 2, resumeAt: 0 });
    expect(partial.ok && partial.value.units.map((u) => u.name)).toEqual(["plate:u2", "plate:u3"]);
    const blocked = capBatch(plan.value, { verdict: "blocked", affordable: 0, resumeAt: Date.parse("2026-10-17T00:00:00Z") });
    expect(blocked.ok ? "" : blocked.error.message).toBe("budget ceiling reached · resumes 2026-10-17T00:00:00.000Z");
    const unknown = capBatch(plan.value, { verdict: "unknown", affordable: null, resumeAt: null });
    expect(unknown.ok && unknown.value.units.length).toBe(3);
  });
});

describe("motion acts", () => {
  const v: MotionView = {
    face: "picture",
    units: [
      { id: "u1", plated: true, motion: false, directed: false, clipDone: false },
      { id: "u2", plated: true, motion: true, directed: true, clipDone: false },
      { id: "u3", plated: false, motion: false, directed: false, clipDone: false },
      { id: "u4", plated: true, motion: false, directed: true, clipDone: false },
    ],
    shots: [],
  };
  const p = { read: turn, clip: { seconds: 120, usd: 0 } };
  const m = (r: ReturnType<typeof motionPlan>): string[] => (r.ok ? r.value.units.map((u) => u.name) : [`refused: ${r.error.message}`]);

  it("direct-motion directs every plated, undirected plate; a target without a plate is refused", () => {
    expect(m(motionPlan(v, { act: "direct-motion" }, p))).toEqual(["direct:u1"]);
    expect(m(motionPlan(v, { act: "direct-motion", target: "u3" }, p))).toEqual(["refused: u3 has no plate to direct"]);
  });

  it("render-clip animates only a plate with accepted motion", () => {
    expect(m(motionPlan(v, { act: "render-clip" }, p))).toEqual(["clip:u2"]);
    expect(m(motionPlan(v, { act: "render-clip", target: "u1" }, p))).toEqual(["refused: u1 has no accepted motion"]);
  });

  it("ads clips animate an adopted take", () => {
    const ads: MotionView = { face: "ads", units: [], shots: [{ id: "s1", adopted: true, clipDone: false }, { id: "s2", adopted: false, clipDone: false }] };
    expect(m(motionPlan(ads, { act: "render-clip" }, p))).toEqual(["clip:s1"]);
    expect(m(motionPlan(ads, { act: "render-clip", target: "s2" }, p))).toEqual(["refused: s2 has no adopted take to animate"]);
  });
});

describe("still takes", () => {
  it("four takes by default, each its own unit; an empty prompt buys nothing", () => {
    const r = stillPlan({ prompt: "Night Market" }, { act: null }, image);
    expect(r.ok && r.value.units.map((u) => u.name)).toEqual(["take:1", "take:2", "take:3", "take:4"]);
    const e = stillPlan({ prompt: " " }, { act: null }, image);
    expect(e.ok ? "" : e.error.message).toBe("still takes need a prompt");
  });

  it("the batch is bounded: twelve takes plan, thirteen (or none, or a fraction) buy nothing", () => {
    const n = (takes: number) => {
      const r = stillPlan({ prompt: "Night Market", takes }, { act: null }, image);
      return r.ok ? r.value.units.length : r.error.message;
    };
    expect(n(12)).toBe(12);
    expect(n(13)).toBe("still takes are 1 to 12, not 13");
    expect(n(0)).toBe("still takes are 1 to 12, not 0");
    expect(n(2.5)).toBe("still takes are 1 to 12, not 2.5");
  });
});
