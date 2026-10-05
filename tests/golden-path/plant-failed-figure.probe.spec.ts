// LANE — A FAILED READ IS NOT A LOADING READ. usePlant's docstring promises that a
// list which cannot be read leaves its figure OFF; the rejection handler was a bare
// `() => undefined`, so the figure stayed undefined and rendered `…` for the life
// of the page, indistinguishable from a read still in flight.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { test, expect } from "@playwright/test";

import { stripComments } from "./_helpers";

const src = stripComments(readFileSync(resolve(__dirname, "../../app/foundry/plant.tsx"), "utf8"));

test("plant: each of the three list reads records its failure", () => {
  for (const call of ["fetchExtractRuns()", "fetchCatalogue()", "fetchTrainingCycles()"]) {
    const at = src.indexOf(call);
    expect(at, `${call} not found`).toBeGreaterThan(-1);
    const block = src.slice(at, src.indexOf("\n    fetch", at + 1) > -1 ? src.indexOf("\n    fetch", at + 1) : src.indexOf("}, []);", at));
    expect(block, `${call}: list rejection is a bare drop`).toMatch(/fail\("/);
  }
});

test("plant: the figures of a failed station are not drawn", () => {
  expect(src).toMatch(/failed \? \[\] : /);
  expect(src).toContain("plant.failed?.");
});
