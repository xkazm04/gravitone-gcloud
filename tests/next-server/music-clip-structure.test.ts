// /music-clip structure.ts on hand-made timelines (the fixtures/timeline.ts style: every value a
// closed-form function of the bar or beat, so each case names the exact point it expects). The
// shapes come from the two songs the rules were measured on (registry row
// shift-apply-gravitone-music-structure): Break the Sequence's 207.076 -> 212.834 section move, its
// bass return at 184.039 and both songs' last hit and decay.

import { describe, expect, it } from "vitest";

import { fixtureTimeline } from "@/lib/music-clip/fixtures/timeline";
import { buildStructure, chooseWindow, type StructureInput } from "@/lib/music-clip/structure";
import { CLIP_FPS, type TimelineLyric, type TimelineSection, type TimelineV1, type TimelineVoice } from "@/lib/music-clip/types";

const BEAT = 0.5;
const BAR = 4 * BEAT;

interface Shape {
  bars: number;
  /** Intensity of bar k (0-based). */
  energy?: (k: number) => number;
  /** Low band of beat i (0-based, beat 1 of bar k is i = 4k). */
  low?: (i: number) => number;
  /** rms at t; 0.5 throughout by default. */
  rms?: (t: number) => number;
  lyrics?: [number, number][];
  sections?: Partial<TimelineSection>[];
  /** Extra seconds after the last bar (silence unless rms says otherwise). */
  tailS?: number;
}

function timeline(sh: Shape): StructureInput {
  const durationS = sh.bars * BAR + (sh.tailS ?? 0);
  const frames = Math.round(durationS * CLIP_FPS);
  const beats = Array.from({ length: sh.bars * 4 }, (_, i) => ({ t: i * BEAT, bar: Math.floor(i / 4) + 1, beat: ((i % 4) + 1) as 1 | 2 | 3 | 4, downbeat: i % 4 === 0 }));
  const at = (f: number) => f / CLIP_FPS;
  const barOf = (t: number) => Math.min(sh.bars - 1, Math.floor(t / BAR));
  const lyrics: TimelineLyric[] = (sh.lyrics ?? []).map(([a, b], i) => ({ id: `L${i + 1}`, section: "s1", text: `line ${i + 1}`, startS: a, endS: b, confidence: "high", source: "gemini+snap" }));
  const voice: TimelineVoice[] = [];
  let cur = 0;
  for (const l of lyrics) {
    if (l.startS > cur) voice.push({ startS: cur, endS: l.startS, kind: "none", confirmed: false });
    voice.push({ startS: l.startS, endS: l.endS, kind: "sung", confirmed: false });
    cur = l.endS;
  }
  if (cur < durationS) voice.push({ startS: cur, endS: durationS, kind: "none", confirmed: false });
  const sections: TimelineSection[] = (sh.sections ?? [{}]).map((s, i, all) => ({ id: `s${i + 1}`, label: "verse", startS: 0, endS: durationS, intensity: 0.5, cutsPerBar: 0.5, ...s, ...(all[i + 1] ? { endS: all[i + 1].startS as number } : {}) }));
  const idx = Array.from({ length: frames }, (_, f) => f);
  return {
    track: { file: "t.mp3", sha1: "0".repeat(40), durationS, sampleRate: 48000 },
    beats,
    bands: {
      low: idx.map((f) => (at(f) < sh.bars * BAR ? (sh.low ?? (() => 0.5))(Math.floor(at(f) / BEAT)) : 0)),
      mid: idx.map(() => 0.3),
      high: idx.map(() => 0.3),
      rms: idx.map((f) => (sh.rms ?? ((t: number) => (t < sh.bars * BAR ? 0.5 : 0)))(at(f))),
    },
    intensity: idx.map((f) => (sh.energy ?? (() => 0.6))(barOf(at(f)))),
    sections,
    lyrics,
    voice,
  };
}

/** Two-bar lines filling 8-bar phrases, each phrase's lines back to back, a breath only at the phrase end. */
const eightBarLines = (phrases: number): [number, number][] =>
  Array.from({ length: phrases }, (_, p) => [
    [p * 8 * BAR + 0.1, p * 8 * BAR + 4 * BAR],
    [p * 8 * BAR + 4 * BAR, p * 8 * BAR + 8 * BAR - 1.2],
  ] as [number, number][]).flat();

