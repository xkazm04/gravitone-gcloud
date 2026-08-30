// LANE — A SEAM FINDING REACHES THE PERSON DECIDING (dynamic + wiring).
//
// `edit-plan-chain-seam.probe.spec.ts` next door proves `applyEdits` DETECTS a
// broken seam, in five cases, and its header says the break is "Reported, never
// repaired". Measured 2026-08-29: it was not reported to anyone.
// `recalibrateFromPlan` calls `applyEdits` per render and keeps `a.beats` from
// the result; `chainBreaks` was dropped one line later, the Version had no field
// for it, and a repo-wide grep found no consumer outside editPlan.ts and that
// sibling probe. The machinery was built, explained, and tested into a test.
//
// This is the case that probe cannot make: it asserts the finding is COMPUTED,
// and every one of its five cases passes while the result is discarded.

import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { RENDERS } from "@/app/_phases/script/renders";
import { recalibrateFromPlan } from "@/app/_phases/script/recalibrate";
import { declinedCount } from "@/app/_phases/script/_notes/DeclinedList";
import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import { BASELINE } from "@/app/_phases/script/versions";
import type { EditPlan } from "@/app/_phases/script/editPlan";

const RENDER = "reversal-chain";
const render = RENDERS.find((r) => r.id === RENDER)!;

/** The same seam the sibling probe uses: 0:12 delivers the wish list, 0:30
 *  answers it with BUT. Cutting 0:12 orphans that BUT. Asserted rather than
 *  assumed, so a re-cut fixture fails here instead of going quietly green. */
test("the fixture still has the seam this probe is about", () => {
  expect(render.beats.map((b) => b.at)).toContain("0:12");
  expect(render.beats.find((b) => b.at === "0:30")?.connector).toBe("BUT");
});

const cutPlan = (): EditPlan => ({
  edits: [{ renderId: RENDER, op: "cut", beatAt: "0:12", why: "the note asked for this beat to go" }],
  refusals: [],
  unchanged: [],
  summary: "one cut",
});

const ctx = () => ({ cards: buildCards(), scope: {} });

const versionFromCut = () =>
  recalibrateFromPlan(BASELINE, [], cutPlan(), "v-cut", 1, ctx());

test("a cut that orphans a connector arrives on the version, located by render and mark", () => {
  const v = versionFromCut();
  const breaks = v.chainBreaks ?? [];

  for (const b of breaks) console.log(`[seam] ${b.renderId} ${b.at} ${b.connector} — ${b.why}`);
  expect(breaks.length, "the orphaned BUT did not reach the version").toBeGreaterThan(0);

  const b = breaks.find((x) => x.renderId === RENDER);
  expect(b, "a break must name its render — the reviewer reads one at a time").toBeTruthy();
  expect(b!.at, "and its mark, so there is somewhere to look").toBeTruthy();
  expect(b!.connector).toBe("BUT");
  expect(b!.why, "the why must name the beat that went").toContain("0:12");

  // And it counts toward the heading, or a version whose only finding is a seam
  // renders no panel at all.
  expect(declinedCount(v), "a seam-only version still has a finding").toBeGreaterThan(0);
});

test("an empty plan breaks no seam — the check does not cry wolf on the version either", () => {
  const clean = recalibrateFromPlan(
    BASELINE,
    [],
    { edits: [], refusals: [], unchanged: [], summary: "no edits" },
    "v-clean",
    1,
    ctx(),
  );
  expect(clean.chainBreaks ?? []).toHaveLength(0);
});

test("the version carries the field and the panel reads it — the wiring, asserted", () => {
  // The cases above prove the finding TRAVELS; this one names the four joints
  // it travels through, so a future refactor that drops one gets told which.
  // The sibling probe's five cases all pass against a recalibrateFromPlan that
  // throws chainBreaks away, which is exactly what it did.
  const strip = (p: string) =>
    readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const recal = strip("app/_phases/script/recalibrate.ts");
  const list = strip("app/_phases/script/_notes/DeclinedList.tsx");
  const versions = strip("app/_phases/script/versions.ts");

  expect(versions, "Version has no chainBreaks field").toContain("chainBreaks?:");
  expect(recal, "recalibrateFromPlan does not carry chainBreaks onto the version").toContain("chainBreaks:");
  expect(list, "DeclinedList does not read chainBreaks").toContain("chainBreaks");
  expect(list, "declinedCount ignores chainBreaks, so a seam-only version renders no heading").toContain(
    "v.chainBreaks?.length",
  );
});
