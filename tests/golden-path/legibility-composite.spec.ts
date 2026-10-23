// LANE — THE LEGIBILITY ARITHMETIC (Node; the browser half is tests/live/legibility.live.spec.ts).
//
// The live lane trusts `effective` to composite alpha x ancestor opacity over the
// ground. This pins that arithmetic with the Ghost numbers the repo's own law cites,
// so a slip in the formula cannot make the live lane green for the wrong reason.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { MARK_FLOOR, contrastRatio, effective, hexToRgb, measurerSource } from "../live/_legibility";

const GROUND = "#080a10";

test("the 2026-09 Ghost outline (white/30 inside opacity-40) composites far below the mark floor", () => {
  const ratio = effective({ rgba: [255, 255, 255, 0.3] }, [0.4], GROUND);
  expect(ratio).toBeLessThan(MARK_FLOOR);
  expect(ratio).toBeLessThan(1.5); // ~0.12 effective alpha: "nothing", not "faint"
});

test("the v1 Ghost (white/45 inside opacity-55) was better but still under 3", () => {
  // History. The card's acceptance text expected >= 3 here; the arithmetic says ~2.1. It is
  // kept as the measurement that led to the 2026-10-15 ruling below.
  const ratio = effective({ rgba: [255, 255, 255, 0.45] }, [0.55], GROUND);
  expect(ratio).toBeGreaterThan(effective({ rgba: [255, 255, 255, 0.3] }, [0.4], GROUND));
  expect(ratio).toBeLessThan(MARK_FLOOR);
  expect(ratio).toBeCloseTo(2.12, 1);
});

test("the shipped Ghost outline (--faint at 80%, no ancestor opacity) holds the mark floor", () => {
  // Owner ruling 2026-10-15: the outline is a mark, so it holds 3:1 (WCAG 1.4.11).
  // Ghost.module.css draws it as color-mix(in srgb, var(--faint) 80%, transparent) and
  // nothing wraps the card in opacity. --faint is read from the token file so a token
  // change that breaks the floor fails here.
  const tokens = readFileSync(join(process.cwd(), "packages/ui/src/tokens.css"), "utf8");
  const hex = /--faint:\s*(#[0-9a-fA-F]{6})\s*;/.exec(tokens)?.[1];
  expect(hex).toBeTruthy();
  const [r, g, b] = hexToRgb(hex!);
  expect(effective({ rgba: [r, g, b, 0.8] }, [], GROUND)).toBeGreaterThanOrEqual(MARK_FLOOR);
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
