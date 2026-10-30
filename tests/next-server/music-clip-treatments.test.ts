// /music-clip Board T's pure parts: the treatments validator (a good set
// passes; a missing section, a keyframe off the track or in the wrong section,
// another direction, five treatments and an unknown grid are each named, all in
// one refusal), the stage machine around the `t` pick (board b now refuses
// before it), and a story whose `treatment` is not the picked one. No browser,
// no GPU, no store: the CLI test shoots the frames.

import { describe, expect, it } from "vitest";

import { validateStory } from "../../lib/music-clip/boards.ts";
import { fixtureTimeline } from "../../lib/music-clip/fixtures/timeline.ts";
import { advanceTo, applyPick, nextVerb, parsePick, resetTo } from "../../lib/music-clip/state.ts";
import { sectionAt, validateTreatments } from "../../lib/music-clip/treatments.ts";
import type { StateV1, Treatment } from "../../lib/music-clip/types.ts";

const tl = fixtureTimeline();
const T = "2026-10-30T00:00:00.000Z";
const base: StateV1 = { v: 1, stage: "analyzed", trackSha1: "abc", picks: {}, updatedAt: T };

const treatment = (id: string, over: Partial<Treatment> = {}): Treatment => ({
  id,
  name: `Name ${id}`,
  logline: "a line of unit 7 stops and the floor follows",
  characters: "visored assembly robots, numbered chests",
  characterTech: "three.js low-poly from primitives, instanced crowd",
  signatureDevice: "one endless push down the line",
  motif: "the visor light: white, red, green",
  plot: tl.sections.map((s) => ({ sectionId: s.id, beat: `${s.id} bar 1 beat 1: the press drops`, shot: "slow push, key light from the left" })),
  transitions: [{ grid: "section", move: "fly through the shutter" }, { grid: "downbeat", move: "hard cut" }],
  shotLengthS: { verse: 3, chorus: 1, bridge: 6 },
  post: ["bloom", "grain", "vignette", "ACES tone map"],
  risk: "the crowd reads as a screensaver",
  keyframes: [
    { t: 4, sectionId: "s1", caption: "the dark line" },
    { t: 12, sectionId: "s2", caption: "unit 7 stops" },
    { t: 20, sectionId: "s3", caption: "the row turns" },
    { t: 27, sectionId: "s4", caption: "the floor, green" },
  ],
  ...over,
});
const good = { v: 1, direction: "rust-choir", treatments: [treatment("one-who-stops"), treatment("assembly-birth"), treatment("the-counter")] };
const violations = (raw: unknown) => {
  const r = validateTreatments(raw, tl, "rust-choir");
  return r.ok ? [] : r.violations;
};

describe("validateTreatments", () => {
  it("accepts a well-formed set", () => expect(validateTreatments(good, tl, "rust-choir").ok).toBe(true));
  it("places a time in its section, the end of the track in the last one", () => {
    expect(sectionAt(tl, 8)?.id).toBe("s2");
    expect(sectionAt(tl, 30)?.id).toBe("s4");
    expect(sectionAt(tl, 31)).toBeUndefined();
  });
  it("lists every violation at once: missing section, bad t, wrong section, wrong direction, five treatments, bad grid", () => {
    const missing = treatment("missing-section", { plot: treatment("x").plot.filter((b) => b.sectionId !== "s3") });
    const badT = treatment("bad-t", { keyframes: [{ t: 31, sectionId: "s4", caption: "past the end" }, { t: 9, sectionId: "s1", caption: "wrong section" }] });
    const badGrid = treatment("bad-grid", { transitions: [{ grid: "beat" as "bar", move: "cut" }] });
    const v = violations({ v: 1, direction: "other", treatments: [missing, badT, badGrid, treatment("four"), treatment("five")] });
    expect(v).toContain('direction "other" is not the picked direction "rust-choir"');
    expect(v).toContain("5 treatments; at most 4");
    expect(v).toContain("treatments[0] (missing-section).plot misses section(s) s3");
    expect(v).toContain("treatments[1] (bad-t).keyframes[0].t 31 is outside the track (0-30 s)");
    expect(v).toContain('treatments[1] (bad-t).keyframes[1].sectionId "s1" is not the section at 9 s (s2)');
    expect(v).toContain('treatments[2] (bad-grid).transitions[0].grid "beat" is not one of section, phrase, bar, downbeat, drop');
    expect(v).toHaveLength(6);
  });
  it("refuses sections out of order, duplicate and non-kebab ids, empty text, seven keyframes, a zero shot length", () => {
    const swapped = treatment("swapped", { plot: [...treatment("x").plot].reverse() });
    const seven = treatment("seven", { keyframes: Array.from({ length: 7 }, (_, i) => ({ t: i, sectionId: "s1", caption: "k" })) });
    const v = violations({ v: 1, direction: "rust-choir", treatments: [swapped, treatment("Bad_Id", { logline: " " }), treatment("swapped", { shotLengthS: { verse: 0, chorus: 1, bridge: 2 } }), seven] });
    expect(v.some((x) => x.startsWith("treatments[0] (swapped).plot must be one beat per section in track order (s1, s2, s3, s4)"))).toBe(true);
    expect(v).toContain("treatments[1] (Bad_Id).id must be kebab-case");
    expect(v).toContain("treatments[1] (Bad_Id).logline is empty");
    expect(v).toContain("treatments[2] (swapped).id is a duplicate");
    expect(v).toContain("treatments[2] (swapped).shotLengthS.verse must be a positive number");
    expect(v).toContain("treatments[3] (seven).keyframes must hold 1-6 keyframes");
  });
});

