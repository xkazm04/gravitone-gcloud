import { describe, expect, expectTypeOf, it } from "vitest";

import { checkEditPlan, EDIT_DIRECTIVES, pickVerdicts, PICK_OUTCOMES, type EditPlan } from "../src/board.ts";
import { editPlanSchema } from "../src/decision.ts";
import { checkVerdict, PACKET_SOURCES, reasonForKey, REASON_KEYS, SOURCES, type PacketSource } from "../src/source.ts";

// Reasons belong to the source (Phase 3 decision 4). These pin each list to the
// v1 vocabulary it was taken from, the key binding, and the verdict door.

describe("packet sources", () => {
  it("every source has a row, and the table's keys are the sources", () => {
    expect(Object.keys(SOURCES).sort()).toEqual([...PACKET_SOURCES].sort());
    expectTypeOf<keyof typeof SOURCES>().toEqualTypeOf<PacketSource>();
  });

  it("carries v1's own lists, in v1's order", () => {
    expect(SOURCES.strips.reasons).toEqual(["concept", "legibility", "motion", "craft", "identity", "too-busy", "generic", "broken"]);
    expect(SOURCES.strips.maxReasons).toBe(3);
    expect(SOURCES.article.reasons).toEqual(["structure", "storytelling", "depth", "figures", "voice", "medium-fidelity", "truth"]);
    expect(SOURCES.audio.reasons).toHaveLength(11);
    expect(SOURCES.dojo.reasons).toEqual(["technique", "execution"]);
    expect(SOURCES.forge.reasons).toEqual(["style", "subject", "text", "craft"]);
  });

  it("binds keys 1-9, 0, - to a source's list in order; eleven audio defects use all eleven keys", () => {
    expect(REASON_KEYS).toHaveLength(11);
    expect(reasonForKey("audio", "1")).toBe("smeared-transients");
    expect(reasonForKey("audio", "0")).toBe("off-brief");
    expect(reasonForKey("audio", "-")).toBe("wrong-event");
    expect(reasonForKey("forge", "4")).toBe("craft");
    expect(reasonForKey("forge", "5")).toBeUndefined();
    expect(reasonForKey("suno", "1")).toBeUndefined();
    for (const s of PACKET_SOURCES) expect(SOURCES[s].reasons.length, s).toBeLessThanOrEqual(REASON_KEYS.length);
  });
});

describe("checkVerdict - the source half of the verdict door", () => {
  const reject = (reasons: string[], note?: string) => ({ verdict: "reject" as const, reasons, ...(note === undefined ? {} : { note }) });

  it("accepts the source's reasons and returns them in list order", () => {
    const r = checkVerdict("strips", reject(["generic", "concept"]));
    expect(r.ok && r.value).toEqual(["concept", "generic"]);
  });

  it("refuses another source's word, a repeat, more than the max, and reasons on a keep", () => {
    expect(checkVerdict("audio", reject(["style"])).ok).toBe(false);
    expect(checkVerdict("forge", reject(["style", "style"])).ok).toBe(false);
    expect(checkVerdict("strips", reject(["concept", "legibility", "motion", "craft"])).ok).toBe(false);
    expect(checkVerdict("forge", { verdict: "keep", reasons: ["style"] }).ok).toBe(false);
    expect(checkVerdict("suno", reject([])).ok).toBe(true);
  });

  it("a note only where v1 kept one, within its bound, never blank and never on an undecide", () => {
    expect(checkVerdict("dojo", reject([], "x")).ok).toBe(false);
    expect(checkVerdict("strips", reject([], "x".repeat(500))).ok).toBe(true);
    expect(checkVerdict("strips", reject([], "x".repeat(501))).ok).toBe(false);
    expect(checkVerdict("forge", { verdict: null, reasons: [], note: "x" }).ok).toBe(false);
    expect(checkVerdict("forge", reject([], "   ")).ok).toBe(false);
  });
});

describe("blind picks and edit plans", () => {
  it("maps every outcome to the two arms' verdicts", () => {
    expect(PICK_OUTCOMES.map((o) => pickVerdicts("trials", o))).toEqual([
      ["keep", "reject"],
      ["reject", "keep"],
      ["keep", "keep"],
      ["reject", "reject"],
    ]);
  });

  it("an edit plan is the prototype's five directives, trimmed, non-empty and refused rather than cut", () => {
    expect(EDIT_DIRECTIVES).toEqual(["more_weight", "less_weight", "remove", "reposition", "free_text"]);
    const ok = checkEditPlan([{ section: " s2 ", directive: "remove", text: "  the second claim has no source " }]);
    expect(ok.ok && ok.value).toEqual([{ section: "s2", directive: "remove", text: "the second claim has no source" }]);
    expect(checkEditPlan([]).ok).toBe(false);
    expect(checkEditPlan([{ section: "s1", directive: "free_text", text: "x".repeat(2001) }]).ok).toBe(false);
    expect(checkEditPlan([{ section: "", directive: "free_text", text: "x" }]).ok).toBe(false);
  });

  it("the wire door runs the same check", () => {
    const plan: EditPlan = [{ section: "s1", directive: "more_weight", text: "lead with the measurement" }];
    expect(editPlanSchema.safeParse(plan).success).toBe(true);
    expect(editPlanSchema.safeParse([]).success).toBe(false);
    expect(editPlanSchema.safeParse([{ section: "s1", directive: "shout", text: "x" }]).success).toBe(false);
  });
});