describe("buildStructure: phrases", () => {
  it("puts a boundary every 8 bars when the voice breathes only there, none inside", () => {
    const st = buildStructure(timeline({ bars: 32, lyrics: eightBarLines(4) }));
    expect(st.phrases.map((p) => p.startS)).toEqual([0, 16, 32, 48]);
    expect(st.phrases.every((p) => p.bars === 8)).toBe(true);
  });

  it("never puts an exit where a lyric line runs more than a beat across the downbeat", () => {
    // A line from bar 3 beat 3 to bar 5 beat 2 crosses the bar-4 and bar-5 downbeats; the gap before it is a cue at bar 3.
    const st = buildStructure(timeline({ bars: 12, lyrics: [[0.2, 3], [5, 8.6], [12.2, 20]] }));
    const exits = st.points.filter((p) => p.kind !== "entry").map((p) => p.t);
    expect(exits).not.toContain(6);
    for (const t of exits) expect(st.lyrics.some((l) => l.startS < t - BEAT && l.endS > t + BEAT)).toBe(false);
  });

  it("splits a span past 16 bars on the 8-bar prior and says so, with a warning when there are no lyrics", () => {
    const st = buildStructure(timeline({ bars: 24, energy: () => 0.6 }));
    expect(st.warnings.some((w) => w.startsWith("structure: no timed lyric lines"))).toBe(true);
    expect(st.phrases.map((p) => [p.startS, p.bars])).toEqual([[0, 8], [16, 16]]);
    expect(st.phrases[1].why[0]).toBe("prior");
  });

  it("takes phrases from energy steps without lyrics", () => {
    const st = buildStructure(timeline({ bars: 16, energy: (k) => (k < 8 ? 0.2 : 0.8) }));
    expect(st.phrases.map((p) => p.startS)).toEqual([0, 16]);
    expect(st.phrases[1].why).toContain("energy up");
  });
});

describe("buildStructure: bar states", () => {
  it("reads flat low as calm, a ramp as building, a step down as dropping, and above 0.55 as active", () => {
    const flat = buildStructure(timeline({ bars: 6, energy: () => 0.2 }));
    expect(flat.bars.every((b) => b.state === "calm")).toBe(true);
    const ramp = buildStructure(timeline({ bars: 8, energy: (k) => 0.1 + 0.1 * k }));
    expect(ramp.bars.map((b) => b.state)).toEqual(["calm", "building", "building", "building", "building", "active", "active", "active"]);
    const step = buildStructure(timeline({ bars: 8, energy: (k) => (k < 4 ? 0.8 : 0.2) }));
    expect(step.bars.map((b) => b.state)).toEqual(["active", "active", "active", "dropping", "calm", "calm", "calm", "calm"]);
  });
});

describe("buildStructure: the low band and the stop", () => {
  it("reads a bass return after an absent bar as a lowIn entry", () => {
    // Bass everywhere but bar 8 (beats 28-31); it comes back on bar 9's downbeat, an 8-bar phrase line
    // (the shape of bar 96, 184.039). The bar it leaves is a boundary candidate too; the prior picks the return.
    const st = buildStructure(timeline({ bars: 16, low: (i) => (i >= 28 && i < 32 ? 0.05 : 0.6), energy: (k) => (k === 7 ? 0.3 : 0.7) }));
    expect(st.bars[8].lowIn).toBe(16);
    expect(st.bars[7].lowOut).toBe(14);
    const p = st.points.find((x) => x.t === 16);
    expect(p?.kind).toBe("both");
    expect(p?.why).toContain("bass in");
  });

  it("finds the stop at the last hit before the decay to silence, with its decay end", () => {
    // Steady at 0.5, one last hit on bar 8 beat 4 (15.5 s, the shape of 199.783 and 248.825), a 0.6 s decay, silence.
    const rms = (t: number) => (t < 15.5 ? 0.5 : t < 16.1 ? 0.9 * (1 - (t - 15.5) / 0.6) : 0);
    const st = buildStructure(timeline({ bars: 8, rms, tailS: 2 }));
    const stop = st.points.find((p) => p.kind === "stop");
    expect(stop?.t).toBe(15.5);
    expect(stop?.decayEndS).toBeGreaterThan(15.9);
    expect(stop?.decayEndS).toBeLessThan(16.1);
  });

  it("has no stop when the track plays to its last frame, and says so", () => {
    const st = buildStructure(timeline({ bars: 8, rms: () => 0.5 }));
    expect(st.points.some((p) => p.kind === "stop")).toBe(false);
    expect(st.warnings.some((w) => w.startsWith("structure: no stop"))).toBe(true);
  });
});

