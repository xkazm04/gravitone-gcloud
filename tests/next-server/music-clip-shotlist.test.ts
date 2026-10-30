import { describe, expect, it } from "vitest";

import { checkList, expandPlan, type ShotPlanV1 } from "@/lib/music-clip/shotlist";
import { fixtureTimeline } from "@/lib/music-clip/fixtures/timeline";

// The operator's rule for Break the Sequence (2026-10-30): no shot over 3 s.
describe("shot plan -> shot list", () => {
  const tl = fixtureTimeline();
  const plan = (unit: "bar" | "half" | "beat", units = 1, max = 3): ShotPlanV1 => ({
    v: 1,
    maxShotS: max,
    sections: tl.sections.map((s) => ({ sectionId: s.id, unit, shots: [{ set: "a", cam: "wide", note: "x", units }, { set: "b", cam: "close", note: "y" }] })),
  });

  it("covers the track end to end, cuts on the grid, every shot under the ceiling", () => {
    const { list, errors } = expandPlan(plan("bar"), tl);
    expect(errors).toEqual([]);
    expect(list.shots[0].startS).toBe(0);
    expect(Math.abs(list.shots.at(-1)!.endS - tl.track.durationS)).toBeLessThan(0.05);
    const beatTimes = new Set(tl.beats.map((b) => b.t.toFixed(3)));
    const sectionEdges = new Set(tl.sections.flatMap((s) => [s.startS.toFixed(3), s.endS.toFixed(3)]));
    for (const s of list.shots) expect(beatTimes.has(s.startS.toFixed(3)) || sectionEdges.has(s.startS.toFixed(3))).toBe(true);
  });

  it("refuses a plan whose shots break the ceiling, naming them", () => {
    const { errors } = expandPlan(plan("bar", 2), tl); // two bars at 120 BPM = 4 s
    expect(errors.some((e) => /over the 3 s ceiling/.test(e))).toBe(true);
  });

  it("refuses an unknown cam and an unplanned section", () => {
    const p = plan("bar");
    (p.sections[0].shots[0] as { cam: string }).cam = "dolly-zoom";
    p.sections.pop();
    const { errors } = expandPlan(p, tl);
    expect(errors.some((e) => /cam "dolly-zoom"/.test(e))).toBe(true);
    expect(errors.some((e) => /has no plan/.test(e))).toBe(true);
  });

  it("variants count each set/cam pair across the film", () => {
    const { list } = expandPlan(plan("bar"), tl);
    const a = list.shots.filter((s) => s.set === "a").map((s) => s.variant);
    expect(a).toEqual(a.map((_, i) => i));
  });

  it("checkList flags a gap", () => {
    const { list } = expandPlan(plan("bar"), tl);
    list.shots[1] = { ...list.shots[1], startS: list.shots[1].startS + 0.1 };
    expect(checkList(list, tl).some((e) => /gap or overlap/.test(e))).toBe(true);
  });
});
