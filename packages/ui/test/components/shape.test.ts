// The shape compiler (shape.ts): columns from a length, sections from painted levels, the Suno
// tag block and the ElevenLabs plan - both emitters held to their vendors' bounds.
import { describe, expect, test } from "vitest";

import { BLANK_SEED } from "../../src/components/audio/recipe.ts";
import { clock, columnsFor, groupSeconds, planSeconds, presetForWords, PRESETS, sectionsOf, sectionsToPlan, sunoLyricsOf, voicesAt, type Level } from "../../src/components/audio/shape.ts";

describe("columns: whole four-bar groups at the seed's tempo", () => {
  test("a four-bar group at 120 bpm is eight seconds", () => {
    expect(groupSeconds(120)).toBe(8);
  });
  test("90 seconds at 120 bpm is eleven groups; never fewer than two", () => {
    expect(columnsFor(90, 120)).toBe(11);
    expect(columnsFor(5, 120)).toBe(2);
    expect(columnsFor(10_000, 120)).toBe(32);
  });
});

describe("sections: runs of one level, named by where they sit", () => {
  const arc: Level[] = [0, 0, 2, 2, 3, 3, 3, 0];
  const secs = sectionsOf(arc, 120);
  test("intro, build, peak, outro - with bars and seconds", () => {
    expect(secs.map((s) => s.name)).toEqual(["Intro", "Build", "Peak", "Outro"]);
    expect(secs.map((s) => s.bars)).toEqual([8, 8, 12, 4]);
    expect(secs[2]?.startS).toBe(32);
    expect(secs.at(-1)?.endS).toBe(64);
  });
  test("a second peak is numbered", () => {
    expect(sectionsOf([0, 3, 1, 3, 0], 120).map((s) => s.label)).toEqual(["Intro", "Peak", "Break", "Peak 2", "Outro"]);
  });
  test("one flat level is one theme", () => {
    expect(sectionsOf([1, 1, 1, 1], 100).map((s) => s.name)).toEqual(["Theme"]);
  });
  test("the boundaries land on whole bars, so barsFit holds for every section", () => {
    for (const s of sectionsOf(arc, 97)) {
      const bars = (s.endS - s.startS) / (240 / 97);
      expect(Math.abs(bars - Math.round(bars))).toBeLessThan(1e-9);
    }
  });
});

describe("the two emitters", () => {
  const secs = sectionsOf([0, 0, 2, 3, 3, 0], 90);
  test("suno: an instrumental with one tag per section and an end", () => {
    const l = sunoLyricsOf(secs);
    expect(l.split("\n")[0]).toBe("[Instrumental]");
    expect(l).toContain("[Intro: quiet, 8 bars]");
    expect(l).toContain("[Chorus: full, 8 bars]");
    expect(l.endsWith("[End]")).toBe(true);
    expect(l.length).toBeLessThanOrEqual(6000);
    expect(sunoLyricsOf([])).toBe("[Instrumental]");
  });
  test("elevenlabs: sections within 3-120 s, the sum the drawn length, the voices thickening", () => {
    const seed = { ...BLANK_SEED, genres: ["lo-fi jazz"], moods: ["cozy"], instruments: ["rhodes", "upright bass", "brushed drums"], bpm: 90, avoid: ["vocals"] };
    const plan = sectionsToPlan(seed, secs);
    for (const s of plan.sections) {
      expect(s.durationMs).toBeGreaterThanOrEqual(3000);
      expect(s.durationMs).toBeLessThanOrEqual(120_000);
    }
    expect(planSeconds(plan)).toBeCloseTo(secs.at(-1)?.endS ?? 0, 2);
    expect(plan.positiveGlobalStyles).toEqual(["lo-fi jazz", "cozy", "90 bpm"]);
    expect(plan.negativeGlobalStyles).toEqual(["vocals"]);
    expect(plan.sections[0]?.positiveStyles).toContain("rhodes");
    expect(plan.sections[0]?.positiveStyles).not.toContain("brushed drums");
    expect(plan.sections.find((s) => s.name === "Peak")?.positiveStyles).toContain("brushed drums");
  });
  test("a section past 120 s is split, never refused", () => {
    const long = sectionsOf(Array.from({ length: 30 }, () => 1 as Level), 60);
    const plan = sectionsToPlan(BLANK_SEED, long);
    expect(plan.sections.length).toBeGreaterThan(1);
    for (const s of plan.sections) expect(s.durationMs).toBeLessThanOrEqual(120_000);
  });
  test("voices: the quietest level carries one, the fullest all", () => {
    expect(voicesAt(0, ["a", "b", "c", "d"])).toEqual(["a"]);
    expect(voicesAt(3, ["a", "b", "c", "d"])).toEqual(["a", "b", "c", "d"]);
    expect(voicesAt(2, [])).toEqual([]);
  });
});

describe("presets and words", () => {
  test("every preset fills every column with a level", () => {
    for (const p of PRESETS) for (const n of [2, 7, 12]) expect(p.levels(n)).toHaveLength(n);
  });
  test("a sentence's words name a preset", () => {
    expect(presetForWords(["trailer"])?.id).toBe("rise");
    expect(presetForWords(["background", "study"])?.id).toBe("bed");
    expect(presetForWords(["sad", "piano"])).toBeUndefined();
  });
  test("clock", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(75)).toBe("1:15");
  });
});