describe("buildStructure: sections", () => {
  it("moves a section start inside a sung line to the line's phrase end, and merges same-tag neighbours", () => {
    // s2 starts at bar 4 (6 s) inside a line sung 3.2-9.6 s; the breath after it puts a boundary at bar 6 (10 s)
    // (207.076 -> 212.834). s3 and s4 are both [Chorus] (s11/s12).
    const st = buildStructure(
      timeline({
        bars: 20,
        lyrics: [[0.1, 3], [3.2, 9.6], [10.1, 15.5], [16.1, 23.5], [24.1, 31.5], [32.1, 39.5]],
        sections: [{ startS: 0, lyricTag: "Verse" }, { startS: 6, lyricTag: "Pre" }, { startS: 16, lyricTag: "Chorus" }, { startS: 24, lyricTag: "Chorus" }],
      }),
    );
    expect(st.sections.map((s) => [s.id, s.startS])).toEqual([["s1", 0], ["s2", 10], ["s3", 16]]);
    expect(st.sections[2].endS).toBe(40);
    expect(st.warnings).toContain("sections: s4 at 24 s merged into s3 (both [Chorus])");
    expect(st.warnings.some((w) => w.startsWith("sections: s2 moved 6 -> 10 s"))).toBe(true);
  });

  it("keeps a section start whose line began within two beats before it - the part's pickup (137.942, L023)", () => {
    const st = buildStructure(timeline({ bars: 12, lyrics: [[0.1, 5], [7.3, 10.5], [12.1, 20]], sections: [{ startS: 0, lyricTag: "Verse" }, { startS: 8, lyricTag: "Chorus" }] }));
    expect(st.sections.map((s) => s.startS)).toEqual([0, 8]);
  });

  it("re-homes a merged-away section's lines to the survivor", () => {
    const tl = timeline({ bars: 8, sections: [{ startS: 0, lyricTag: "Chorus" }, { startS: 8, lyricTag: "Chorus" }], lyrics: [[0.1, 3], [8.1, 11]] });
    tl.lyrics[1].section = "s2";
    expect(buildStructure(tl).lyrics.map((l) => l.section)).toEqual(["s1", "s1"]);
  });
});

describe("buildStructure: the downbeat phase", () => {
  const shifted = (onBeat: number) => (i: number) => {
    // The bass leaves and returns every other bar, switching on `onBeat` (1..4) of the bar.
    const k = Math.floor((i - (onBeat - 1)) / 4);
    return k % 2 === 0 ? 0.6 : 0.05;
  };

  it("warns, naming beat 4, when the structural changes land on beat 4", () => {
    const st = buildStructure(timeline({ bars: 16, low: shifted(4) }));
    expect(st.warnings.some((w) => /^beats: \d+ of \d+ structural changes land on beat 4; the downbeat may be beat 4$/.test(w))).toBe(true);
  });

  it("does not warn when they land on beat 1", () => {
    const st = buildStructure(timeline({ bars: 16, low: shifted(1) }));
    expect(st.warnings.some((w) => w.startsWith("beats:"))).toBe(false);
  });
});

describe("chooseWindow", () => {
  // Calm intro (bars 1-4), an active body with an 8-bar sung phrase structure, a stop at the end.
  const song = () =>
    buildStructure(
      timeline({
        bars: 36,
        energy: (k) => (k < 4 ? 0.2 : 0.7),
        lyrics: eightBarLines(4).map(([a, b]) => [a + 8, b + 8] as [number, number]),
        rms: (t) => (t < 71.5 ? 0.5 : t < 72 ? 0.9 * (1 - (t - 71.5) / 0.5) : 0),
        tailS: 2,
      }),
    );

  it("starts on a calm entry and ends on an exit", () => {
    const st = song();
    const w = chooseWindow(st, { targetS: 24, minS: 20, maxS: 30 });
    if ("refused" in w) throw new Error(w.why.join("; "));
    expect(w.pieces).toHaveLength(1);
    const start = st.points.find((p) => p.t === w.pieces[0].fromS);
    expect(start?.stateAfter).toBe("calm");
    expect(st.points.some((p) => p.t === w.pieces[0].toS && p.kind !== "entry")).toBe(true);
  });

  it("joins only an exit to an entry whose state matches what is heard before the join", () => {
    // 39.5 s two ways, both ending on the stop: 0-8 (calm before 8) + 40-71.5 (active), which the state rule
    // refuses, and 0-24 (active before 24) + 56-71.5 (active). No single piece is that long.
    const st = song();
    const w = chooseWindow(st, { targetS: 39.5, minS: 38, maxS: 41, join: true });
    if ("refused" in w) throw new Error(w.why.join("; "));
    expect(w.pieces).toEqual([
      { fromS: 0, toS: 24 },
      { fromS: 56, toS: 71.5 },
    ]);
    const out = st.points.find((p) => p.t === 24);
    const inn = st.points.find((p) => p.t === 56);
    expect(inn?.stateAfter).toBe(out?.stateBefore);
  });

  it("refuses when no exit lies in range", () => {
    const w = chooseWindow(song(), { targetS: 300, minS: 290, maxS: 310 });
    expect("refused" in w && w.refused).toBe(true);
  });
});

describe("timeline compatibility", () => {
  it("leaves an old timeline without bars, phrases or points a valid TimelineV1", () => {
    const old: TimelineV1 = fixtureTimeline();
    expect(old.bars).toBeUndefined();
    const st = buildStructure(old);
    expect(st.bars.length).toBeGreaterThan(0);
    expect(st.sections.map((s) => s.id)).toEqual(old.sections.map((s) => s.id));
  });
});
