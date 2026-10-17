// LANE — THE FRAMES HEADER DOES NOT STATE A FALSE ZERO, AND ITS LABEL CARRIES WORK FACTS ONLY.
// A promotional cut has frames = [] by construction; the label the header says out loud
// (`FramesRender.engineLabel`) must not print "0 frames derived", and must not narrate the app
// ("see the shots view", "Step 2 composes").
//
// Dynamic since Phase 6 (L59). It used to read app/_phases/frames/frames.ts as TEXT, and that
// file had been a one-line `export * from "@/lib/frames/frames"` stub since Phase 0.4 - so it
// passed over a line that could never contain either phrase, whatever the real module said.
// Now it asks every producer of the label (explainer, composed trailer spine, absent spine) for
// the label itself, so a clause added to any of them goes red here.
//
// "frame count is only drawn for a cut that has a frame layer" retired with FramesStep.tsx (the
// v1 studio, Phase 4 wave D); no probe holds the frames part editor to the same rule yet.
import { test, expect } from "@playwright/test";

import { absentTrailerRender, explainerRender, framesFor, trailerRender, type FramesRender } from "@/lib/frames/frames";
import { slotsFor } from "@/lib/research/beats";
import { RENDERS } from "@/lib/script/renders";
import { composeCut } from "@/lib/script/trailer/cut";
import { GLASS_HARBOR_CUE } from "@/lib/studio/trailerFixtures";

const APP_SUBJECT = ["see the shots view", "Step 2 composes"];
const FALSE_ZERO = /\b0 frames?\b|frames derived/i;

function spine() {
  const slots = slotsFor("trailer");
  return composeCut({
    projectId: "p-header",
    title: "Glass Harbor — trailer",
    picks: Object.fromEntries(slots.map((s) => [s.id, s.variants[0].id])),
    slots,
    cue: GLASS_HARBOR_CUE,
  });
}

function everyLabelSource(): FramesRender[] {
  return [
    ...RENDERS.map(explainerRender),
    trailerRender(spine(), { template: "trailer", durationS: 120 }),
    absentTrailerRender({ title: "Glass Harbor — trailer", template: "trailer", durationS: 120 }),
  ];
}

test("every engineLabel carries work facts only - no app-subject clause", () => {
  const sources = everyLabelSource();
  expect(sources.map((s) => s.origin)).toEqual(expect.arrayContaining(["explainer-fixture", "trailer-cut", "no-spine"]));
  for (const s of sources) {
    expect(s.engineLabel.length, `${s.id} has a label`).toBeGreaterThan(0);
    for (const clause of APP_SUBJECT) expect(s.engineLabel, `${s.id}`).not.toContain(clause);
  }
});

test("a cut with no frame layer does not have its label state a frame count", () => {
  for (const s of everyLabelSource().filter((r) => r.origin !== "explainer-fixture")) {
    expect(framesFor(s, RENDERS[0]), `${s.id} is a promotional cut: no frames by construction`).toEqual([]);
    expect(s.engineLabel, `${s.id}`).not.toMatch(FALSE_ZERO);
  }
});
