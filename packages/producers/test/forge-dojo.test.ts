import { describe, expect, it } from "vitest";
import { cycleOf, dojoGooglePlan, dojoJobId, dojoLocalWork, dojoRunOf, googleRepeats, localOrder, mediaOf } from "../src/dojo/plan.ts";
import { forgeJobId, forgeRunOf, forgeWork, gradeStep, type ForgeView } from "../src/forge/plan.ts";

// The forge and Dojo plans' pure halves on literal views: the receipt's whole-run
// counts (never the next drive's step list), identities, the google walk, the
// serial-lane order. The step lists themselves are held to their Python twins by
// plan-cases.json (tests/next-server/producer-{forge,dojo}.test.ts).

const fresh: ForgeView = {
  scenes: [{ id: "s1", annotated: false }],
  candidates: [
    { id: "s1/a", scene: "s1", status: "pending", plate: false },
    { id: "s1/b", scene: "s1", status: "pending", plate: false },
  ],
};

describe("the forge receipt counts the whole run", () => {
  it("a fresh run: every plate, its annotation and every grade - although the next drive plans only the annotation", () => {
    expect(forgeWork(fresh)).toEqual({ plates: 2, reads: 3, seconds: 2 * 96 + 3 * 24 });
    expect(forgeWork(fresh, { skipGrade: true })).toEqual({ plates: 2, reads: 1, seconds: 2 * 96 + 24 });
  });

  it("a half-done run: a graded plate costs nothing more; an unmeasured one is owed a grade; a plate on disk is not drawn again", () => {
    const view: ForgeView = {
      scenes: [{ id: "s1", annotated: true }],
      candidates: [
        { id: "s1/a", scene: "s1", status: "graded", plate: true },
        { id: "s1/b", scene: "s1", status: "unmeasured", plate: true },
        { id: "s1/c", scene: "s1", status: "pending", plate: true },
        { id: "s1/d", scene: "s1", status: "failed", plate: false },
      ],
    };
    expect(forgeWork(view)).toEqual({ plates: 1, reads: 3, seconds: 96 + 3 * 24 });
  });

  it("names: a job per run, `~k` for a later one; a run id is a directory name; a grade carries its attempt", () => {
    expect(forgeJobId("2026-10-16-sweep")).toBe("job:run:forge:2026-10-16-sweep");
    expect(forgeJobId("r", 3)).toBe("job:run:forge:r~3");
    expect(forgeRunOf("r")).toBe("forge:r");
    expect(() => forgeJobId("a/b")).toThrow(/not a forge run id/);
    expect(() => forgeJobId("")).toThrow(/not a forge run id/);
    expect(gradeStep("s1/a", 2)).toBe("grade:s1/a:a2");
  });
});

describe("the Dojo plans", () => {
  it("a video spec whose arms name an engine is the serial-lane runner's, and it renders every wan clip first", () => {
    const spec = { media: "video", pairs: [{ id: "p1", baseline: { engine: "h3-ref2va" }, challenger: { engine: "wan" } }, { id: "p2", baseline: { engine: "wan" }, challenger: {} }] };
    expect(mediaOf(spec)).toBe("video-serial-lanes");
    expect(mediaOf({ media: "video", pairs: [{ id: "p1" }] })).toBe("video");
    expect(localOrder(spec, "video-serial-lanes").map((u) => `${u.pair}--${u.arm}`)).toEqual(["p1--challenger", "p2--baseline", "p2--challenger", "p1--baseline"]);
    expect(localOrder(spec, "image").map((u) => `${u.pair}--${u.arm}`)).toEqual(["p1--baseline", "p1--challenger", "p2--baseline", "p2--challenger"]);
  });

  it("the local receipt counts every render and every read left, the reads of unmade renders included", () => {
    const units = [
      { key: "p1--baseline", rendered: true, read: true },
      { key: "p1--challenger", rendered: true, read: false },
      { key: "p2--baseline", rendered: false, read: false },
    ];
    expect(dojoLocalWork(units, "image")).toEqual({ renders: 1, reads: 2, seconds: 96 + 2 * 24 });
    expect(dojoLocalWork(units, "video").seconds).toBe(300 + 2 * 72);
  });

  it("google: one generate per arm for all its repeats, then its readbacks; a whole arm is never billed again", () => {
    const est = { perImageUsd: 0.045, readbackUsd: 0.002 };
    const steps = dojoGooglePlan(
      [
        { key: "g1--baseline", have: [false, false], read: [false, false] },
        { key: "g1--challenger", have: [true, true], read: [true, false] },
      ],
      new Set(),
      est,
    );
    expect(steps.map((s) => [s.name, s.estimate.usd])).toEqual([
      ["generate:g1--baseline", 0.09],
      ["readback:g1--baseline--r1", 0.002],
      ["readback:g1--baseline--r2", 0.002],
      ["readback:g1--challenger--r2", 0.002],
    ]);
    const booked = dojoGooglePlan([{ key: "g1--baseline", have: [false, false], read: [false, false] }], new Set(["generate:g1--baseline"]), est);
    expect(booked.map((s) => s.name), "a booked generate is not planned again even with its files gone").toEqual(["readback:g1--baseline--r1", "readback:g1--baseline--r2"]);
    expect(googleRepeats({})).toBe(3);
    expect(googleRepeats({ repeats: 0 })).toBe(3);
    expect(googleRepeats({ repeats: 2 })).toBe(2);
  });

  it("names: the cycle is the run", () => {
    expect(dojoJobId("2026-10-16-light")).toBe("job:run:dojo:2026-10-16-light");
    expect(dojoRunOf("c")).toBe("dojo:c");
    expect(cycleOf("dojo:c")).toBe("c");
    expect(() => dojoJobId("../x")).toThrow(/not a dojo cycle id/);
  });
});
