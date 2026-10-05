// LANE — MODEL RECALIBRATIONS MUST STACK OVER ACCEPTED VERSIONS (dynamic).
//
// When a creator accepts a model version, subsequent recalibrations must build
// on top of that accepted version's beats and attribution, not reset back to
// the static fixtures.

import { test, expect } from "@playwright/test";
import { recalibrate, recalibrateFromPlan } from "@/app/_phases/script/recalibrate";
import { parseEditPlan, PlanError, type EditPlan } from "@/app/_phases/script/editPlan";
import { BASELINE } from "@/app/_phases/script/versions";
import { RENDERS } from "@/app/_phases/script/renders";
import { ATTRIBUTION } from "@/app/_phases/script/impact";
import { buildCards } from "@/app/_phases/_shared/notebook/cards";
import { chainOf, attributionOf, renderPayloadFor, rendersInScope } from "@/app/_phases/script/chainBase";

const ctx = () => ({ cards: buildCards(), scope: {} });
const emptyPlan: EditPlan = { edits: [], refusals: [], unchanged: [], summary: "empty plan" };

const cut145Plan: EditPlan = {
  edits: [{ renderId: "reversal-chain", op: "cut", beatAt: "1:45", why: "cut beat at 1:45" }],
  refusals: [],
  unchanged: [],
  summary: "cut 1:45",
};

test("case 1: empty plan over model version preserves cut beat (stacks beats)", () => {
  const v2 = recalibrateFromPlan(BASELINE, [], cut145Plan, "v2", 1, ctx());
  const v3 = recalibrateFromPlan(v2, [], emptyPlan, "v3", 2, ctx());

  expect(v3.beats?.["reversal-chain"]).toEqual(v2.beats?.["reversal-chain"]);
  expect(v3.beats?.["reversal-chain"]?.length).toBe(15);
  expect(v3.beats?.["reversal-chain"]?.some((b) => b.text.startsWith("Long-term holders sold"))).toBe(false);
});

test("case 2: empty plan over model version is a no-op on impact", () => {
  const v2 = recalibrateFromPlan(BASELINE, [], cut145Plan, "v2", 1, ctx());
  const v3 = recalibrateFromPlan(v2, [], emptyPlan, "v3", 2, ctx());

  expect(v3.impact).toEqual(v2.impact);
});

test("case 3: subsequent cut @1:45 cuts v2's 1:45 beat (M2 beat) and keeps previous cut", () => {
  const v2 = recalibrateFromPlan(BASELINE, [], cut145Plan, "v2", 1, ctx());
  // in v2, the beat at 1:45 is M2 ("If the market values...")
  const cutM2Plan: EditPlan = {
    edits: [{ renderId: "reversal-chain", op: "cut", beatAt: "1:45", why: "cut v2's 1:45" }],
    refusals: [],
    unchanged: [],
    summary: "cut 1:45 again",
  };
  const v3 = recalibrateFromPlan(v2, [], cutM2Plan, "v3", 2, ctx());
  const rcBeats = v3.beats?.["reversal-chain"] ?? [];

  expect(rcBeats.some((b) => b.text.startsWith("If the market values"))).toBe(false);
  expect(rcBeats.some((b) => b.text.startsWith("Long-term holders sold"))).toBe(false);
});

test("case 4: parseEditPlan validates against base version marks when base is passed", () => {
  const v2 = recalibrateFromPlan(BASELINE, [], cut145Plan, "v2", 1, ctx());
  const rawCut425 = JSON.stringify({
    edits: [{ renderId: "reversal-chain", op: "cut", beatAt: "4:25", why: "cut 4:25" }],
    refusals: [],
    unchanged: [],
    summary: "cut 4:25",
  });
  const rawCut445 = JSON.stringify({
    edits: [{ renderId: "reversal-chain", op: "cut", beatAt: "4:45", why: "cut 4:45" }],
    refusals: [],
    unchanged: [],
    summary: "cut 4:45",
  });

  // accepted with base: v2
  const parsed425 = parseEditPlan(rawCut425, { base: v2 });
  expect(parsed425.edits[0].beatAt).toBe("4:25");

  // throws PlanError 'names no beat' for 4:45 with base: v2
  expect(() => parseEditPlan(rawCut445, { base: v2 })).toThrow(PlanError);
  expect(() => parseEditPlan(rawCut445, { base: v2 })).toThrow(/names no beat/);

  // no base keeps today's fixture universe (guard)
  const parsedFixture = parseEditPlan(rawCut445);
  expect(parsedFixture.edits[0].beatAt).toBe("4:45");
  expect(() => parseEditPlan(rawCut425)).toThrow(PlanError);
});