describe("the t pick in the stage machine", () => {
  const pickedA: StateV1 = { ...base, stage: "picked-a", picks: { a: "x" } };
  it("pick t needs board t; then it lands picked-t and is idempotent", () => {
    expect(() => applyPick(pickedA, parsePick("t:one"), ["one"], T)).toThrow(/needs board t/);
    const boardT = advanceTo(pickedA, "board-t", T);
    expect(boardT.stage).toBe("board-t");
    expect(() => applyPick(boardT, parsePick("t:nope"), ["one", "two"], T)).toThrow(/valid: one, two/);
    const once = applyPick(boardT, parsePick("t:one"), ["one", "two"], T);
    expect(once.state).toMatchObject({ stage: "picked-t", picks: { a: "x", t: "one" } });
    expect(applyPick(once.state, parsePick("t:one"), ["one", "two"], "2026-10-31T00:00:00.000Z")).toEqual({ state: once.state, changed: false });
  });
  it("pick b refuses before a treatment is picked; a changed treatment drops the story and stack", () => {
    expect(() => applyPick({ ...base, stage: "board-b", picks: { a: "x" } }, parsePick("b:x"), ["x"], T)).toThrow(/board b/);
    const done: StateV1 = { ...base, stage: "bakeoff", picks: { a: "x", t: "one", b: "x", stack: "kernel" } };
    expect(applyPick(done, parsePick("t:two"), ["one", "two"], T).state).toMatchObject({ stage: "picked-t", picks: { a: "x", t: "two" } });
    expect(applyPick(done, parsePick("a:y"), ["x", "y"], T).state.picks).toEqual({ a: "y" });
    expect(resetTo(done, "board-t", T).picks).toEqual({ a: "x" });
    expect(resetTo(done, "board-b", T).picks).toEqual({ a: "x", t: "one" });
  });
  it("names the next verb through Board T", () => {
    const has = { directions: true, treatments: false, story: false, results: 0 };
    expect(nextVerb(pickedA, has)).toMatch(/^author music-clip\/treatments.json/);
    expect(nextVerb(pickedA, { ...has, treatments: true })).toBe("board t <dir>");
    expect(nextVerb({ ...pickedA, stage: "board-t" }, { ...has, treatments: true })).toBe("pick <dir> t:<treatment-id>");
    expect(nextVerb({ ...pickedA, stage: "picked-t", picks: { a: "x", t: "one" } }, { ...has, treatments: true, story: true })).toBe("board b <dir>");
  });
});

describe("story.treatment", () => {
  const story = { v: 1, direction: "rust-choir", treatment: "one-who-stops", sections: [{ id: "s3", title: "Hook", beat: "b", visual: "v", cutsPerBar: 2 }], hero: { sectionId: "s3", startS: 16, endS: 22 } };
  it("passes when it is the picked treatment, or absent", () => {
    expect(validateStory(story, tl, "rust-choir", "one-who-stops").ok).toBe(true);
    const { treatment: _drop, ...bare } = story;
    expect(validateStory(bare, tl, "rust-choir", "one-who-stops").ok).toBe(true);
  });
  it("refuses a story built on another treatment", () => {
    const r = validateStory(story, tl, "rust-choir", "the-counter");
    expect(r.ok ? [] : r.violations).toEqual(['treatment "one-who-stops" is not the picked treatment "the-counter"']);
  });
});
