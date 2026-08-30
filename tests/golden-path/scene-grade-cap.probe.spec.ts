// LANE — THE GRADE MUST REACH THE PLATE (dynamic).
//
// `figure-must-cite-a-fact` is enforced: sceneSpec.ts refuses a figure with no
// `factId` and refuses one whose id is not in the notebook. That proves the
// citation EXISTS. It says nothing about what the citation PERMITS.
//
// The notebook grades every fact (`Fact.confidence`, with its reason), and the
// grade is the render's ceiling: a fact graded `low` cannot support an exact
// figure on screen. Pictures have no hedging words, so the cap has to be
// mechanical or it does not happen — and until this probe, resolving the id was
// where the check stopped. `f-midtier-distribute` is the case in the shipped
// fixture: confidence `low`, its own note recording that the window is
// unresolved and the original comparison was arithmetically false. It could be
// drawn as an exact value, with a valid citation, indistinguishable on the
// plate from a `high` fact.
import { test, expect } from "@playwright/test";
import { reviewSceneSpecs } from "@/app/_phases/frames/sceneSpec";
import type { Frame } from "@/app/_phases/frames/frames";
import { FACTS } from "@/app/_phases/_shared/notebook/facts";

// reviewSceneSpecs reads exactly one property off a frame — `at` — to key the
// beat map and to compute `missing`. A full seeded frame would add nothing the
// assertions can see.
const frames = [{ at: "0:04" }] as unknown as Frame[];
const grades = new Map(FACTS.map((f) => [f.id, f.confidence]));
const ids = new Set(FACTS.map((f) => f.id));

const sceneCiting = (factId: string) =>
  JSON.stringify({
    scenes: [
      {
        beatAt: "0:04",
        subject: "a wide field of small blocks, one dense cluster drifting away from the mass",
        motion: "the cluster slides out and the mass settles",
        rationale: "the cohort leaving",
        elements: [{ kind: "bar", label: "the cohort", x: 10, y: 40, w: 30, h: 20, accent: true }],
        texts: [{ role: "figure", value: "77,800", x: 12, y: 30, factId }],
      },
    ],
  });

test("scene-grade-cap: a HIGH-confidence fact may carry an exact figure", () => {
  const r = reviewSceneSpecs(sceneCiting("f-ath"), frames, ids, grades);
  expect(r.rejected).toEqual([]);
  expect(r.specs).toHaveLength(1);
});

test("scene-grade-cap: a LOW-confidence fact may NOT — the citation is valid and the mark is not", () => {
  const r = reviewSceneSpecs(sceneCiting("f-midtier-distribute"), frames, ids, grades);
  for (const x of r.rejected) console.log(`[grade-cap] ${x.beatAt}: ${x.reason}`);
  expect(r.specs).toHaveLength(0);
  expect(r.rejected).toHaveLength(1);
  expect(r.rejected[0].reason).toMatch(/low confidence/i);
});

test("scene-grade-cap: the fixture this is about is still graded low", () => {
  // If somebody re-grades f-midtier-distribute upward, the case above stops
  // testing anything and this line says so instead of going quietly green.
  expect(FACTS.find((f) => f.id === "f-midtier-distribute")?.confidence).toBe("low");
});
