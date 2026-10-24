// An arrow or loop asserts a relation the way a sentence does. Elements may
// cite a fact (optional, back-compatible); an id the notebook lacks is refused.
import { test, expect } from "@playwright/test";
import { reviewSceneSpecs } from "@/lib/frames/sceneSpec";
import type { Frame } from "@/lib/frames/frames";
import { FACTS } from "@/lib/notebook/facts";

const frames = [{ at: "0:04" }] as unknown as Frame[];
const ids = new Set(FACTS.map((f) => f.id));

const sceneWith = (element: Record<string, unknown>) =>
  JSON.stringify({
    scenes: [
      {
        beatAt: "0:04",
        subject: "a wide field of small blocks, one dense cluster drifting away from the mass",
        motion: "the cluster slides out and the mass settles",
        rationale: "the cohort leaving",
        elements: [{ kind: "arrow", label: "drives", x: 10, y: 40, w: 30, h: 20, ...element }],
        texts: [],
      },
    ],
  });

test("scene-element-citation: an element citing a real fact keeps its factId", () => {
  const r = reviewSceneSpecs(sceneWith({ factId: "f-ath" }), frames, ids);
  expect(r.rejected).toEqual([]);
  expect(r.specs[0].elements[0].factId).toBe("f-ath");
});

test("scene-element-citation: an element citing an unknown fact is refused", () => {
  const r = reviewSceneSpecs(sceneWith({ factId: "f-nope" }), frames, ids);
  expect(r.specs).toHaveLength(0);
  expect(r.rejected[0].reason).toMatch(/not in this notebook/i);
});

test("scene-element-citation: an uncited element still passes (back-compat)", () => {
  const r = reviewSceneSpecs(sceneWith({}), frames, ids);
  expect(r.rejected).toEqual([]);
  expect(r.specs[0].elements[0].factId).toBeUndefined();
});

test("scene-element-citation: a null scene, element or text is a finding, not a lost pass", () => {
  // The engine's JSON is a request, not a guarantee. A `null` in any of its
  // three lists used to throw a TypeError out of the review, discarding every
  // good scene beside it.
  const good = JSON.parse(sceneWith({}));
  const scene = good.scenes[0];
  const r = reviewSceneSpecs(JSON.stringify({ scenes: [null, scene] }), frames, ids);
  expect(r.specs).toHaveLength(1);
  expect(r.rejected).toEqual([{ beatAt: "(no beatAt)", reason: "The scene is not an object." }]);
  for (const [key, reason] of [["elements", "An element is not an object."], ["texts", "A text is not an object."]] as const) {
    const bad = reviewSceneSpecs(JSON.stringify({ scenes: [{ ...scene, [key]: [null] }] }), frames, ids);
    expect(bad.specs, key).toHaveLength(0);
    expect(bad.rejected, key).toEqual([{ beatAt: "0:04", reason }]);
  }
});
