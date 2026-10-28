// The stage variant's arithmetic (spark audio-agent-studio WP4): where each part stands, which wing a
// waiting player uses, who plays in a section, which section a second falls in, how bright a halo is,
// and the plain words for a level and a pan. Pure, so the numbers are held without a browser.
import { describe, expect, test } from "vitest";

import { arrange, haloLevel, levelWords, panWords, playingPer, playsIn, ROLE_PLACE, sectionAt, wingOf } from "../../src/components/studio-stage/stage.ts";

describe("the arc: where each part stands", () => {
  test("drums at the back, bass on the left flank, chords on the right, tunes in front", () => {
    const rows = [
      { id: "lead", role: "lead" as const },
      { id: "drums", role: "drums" as const },
      { id: "bass", role: "bass" as const },
      { id: "chords", role: "chords" as const },
      { id: "perc", role: "percussion" as const },
      { id: "fx", role: "texture" as const },
      { id: "pad", role: "pad" as const },
    ];
    const at = arrange(rows);
    expect(at.back.map((r) => r.id)).toEqual(["drums", "perc"]);
    expect(at.left.map((r) => r.id)).toEqual(["bass"]);
    expect(at.right.map((r) => r.id)).toEqual(["chords", "pad"]);
    expect(at.front.map((r) => r.id)).toEqual(["lead", "fx"]);
  });
  test("every role has a place, and a waiting bass stands in the left wing, the rest on the right", () => {
    expect(Object.keys(ROLE_PLACE).sort()).toEqual(["bass", "chords", "drums", "lead", "pad", "percussion", "texture"]);
    expect(wingOf("bass")).toBe("left");
    expect([wingOf("chords"), wingOf("drums"), wingOf("lead")]).toEqual(["right", "right", "right"]);
  });
});

describe("sections: who plays where, and where the playhead is", () => {
  test("omitted entries play everywhere; a false entry rests", () => {
    expect(playsIn(undefined, 3)).toBe(true);
    expect(playsIn([false, true], 0)).toBe(false);
    expect(playsIn([false, true], 1)).toBe(true);
  });
  test("players counted per section", () => {
    expect(playingPer([{ enters: [false, true, true, false] }, {}, { enters: [true, false, true, true] }], 4)).toEqual([2, 2, 3, 2]);
  });
  test("a second falls in the span that holds it, the end belongs to the next", () => {
    const spans = [
      { startS: 0, endS: 4 },
      { startS: 4, endS: 12 },
    ];
    expect([sectionAt(spans, 0), sectionAt(spans, 3.99), sectionAt(spans, 4), sectionAt(spans, 12), sectionAt(null, 1)]).toEqual([0, 0, 1, null, null]);
  });
});

describe("the halo: loudness at the playhead, times what the part may play at", () => {
  const peaks = [0.25, 1, 0.5, 0];
  test("reads the peak under the playhead, on a square-root curve", () => {
    expect(haloLevel(peaks, 0, 8, 1)).toBe(0.5);
    expect(haloLevel(peaks, 4, 8, 1)).toBe(0.71);
    expect(haloLevel(peaks, 2.5, 8, 1)).toBe(1);
    expect(haloLevel(peaks, 8, 8, 1)).toBe(0);
  });
  test("a quieter part glows less; a silenced one, or one not decoded, not at all", () => {
    expect(haloLevel(peaks, 2.5, 8, 0.5)).toBe(0.5);
    expect(haloLevel(peaks, 2.5, 8, 0)).toBe(0);
    expect(haloLevel(null, 2.5, 8, 1)).toBe(0);
    expect(haloLevel(peaks, 2.5, null, 1)).toBe(0);
  });
  test("a boosted part never glows past full", () => {
    expect(haloLevel(peaks, 2.5, 8, 2)).toBe(1);
  });
});

describe("words for a level and a pan", () => {
  test("level", () => {
    expect([levelWords(0), levelWords(-6), levelWords(2), levelWords(0.3)]).toEqual(["as recorded", "quieter (-6 dB)", "louder (+2 dB)", "as recorded"]);
  });
  test("pan", () => {
    expect([panWords(0), panWords(-0.3), panWords(0.6), panWords(1)]).toEqual(["centre", "a little left", "right", "far right"]);
  });
});
