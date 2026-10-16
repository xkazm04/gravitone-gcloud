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
// and every one of its five cases passes while the result is discarded. (The v1
// studio's DeclinedList panel that drew the finding retired in Phase 4 wave D;
// what stays is that the finding reaches the Version.)

import { readFileSync } from "node:fs";

import { test, expect } from "@playwright/test";

import { RENDERS } from "@/lib/script/renders";
import { recalibrateFromPlan } from "@/app/_phases/script/recalibrate";
import { buildCards } from "@/lib/notebook/cards";
import { BASELINE } from "@/lib/script/versions";
import type { EditPlan } from "@/lib/script/editPlan";
import { stripComments } from "./_helpers";

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
});

test("an empty plan breaks no seam — the check does not cry wolf on the version either", () => {
  const clean = recalibrateFromPlan(
    BASELINE,
    [],
    { edits: [], refusals: [], summary: "no edits" },
    "v-clean",
    1,
    ctx(),
  );
  expect(clean.chainBreaks ?? []).toHaveLength(0);
});

test("the version carries the field — the wiring, asserted", () => {
  // The cases above prove the finding TRAVELS; this one names the joints
  // it travels through, so a future refactor that drops one gets told which.
  // The sibling probe's five cases all pass against a recalibrateFromPlan that
  // throws chainBreaks away, which is exactly what it did.
  const strip = (p: string) => stripComments(readFileSync(p, "utf8"));

  const recal = strip("lib/script/recalibrate.ts");
  const versions = strip("lib/script/versions.ts");

  expect(versions, "Version has no chainBreaks field").toContain("chainBreaks?:");
  expect(recal, "recalibrateFromPlan does not carry chainBreaks onto the version").toContain("chainBreaks:");
});
