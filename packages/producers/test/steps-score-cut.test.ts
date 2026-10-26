import { describe, expect, it } from "vitest";
import { cutPlan, type CutView } from "../src/cut/define.ts";
import { scorePlan, type ScoreView } from "../src/score/define.ts";

// The score and cut act tables on literal views: which units an act plans, and the refusals the
// work states before anything is priced to run (L37).

const price = { seconds: 90, usd: null, unpricedReason: "seconds of audio, no dollar figure" };
const cues: ScoreView["cues"] = [
  { id: "a", title: "build", bpm: 96, hasPicture: true, taken: false, takes: [{ id: "st-1", revision: { section: 1, note: "darker" } }, { id: "st-2" }] },
  { id: "b", title: "release", hasPicture: true, taken: false, takes: [] },
  { id: "c", title: "tail", bpm: 80, hasPicture: false, why: "covers sc-9, which this project does not have", taken: false, takes: [] },
];
const build = cues[0] ?? { id: "", title: "", hasPicture: false, taken: false, takes: [] };
const view = (over: Partial<ScoreView> = {}): ScoreView => ({ face: "standard", cues, bedBpm: null, scenarioPicked: false, ...over });

describe("score acts", () => {
  it("one cue is one unit, named by the cue; a cue without a tempo or a picture is refused in its own words", () => {
    expect(scorePlan(view(), "render-cue", "a", price)).toMatchObject({ ok: true, value: { act: "render-cue", units: [{ name: "cue:a", input: { cueId: "a" }, estimate: { usd: null } }] } });
    expect(scorePlan(view(), "render-cue", "b", price)).toMatchObject({ ok: false, error: { code: "refused", message: "release needs a tempo" } });
    expect(scorePlan(view(), "render-cue", "c", price)).toMatchObject({ ok: false, error: { message: "tail covers sc-9, which this project does not have" } });
  });

  it("the plan job renders every untaken cue and skips none silently: one refusal refuses the act", () => {
    expect(scorePlan(view({ cues: [build] }), null, undefined, price)).toMatchObject({ ok: true, value: { units: [{ name: "cue:a" }] } });
    expect(scorePlan(view(), null, undefined, price)).toMatchObject({ ok: false, error: { message: "release needs a tempo" } });
    expect(scorePlan(view({ cues: [{ ...build, taken: true }] }), null, undefined, price)).toMatchObject({ ok: false, error: { message: "every cue has a take" } });
  });

  it("a revision needs the take's section note; the bed needs a scenario and a tempo", () => {
    expect(scorePlan(view(), "revise-take", "st-1", price)).toMatchObject({ ok: true, value: { units: [{ name: "rev:st-1", input: { section: 1, note: "darker", cueId: "a" } }] } });
    expect(scorePlan(view(), "revise-take", "st-2", price)).toMatchObject({ ok: false, error: { message: "st-2 has no section note to revise" } });
    expect(scorePlan(view({ face: "ads" }), "render-bed", undefined, price)).toMatchObject({ ok: false, error: { message: "render bed needs a picked scenario" } });
    expect(scorePlan(view({ face: "ads", scenarioPicked: true }), "render-bed", undefined, price)).toMatchObject({ ok: false, error: { message: "the bed needs a tempo" } });
    expect(scorePlan(view({ face: "ads", scenarioPicked: true, bedBpm: 100 }), null, undefined, price)).toMatchObject({ ok: true, value: { act: "render-bed", units: [{ name: "bed" }] } });
  });
});

describe("cut acts", () => {
  const free = { seconds: 120, usd: 0 };
  const cv = (over: Partial<CutView> = {}): CutView => ({ face: "standard", scenes: 3, aspects: [], ...over });
  it("an animatic is one unit; no picture is refused", () => {
    expect(cutPlan(cv(), null, undefined, free)).toMatchObject({ ok: true, value: { act: "export-animatic", units: [{ name: "animatic", estimate: { usd: 0 } }] } });
    expect(cutPlan(cv({ scenes: 0 }), "export-animatic", undefined, free)).toMatchObject({ ok: false, error: { message: "no picture to cut" } });
  });
  it("an ads finish renders one unit per aspect, refused while a blocking check fails or for an aspect ads never render at", () => {
    const ads = cv({ face: "ads", aspects: ["9:16", "1:1"] });
    expect(cutPlan(ads, null, undefined, free)).toMatchObject({ ok: true, value: { units: [{ name: "aspect:9:16" }, { name: "aspect:1:1" }] } });
    expect(cutPlan(ads, "render-aspect", "4:5", free)).toMatchObject({ ok: true, value: { units: [{ name: "aspect:4:5" }] } });
    expect(cutPlan(ads, "render-aspect", "21:9", free)).toMatchObject({ ok: false, error: { message: "21:9 is not an aspect an ad renders at" } });
    expect(cutPlan({ ...ads, adsBlocked: "1 shot without a clip" }, null, undefined, free)).toMatchObject({ ok: false, error: { message: "1 shot without a clip" } });
  });
  it("an aspect the finish record names twice is rendered once (ads-finish takes any list of strings)", () => {
    const twice = cv({ face: "ads", aspects: ["9:16", "1:1", "9:16"] });
    const r = cutPlan(twice, null, undefined, free);
    expect(r.ok && r.value.units.map((u) => u.name)).toEqual(["aspect:9:16", "aspect:1:1"]);
  });
});
