// LANE: the phase heading out-ranks every row column in the run ledger.
// RunTrace's own docstring says so; it was drawn at white/30 (2.59:1 on ink),
// the dimmest text in the card.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

test("PhaseHeading is white/60, not white/30", () => {
  const src = stripComments(readFileSync(join(process.cwd(), "app/_phases/research/run/RunTrace.tsx"), "utf8"));
  const at = src.indexOf("function PhaseHeading");
  expect(at, "PhaseHeading not found").toBeGreaterThan(-1);
  const body = src.slice(at, src.indexOf("\n}\n", at));
  expect(body.length).toBeGreaterThan(50);
  expect(body).not.toContain("text-white/30");
  expect(body).toContain("text-white/60");
});
