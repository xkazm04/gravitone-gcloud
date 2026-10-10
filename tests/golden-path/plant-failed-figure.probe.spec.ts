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

// THE RULE MOVED, SO THIS CASE MOVED WITH IT. It used to assert that a failed
// station drew no FIGURE (`failed ? [] : allFigures`), which was true of the
// station row — a card with a name, a dot and two or three numbers. That row is
// gone: the foundry's submenu draws names and a dot and no figures at all
// (app/foundry/FoundrySubnav.tsx), so "draws no figure" is now true of every
// station always, and asserting it would be asserting nothing.
//
// What has to stay true is the SENTENCE above, not the mechanism: a list that
// could not be read must not look like a list still arriving. With the figures
// gone the only channel left is the dot, and an undefined list and a refused one
// both produced no line and therefore no dot — the same collapse, one level up.
// So `engineLines` gives a refusal its own line, and this is what holds it.
test("plant: a station whose list was refused is told apart from one still loading", () => {
  const at = src.indexOf("export function engineLines");
  expect(at, "engineLines not found").toBeGreaterThan(-1);
  const body = src.slice(at, src.indexOf("\n}", at));
  // the refusal is read off `plant.failed`, which is what usePlant records...
  expect(body, "engineLines no longer consults plant.failed").toContain("plant.failed?.");
  // ...and it produces a LINE, so the dot is drawn — absence is what "loading" means.
  expect(body, "a refused list no longer produces a line of its own").toMatch(/tone: "rose"/);
  // and every list usePlant can refuse is actually asked about here.
  for (const k of ["extract", "catalogue", "cycles"]) {
    expect(body, `engineLines never asks whether ${k} was refused`).toContain(`refused("${k}")`);
  }
});
