// An arrow or loop asserts a relation the way a sentence does. Elements may
// cite a fact (optional, back-compatible); an id the notebook lacks is refused.
import { test, expect } from "@playwright/test";
import { reviewSceneSpecs } from "@/app/_phases/frames/sceneSpec";
import type { Frame } from "@/app/_phases/frames/frames";
import { FACTS } from "@/app/_phases/_shared/notebook/facts";

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
