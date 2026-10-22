import { describe, expect, it } from "vitest";

import type { Output } from "@gt/kernel/job-core";

import { CLIP_STEP, parseSceneRequest, readStep, replicaStep, scenePlan, type SceneRequest } from "@gt/producers/scout-scene/define";

// The pure half of the scout-scene producer: the plan is the request's steps minus what the job
// has booked, so a retry performs only what is missing and a clip is planned only when asked for.

const REQ: SceneRequest = {
  nightId: "2026-10-22",
  candidateId: "c-01",
  keyframes: ["sources/s-01/k-001.jpg", "sources/s-01/k-002.jpg", "sources/s-01/k-003.jpg"],
  replicas: 2,
  clip: true,
  estimates: { read: { seconds: 20, usd: 0.002 }, replica: { seconds: 24, usd: 0.045 }, clip: { seconds: 180, usd: 3.75 } },
  by: "op-1",
};

const booked = (...names: string[]): ReadonlyMap<string, Output> => new Map(names.map((n) => [n, { step: n, value: {}, at: "2026-10-22T20:00:00.000Z" }]));

describe("scenePlan", () => {
  it("reads every keyframe in order, then the replicas, then the clip, each at its act's estimate", () => {
    const plan = scenePlan(REQ, booked());
    expect(plan.map((s) => [s.name, s.estimate.usd])).toEqual([
      ["read:1", 0.002],
      ["read:2", 0.002],
      ["read:3", 0.002],
      ["replica:1", 0.045],
      ["replica:2", 0.045],
      ["clip", 3.75],
    ]);
  });

  it("plans no clip when the launch asked for none", () => {
    expect(scenePlan({ ...REQ, clip: false }, booked()).map((s) => s.name)).not.toContain(CLIP_STEP);
  });

  it("leaves out every booked step, so a retry never re-pays one", () => {
    const plan = scenePlan(REQ, booked(readStep(1), readStep(2), readStep(3), replicaStep(1)));
    expect(plan.map((s) => s.name)).toEqual(["replica:2", "clip"]);
    expect(scenePlan(REQ, booked(readStep(1), readStep(2), readStep(3), replicaStep(1), replicaStep(2), CLIP_STEP))).toEqual([]);
  });
});

describe("the request door", () => {
  it("takes a well-formed request and refuses one with no keyframes or six", () => {
    expect(parseSceneRequest(REQ).ok).toBe(true);
    expect(parseSceneRequest({ ...REQ, keyframes: [] }).ok).toBe(false);
    expect(parseSceneRequest({ ...REQ, keyframes: Array.from({ length: 6 }, (_, i) => `k-${i}`) }).ok).toBe(false);
    expect(parseSceneRequest({ ...REQ, replicas: 3 }).ok).toBe(false);
  });
});
