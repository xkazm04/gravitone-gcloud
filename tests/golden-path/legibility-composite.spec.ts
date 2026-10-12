// LANE — THE LEGIBILITY ARITHMETIC (Node; the browser half is tests/live/legibility.live.spec.ts).
//
// The live lane trusts `effective` to composite alpha x ancestor opacity over the
// ground. This pins that arithmetic with the Ghost numbers the repo's own law cites,
// so a slip in the formula cannot make the live lane green for the wrong reason.
import { expect, test } from "@playwright/test";

import { MARK_FLOOR, contrastRatio, effective, hexToRgb, measurerSource } from "../live/_legibility";

const GROUND = "#080a10";

test("the 2026-09 Ghost outline (white/30 inside opacity-40) composites far below the mark floor", () => {
  const ratio = effective({ rgba: [255, 255, 255, 0.3] }, [0.4], GROUND);
  expect(ratio).toBeLessThan(MARK_FLOOR);
  expect(ratio).toBeLessThan(1.5); // ~0.12 effective alpha: "nothing", not "faint"
});

test("the shipped Ghost (white/45 inside opacity-55) is better but still under 3", () => {
  // The card's acceptance text expected >= 3 here; the arithmetic says ~2.1. Recorded as
  // a measurement so the discrepancy is visible rather than argued: the live lane
  // baselines it (tests/live/legibility-baseline.json) until the floor is decided.
  const ratio = effective({ rgba: [255, 255, 255, 0.45] }, [0.55], GROUND);
  expect(ratio).toBeGreaterThan(effective({ rgba: [255, 255, 255, 0.3] }, [0.4], GROUND));
  expect(ratio).toBeCloseTo(2.12, 1);
});

test("an unfaded colour is its plain WCAG ratio, and opacities multiply", () => {
  expect(effective({ rgba: [255, 255, 255, 1] }, [], GROUND)).toBeCloseTo(contrastRatio(hexToRgb("#ffffff"), hexToRgb(GROUND)), 6);
  expect(effective({ rgba: [255, 255, 255, 1] }, [0.5, 0.5], GROUND)).toBeCloseTo(
    effective({ rgba: [255, 255, 255, 0.25] }, [], GROUND),
    6,
  );
  expect(effective({ rgba: [255, 255, 255, 0.8] }, [0.9], GROUND)).toBeGreaterThanOrEqual(MARK_FLOOR);
});

test("the page-side program carries every pure function it calls", () => {
  const src = measurerSource({ ground: GROUND });
  for (const name of ["hexToRgb", "relLuminance", "contrastRatio", "over", "measure"]) {
    expect(src).toContain(`function ${name}(`);
  }
});
