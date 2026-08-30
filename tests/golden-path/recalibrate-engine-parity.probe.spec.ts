// LANE — THE TWO RECALIBRATION ENGINES OWE THE SAME ANSWER (dynamic).
//
// recalibrate.ts states the contract: the guards run "through the SAME guards in
// the SAME order" on both paths, and GUARD 4 is "literally the same function on
// both paths". The function was; its INPUT was not.
//
// `recalibrate()` (simulated) copies `base.impact` before applying anything, so
// the `kind: "cut"` rows impact.ts builds from each render's `cutFacts` survive.
// `recalibrateFromPlan()` (model) went through `impactFrom`, which started from
// `{}` and only ever wrote `spoken` — so every deliberate exclusion became
// `unused`, and GUARD 4's `gone` set (which tests `every(... === "cut")`) could
// never see a fully-cut card on the path where a model had just rewritten the
// script.
//
// These probes pin the parity rather than the fix, so a future rewrite of either
// engine has to keep it.
import { test, expect } from "@playwright/test";
import { recalibrate, recalibrateFromPlan } from "@/app/_phases/script/recalibrate";
import { BASELINE } from "@/app/_phases/script/versions";
import { RENDERS } from "@/app/_phases/script/renders";
import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import type { EditPlan } from "@/app/_phases/script/editPlan";

const ctx = () => ({ cards: buildCards(), scope: {} });
const emptyPlan = (): EditPlan => ({ edits: [], refusals: [], unchanged: [], summary: "no edits" });

/** Every (render, fact) pair the fixtures declare as a deliberate exclusion. */
const declaredCuts = () =>
  RENDERS.flatMap((r) => r.cutFacts.map((c) => ({ renderId: r.id, factId: c.factId })));

test("parity: the fixtures actually declare some cuts, or these probes prove nothing", () => {
  const cuts = declaredCuts();
  console.log(`[parity] declared cutFacts: ${cuts.map((c) => `${c.renderId}/${c.factId}`).join(", ")}`);
  expect(cuts.length).toBeGreaterThan(0);
});

test("parity: a MODEL pass keeps every cut record, exactly as a simulated pass does", () => {
  const sim = recalibrate(BASELINE, [], "v-sim", 1, ctx());
  const mod = recalibrateFromPlan(BASELINE, [], emptyPlan(), "v-mod", 1, ctx());

  for (const { renderId, factId } of declaredCuts()) {
    expect(sim.impact[renderId]?.[factId]?.kind, `simulated ${renderId}/${factId}`).toBe("cut");
    expect(mod.impact[renderId]?.[factId]?.kind, `model ${renderId}/${factId}`).toBe("cut");
  }
});

test("parity: the cut carries its REASON on both paths — a ✕ with no why is half a record", () => {
  const mod = recalibrateFromPlan(BASELINE, [], emptyPlan(), "v-mod", 1, ctx());
  for (const r of RENDERS)
    for (const c of r.cutFacts)
      expect(mod.impact[r.id]?.[c.factId]?.why, `${r.id}/${c.factId}`).toBe(c.why);
});

test("parity: an edit that speaks a previously-cut fact WINS over the stale declaration", () => {
  // The asymmetry with impact.ts, asserted rather than assumed. There, the
  // attribution table and cutFacts describe the same script and the cut wins.
  // Here the plan is newer: reinstating a cut fact is a decision the model made.
  const r = RENDERS.find((x) => x.cutFacts.length > 0)!;
  const cut = r.cutFacts[0];
  const beatAt = r.beats[0].at;

  const plan: EditPlan = {
    edits: [{ renderId: r.id, op: "rewrite", beatAt, text: "reinstated", cards: [cut.factId], why: "bring it back" }],
    refusals: [],
    unchanged: [],
    summary: "reinstate one cut fact",
  };
  const mod = recalibrateFromPlan(BASELINE, [], plan, "v-mod", 1, ctx());
  const u = mod.impact[r.id]?.[cut.factId];
  console.log(`[parity] reinstated ${r.id}/${cut.factId} -> ${u?.kind} ${u?.seconds}s`);
  expect(u?.kind).toBe("spoken");
  // And it starts its tally at the beat it was given, not on top of the cut row.
  expect(u?.beats).toEqual([beatAt]);
});
