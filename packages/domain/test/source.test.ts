import { describe, expect, expectTypeOf, it } from "vitest";

import { checkEditPlan, EDIT_DIRECTIVES, pickVerdicts, PICK_OUTCOMES, type EditPlan } from "../src/board.ts";
import { editPlanSchema } from "../src/decision.ts";
import { checkVerdict, PACKET_SOURCES, reasonForKey, REASON_KEYS, REASON_MEANING, reasonsOf, reasonVocabulary, SOURCES, type PacketSource, type SourceSpec } from "../src/source.ts";

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
    // scout outgrew the eleven keys with `story` (spark scout-storyboards): its rows key off reasonsBy instead.
    for (const s of PACKET_SOURCES) if (!("reasonsBy" in SOURCES[s])) expect(SOURCES[s].reasons.length, s).toBeLessThanOrEqual(REASON_KEYS.length);
  });

  it("orders a row group's reasons from the source's own list, three at least, no repeats", () => {
    for (const s of PACKET_SOURCES) {
      const spec: SourceSpec = SOURCES[s];
      for (const [group, order] of Object.entries(spec.reasonsBy ?? {})) {
        expect(order.length, `${s}/${group}`).toBeGreaterThanOrEqual(3);
        expect(new Set(order).size, `${s}/${group}`).toBe(order.length);
        for (const r of order) expect(spec.reasons, `${s}/${group}`).toContain(r);
      }
    }
    const v = reasonVocabulary("scout");
    expect(reasonsOf(v, "3d").slice(0, 3)).toEqual(["topology", "texture", "rig"]);
    expect(reasonsOf(v, "storyboards").slice(0, 3)).toEqual(["story", "generic", "use case"]);
    expect(reasonsOf(v, "ideas")).toHaveLength(v.list.length);
    expect(reasonsOf(v, "no such group")).toEqual(v.list);
    expect(reasonsOf(reasonVocabulary("audio"), "music")).toEqual(SOURCES.audio.reasons);
  });
});

// A reason's meaning is the Board's tip on that reason (operator, 2026-10-23). The bound is the
// Hint's (packages/ui/src/components/hint/words.ts HINT_WORDS = 12), restated: @gt/domain sits below @gt/ui.
const MEANING_WORDS = 12;
const words = (s: string) => s.split(/\s+/).filter((w) => w.length > 0).length;

describe("what each reason means", () => {
  it("every source's every reason has one sentence of at most twelve words, and no word the list lacks", () => {
    for (const s of PACKET_SOURCES) {
      const meaning: Readonly<Record<string, string>> = REASON_MEANING[s];
      expect(Object.keys(meaning).sort(), s).toEqual([...SOURCES[s].reasons].sort());
      for (const r of SOURCES[s].reasons) {
        const m = meaning[r] ?? "";
        expect(words(m), `${s} · ${r}: ${m}`).toBeGreaterThan(0);
        expect(words(m), `${s} · ${r}: ${m}`).toBeLessThanOrEqual(MEANING_WORDS);
        expect(m, `${s} · ${r}: one sentence`).toMatch(/^[A-Z][^.!?]*[.]$/);
      }
    }
  });

  it("the view's vocabulary carries the meanings with the list they define", () => {
    const v = reasonVocabulary("scout");
    expect(v.list).toBe(SOURCES.scout.reasons);
    expect([v.max, v.noteMax]).toEqual([SOURCES.scout.maxReasons, SOURCES.scout.noteMax]);
    expect(v.meaning["style"]).toBe("The look is wrong for the video we are making.");
    expect(v.meaning["use case"]).toBe("Serves no video worth making; later nights steer away.");
    expect(reasonVocabulary("suno").meaning).toEqual({});
  });

  it("the table's type holds a source to a meaning for each of its reasons, and only those", () => {
    type Forge = (typeof REASON_MEANING)["forge"];
    // @ts-expect-error - a forge reason with no meaning
    const missing: Forge = { style: "a", subject: "b", text: "c" };
    // @ts-expect-error - a word the forge's list does not have
    const extra: Forge = { style: "a", subject: "b", text: "c", craft: "d", motion: "e" };
    expect([missing, extra]).toHaveLength(2);
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