test("case 5: renderPayloadFor(v2) carries 15 beats and 3:55 cards, null for un-attributed", () => {
  const v2 = recalibrateFromPlan(BASELINE, [], cut145Plan, "v2", 1, ctx());
  const payload = renderPayloadFor(v2);
  const rc = payload.find((r) => r.id === "reversal-chain")!;

  expect(rc.beats.length).toBe(15);
  const b355 = rc.beats.find((b) => b.at === "3:55")!;
  expect(b355).toBeDefined();
  expect(b355.cards).toEqual(["r4", "f-correlation", "f-yields", "m-institutionalisation"]);

  const b425 = rc.beats.find((b) => b.at === "4:25")!;
  expect(b425).toBeDefined();
  expect(b425.cards).toBeNull();

  for (const b of rc.beats) {
    expect(b.cards).not.toEqual([]);
  }
});

test("case 6 (GUARD): renderPayloadFor(BASELINE) deep-equals today's fixture payload", () => {
  const baselinePayload = renderPayloadFor(BASELINE);
  const expectedFixturePayload = RENDERS.map((r) => ({
    ...r,
    beats: r.beats.map((b) => ({
      ...b,
      cards: ATTRIBUTION[r.id]?.[b.at] ?? null,
    })),
  }));
  expect(baselinePayload).toEqual(expectedFixturePayload);
});

test("case 7: rendersInScope over renderPayloadFor(v2') sees inserted beat on derived-short", () => {
  const insertPlan: EditPlan = {
    edits: [
      {
        renderId: "derived-short",
        op: "insert",
        afterBeatAt: "0:00",
        label: "inserted",
        connector: "THEREFORE",
        text: "Lagging the ETF.",
        cards: ["f-etf-lag"],
        seconds: 5,
        why: "insert lag beat",
      },
    ],
    refusals: [],
    unchanged: [],
    summary: "insert beat on derived-short",
  };
  const v2Prime = recalibrateFromPlan(BASELINE, [], insertPlan, "v2-prime", 1, ctx());
  const payloadPrime = renderPayloadFor(v2Prime);
  const inScope = rendersInScope(payloadPrime, [{ cardId: "f-etf-lag", kind: "less-focus" }]);
  expect(inScope.has("derived-short")).toBe(true);
});

test("case 8 (GUARD): simulated base from baseline falls back to fixture chain", () => {
  const vs = recalibrate(BASELINE, [], "vs", 1, ctx());
  const beatsFromVs = recalibrateFromPlan(vs, [], cut145Plan, "v-from-vs", 2, ctx()).beats;
  const beatsFromBase = recalibrateFromPlan(BASELINE, [], cut145Plan, "v-from-base", 2, ctx()).beats;
  expect(beatsFromVs).toEqual(beatsFromBase);
});

test("case 9: simulated fallback carries base.beats and base.attribution forward", () => {
  const v2 = recalibrateFromPlan(BASELINE, [], cut145Plan, "v2", 1, ctx());
  const vs = recalibrate(v2, [], "v3", 2, ctx());

  expect(chainOf(vs, "reversal-chain")).toEqual(v2.beats?.["reversal-chain"]);
  expect(chainOf(vs, "reversal-chain").length).toBe(15);
  expect(attributionOf(vs, "reversal-chain")).toEqual(attributionOf(v2, "reversal-chain"));
});
