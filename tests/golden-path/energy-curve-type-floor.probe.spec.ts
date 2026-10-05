// LANE — THE ENERGY CURVE'S LABELS LIVE ON THE TYPE SCALE.
//
// They were SVG <text fontSize={9}> in a 640-unit viewBox, so their rendered size
// was 9 * (svg width / 640) px — 5.9px at the component's own min width, under
// the 16px text-label floor for any width below 1138px. check-type-scale.mjs
// matches class names and style-object sizes, so a JSX attribute in user units
// passed it. This ratchet is the check that could see it.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("EnergyCurve draws no SVG text and its labels carry text-label", () => {
  const raw = readFileSync(join(process.cwd(), "app/_phases/script/trailer/EnergyCurve.tsx"), "utf8");
  expect(raw.length, "the walk read nothing").toBeGreaterThan(0);
  const src = stripComments(raw);
  expect(src).not.toMatch(/<text[\s>]/);
  expect(src).not.toMatch(/fontSize=/);
  expect(src).toContain("text-label");
  expect(src, "the figure keeps its accessible name").toContain('role="img"');
});
