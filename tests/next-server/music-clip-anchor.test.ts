import { describe, expect, it } from "vitest";

import { reanchorSections } from "@/lib/music-clip/anchor";
import type { SectionPassResult } from "@/lib/music-clip/sections";
import type { LyricTag } from "@/lib/music-clip/lyricsParse";
import type { TimelineSection } from "@/lib/music-clip/types";

// The shape measured on Break the Sequence: a cold pulse and an instrumental
// build before Verse 1, Verse 1 + Pre-Chorus 1 heard as one section, and
// model times that drift late after ~95 s.
const BOUNDS = [0, 15.2, 45.8, 70.7, 95.7, 112.9, 137.9, 164.8, 186, 207.1, 224.4];
const DUR = 250;
const sec = (i: number): TimelineSection => ({ id: `s${i + 1}`, label: "verse", startS: BOUNDS[i], endS: BOUNDS[i + 1] ?? DUR, intensity: 0.5, cutsPerBar: 1 });
const pass: SectionPassResult = { sections: BOUNDS.map((_, i) => sec(i)), tagSections: [], warnings: [] };
const names: [string, LyricTag["label"]][] = [["Verse 1", "verse"], ["Pre-Chorus", "prechorus"], ["Chorus", "chorus"], ["Verse 2", "verse"], ["Pre-Chorus", "prechorus"], ["Chorus", "chorus"], ["Bridge", "bridge"], ["Final Chorus", "chorus"], ["Outro", "outro"]];
const tags: LyricTag[] = names.map(([tag, label]) => ({ tag, label, lineIds: [] }));
// 0.5 s per frame of intensity is enough here: rising through the track.
const intensity = Array.from({ length: DUR * 30 }, (_, f) => Math.min(1, f / (DUR * 30)));
const downbeats = Array.from({ length: 130 }, (_, i) => 1.873 + i * 1.911);

describe("reanchorSections", () => {
  it("moves Verse 1 to the first sung line, makes the build intro, splits Pre-Chorus 1, ignores drifted times", () => {
    const first = [46.0, 61.6, 70.3, 152.1, 168.0, 177.1, undefined, 218.4, undefined];
    const out = reanchorSections({ pass, tags, firstLineS: first, downbeats, intensity, durationS: DUR })!;
    const s = out.result.sections;
    expect(s.slice(0, 2).map((x) => x.label)).toEqual(["intro", "intro"]);
    const v1 = s.find((x) => x.lyricTag === "Verse 1")!;
    expect(v1.startS).toBe(45.8);
    const pre = s.find((x) => x.lyricTag === "Pre-Chorus")!;
    expect(Math.abs(pre.startS - 61.6)).toBeLessThan(1.6);
    expect(s.find((x) => x.lyricTag === "Chorus")!.startS).toBe(70.7);
    // the drifted second half keeps our energy boundaries
    for (const b of [95.7, 112.9, 137.9, 164.8]) expect(s.some((x) => x.startS === b)).toBe(true);
    expect(s.every((x, i) => i === 0 || x.startS === s[i - 1].endS)).toBe(true);
  });

  it("changes nothing when no line time agrees with a boundary", () => {
    expect(reanchorSections({ pass, tags, firstLineS: tags.map(() => 30), downbeats, intensity, durationS: DUR })).toBeUndefined();
  });
});
