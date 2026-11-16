// /music-clip ON SUNO'S MEASURED GRID (lib/music-clip/suno.ts): the mapping functions over a recorded
// Suno analysis (trimmed from a real one: 99.9 BPM, B minor, 4/4, twelve A/B/C parts), the polling with
// an injected clock and client, words to line spans, and analyzeTrack end to end on a click track with
// the Suno grid as a stand-in. No network: every client is a fake; the store is never opened.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Alignment, Analysis } from "@/lib/suno/api/wire";
import { analyzeTrack } from "@/lib/music-clip/analyze";
import { runAnalyze } from "@/lib/music-clip/folder";
import { fixtureTimeline } from "@/lib/music-clip/fixtures/timeline";
import type { FetchLike } from "@/lib/music-clip/gemini";
import { parseLyrics } from "@/lib/music-clip/lyricsParse";
import { buildSections, snapToDownbeat } from "@/lib/music-clip/sections";
import {
  alignLines,
  boundaryDisagreement,
  fetchSunoGrid,
  parseSunoId,
  sunoBeats,
  sunoBpm,
  sunoSections,
  sunoStarts,
  sungWords,
  tempoDisagreement,
  withSunoLetters,
  type SunoClient,
  type SunoGrid,
} from "@/lib/music-clip/suno";
import { tempoCurve } from "@/lib/music-clip/tempo";
import type { AnalyzeInput, TimelineSection } from "@/lib/music-clip/types";

const SECTIONS: [number, number, string][] = [
  [0, 19.28, "A"], [19.28, 43.08, "A"], [43.08, 57.76, "A"], [57.76, 72.12, "A"], [72.12, 96.2, "B"], [96.2, 134.68, "C"],
  [134.68, 168.28, "B"], [168.28, 173.16, "B"], [173.16, 206.92, "B"], [206.92, 211.6, "A"], [211.6, 226.12, "C"], [226.12, 234, "A"],
];

function recorded(over: Partial<Analysis> = {}): Analysis {
  const beats: { time_s: number; bar_position: number }[] = [];
  for (let i = 0, t = 0.12867; t < 234; i++, t = 0.12867 + i * 0.6005) beats.push({ time_s: t, bar_position: (i % 4) + 1 });
  return {
    audio_id: "song-1",
    status: "complete",
    bpm: 99.9,
    key: "B minor",
    time_signature: 4,
    duration_s: 234,
    beats,
    sections: SECTIONS.map(([start_s, end_s, label]) => ({ start_s, end_s, label })),
    ...over,
  };
}

const sec = (id: string, startS: number, endS: number): TimelineSection => ({ id, label: "verse", startS, endS, intensity: 0.5, cutsPerBar: 1 });

describe("suno mapping", () => {
  it("beats: bar 1 at the first bar_position 1, downbeat on every one", () => {
    const { beats, warnings } = sunoBeats(recorded());
    expect(warnings).toEqual([]);
    expect(beats?.[0]).toEqual({ t: 0.129, bar: 1, beat: 1, downbeat: true });
    expect(beats?.[3]).toMatchObject({ bar: 1, beat: 4, downbeat: false });
    expect(beats?.[4]).toMatchObject({ bar: 2, beat: 1, downbeat: true });
    expect(beats?.filter((b) => b.downbeat).length).toBe(Math.ceil((beats?.length ?? 0) / 4));
  });

  it("beats: a pickup is bar 0, as assignBars numbers it", () => {
    const a = recorded({ beats: [3, 4, 1, 2, 3, 4, 1].map((p, i) => ({ time_s: i * 0.5, bar_position: p })) });
    expect(sunoBeats(a).beats?.map((b) => [b.bar, b.beat, b.downbeat])).toEqual([[0, 3, false], [0, 4, false], [1, 1, true], [1, 2, false], [1, 3, false], [1, 4, false], [2, 1, true]]);
  });

  it("beats: another meter is a warning and clamps to 4; no downbeat at all leaves the bars to the caller", () => {
    const six = sunoBeats(recorded({ time_signature: 6, beats: [1, 2, 3, 4, 5, 6, 1].map((p, i) => ({ time_s: i, bar_position: p })) }));
    expect(six.warnings.join()).toContain("suno measures 6 beats to the bar");
    expect(six.beats?.map((b) => b.beat)).toEqual([1, 2, 3, 4, 4, 4, 1]);
    const none = sunoBeats(recorded({ beats: [{ time_s: 0 }, { time_s: 0.5 }] }));
    expect(none.beats).toBeUndefined();
    expect(none.warnings.join()).toContain("marks no downbeat");
  });

  it("tempo: suno's bpm, the curve from suno's beats; a disagreement names both figures", () => {
    const a = recorded();
    expect(sunoBpm(a)).toBe(99.9);
    const curve = tempoCurve(sunoBeats(a).beats ?? []);
    expect(curve.length).toBeGreaterThan(90);
    expect(curve.every((p) => Math.abs(p.bpm - 99.9) < 0.3)).toBe(true);
    expect(tempoDisagreement(99.9, 101.3)).toEqual(["tempo: suno measures 99.9 BPM, the local beat tracker 101.3; suno stands"]);
    expect(tempoDisagreement(99.9, 100.2)).toEqual([]);
  });

  it("sections: suno's spans open at 0 and its letters land by overlap", () => {
    const spans = sunoSections(recorded());
    expect(spans).toHaveLength(12);
    expect(sunoStarts(spans)[0]).toBe(0);
    expect(sunoStarts([{ startS: 4, endS: 10 }])).toEqual([0, 4]);
    const local = withSunoLetters([sec("s01", 0, 30), sec("s02", 30, 80), sec("s03", 80, 140), sec("s04", 140, 234)], spans);
    expect(local.map((s) => s.sunoLabel)).toEqual(["A", "A", "C", "B"]);
    expect(boundaryDisagreement([0, 19.28, 72.12], [0, 19, 80])).toEqual(["sections: suno's boundaries stand; the local pass is more than 3 s off at 72.1 s (local 80.0 s)"]);
  });

  it("sections: the builder takes suno's starts as its boundaries, snapped to the bar, tags laid over them", () => {
    const a = recorded();
    const downbeats = (sunoBeats(a).beats ?? []).filter((b) => b.downbeat).map((b) => b.t);
    const frames = 234 * 30;
    const flat = new Array<number>(frames).fill(0.5);
    const tags = ["Verse 1", "Pre-Chorus", "Chorus", "Verse 2", "Chorus", "Bridge", "Chorus", "Break", "Chorus", "Verse 3", "Outro"];
    const parsed = parseLyrics(tags.map((t) => `[${t}]\nla la`).join("\n"));
    const starts = sunoStarts(sunoSections(a));
    const pass = buildSections({ durationS: 234, bands: { low: flat, mid: flat, high: flat }, flux: flat, onsets: [], downbeats, intensity: flat, tags: parsed.tags, boundaries: starts });
    expect(pass.sections.map((s) => s.startS)).toEqual(starts.map((t) => Math.round((t === 0 ? 0 : snapToDownbeat(t, downbeats)) * 1000) / 1000));
    expect(pass.sections[pass.sections.length - 1].endS).toBe(234);
    expect(pass.sections[0].label).toBe("intro");
    expect(pass.sections.some((s) => s.lyricTag === "Bridge")).toBe(true);
  });

  it("parseSunoId: a bare id or the song link, nothing else", () => {
    expect(parseSunoId("3f1e9c2a-1111-2222-3333-444455556666\n")).toBe("3f1e9c2a-1111-2222-3333-444455556666");
    expect(parseSunoId("https://suno.com/song/3f1e9c2a-1111-2222-3333-444455556666?sh=abc")).toBe("3f1e9c2a-1111-2222-3333-444455556666");
    expect(parseSunoId("https://example.com/song/x")).toBeUndefined();
    expect(parseSunoId("")).toBeUndefined();
  });
});

describe("words to lines", () => {
  const W = (word: string, start_s: number, end_s: number, success = true) => ({ word, start_s, end_s, success });
  const al: Alignment = {
    audio_id: "song-1",
    status: "complete",
    words: [W("[Verse]", 0, 0), W("Hello,", 1, 1.4), W("world!", 1.5, 2), W("second", 3, 3.3), W("line", 3.4, 3.6, false), W("here", 3.7, 4), W("[Chorus]", 5, 5), W("Last", 9, 9.4), W("one.", 9.5, 10)],
  };
  const parsed = parseLyrics("[Verse]\nHello, World!\nSecond line here\n[Chorus]\nNot sung at all xyz\nLast one");

  it("matches in order, tolerant of case and punctuation; tags are not sung", () => {
    const words = sungWords(al);
    expect(words.map((w) => w.norm)).toEqual(["hello", "world", "second", "line", "here", "last", "one"]);
    const lines = alignLines(parsed.lines, words);
    expect(lines.get("L001")).toEqual({ startS: 1, endS: 2, confidence: "high", words: [{ text: "Hello,", startS: 1, endS: 1.4 }, { text: "world!", startS: 1.5, endS: 2 }] });
    expect(lines.get("L002")).toMatchObject({ startS: 3, endS: 4, confidence: "medium" });
    expect(lines.has("L003")).toBe(false);
    expect(lines.get("L004")).toMatchObject({ startS: 9, endS: 10, confidence: "high" });
  });
});

describe("fetchSunoGrid", () => {
  function client(analysis: Analysis[], alignment: Alignment[]): SunoClient & { calls: number } {
    const box = {
      calls: 0,
      analysis: async () => (box.calls++, { ok: true as const, value: analysis.length > 1 ? (analysis.shift() as Analysis) : (analysis[0] as Analysis) }),
      alignment: async () => (box.calls++, { ok: true as const, value: alignment.length > 1 ? (alignment.shift() as Alignment) : (alignment[0] as Alignment) }),
    };
    return box;
  }
  const clock = () => {
    const c = { t: 0, sleeps: [] as number[] };
    return { c, now: () => c.t, sleep: async (ms: number) => void (c.sleeps.push(ms), (c.t += ms)) };
  };

  it("polls every 3 s while suno is still measuring, then returns both", async () => {
    const k = clock();
    const g = await fetchSunoGrid("song-1", {
      client: client([recorded({ status: "processing" }), recorded({ status: "processing" }), recorded()], [{ audio_id: "song-1", status: "complete", words: [] }]),
      now: k.now,
      sleep: k.sleep,
    });
    expect(k.c.sleeps).toEqual([3000, 3000]);
    expect(g.analysis?.bpm).toBe(99.9);
    expect(g.alignment?.status).toBe("complete");
    expect(g.warnings).toEqual([]);
  });

  it("unavailable, a refusal and the 120 s cap are warnings, never a throw", async () => {
    const k = clock();
    const g = await fetchSunoGrid("song-1", { client: client([recorded({ status: "unavailable" })], [{ audio_id: "song-1", status: "processing" }]), now: k.now, sleep: k.sleep });
    expect(g.analysis).toBeUndefined();
    expect(g.alignment).toBeUndefined();
    expect(g.warnings[0]).toBe("suno: analysis unavailable; the local pass stands");
    expect(g.warnings[1]).toBe("suno: lyrics alignment still processing after 120 s; the local pass stands");
    expect(k.c.sleeps.length).toBe(40);
    const refused: SunoClient = {
      analysis: async () => ({ ok: false, error: { code: "unauthenticated", message: "not connected to suno" } as never }),
      alignment: async () => ({ ok: false, error: { code: "unavailable", message: "suno answered 503" } as never }),
    };
    const r = await fetchSunoGrid("song-1", { client: refused, now: k.now, sleep: k.sleep });
    expect(r.warnings).toEqual(["suno: analysis failed (not connected to suno); the local pass stands", "suno: lyrics alignment failed (suno answered 503); the local pass stands"]);
  });
});

// ---- analyzeTrack end to end on a click track (as music-clip-analyze.test.ts writes it) ----

const RATE = 22050;
const DUR = 44;
let dir = "";
let wav = "";

function writeWav(file: string): void {
  const n = DUR * RATE;
  const pcm = new Int16Array(n);
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let t = 0.25; t < DUR; t += 0.5) {
    const gain = t < DUR / 2 ? 0.25 : 0.9;
    const s = Math.round(t * RATE);
    for (let k = 0; k < 600 && s + k < n; k++) pcm[s + k] = Math.round(12000 * gain * Math.exp(-k / 90) * (Math.sin(k * 0.2) + rnd()));
  }
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + n * 2, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(n * 2, 40);
  writeFileSync(file, Buffer.concat([head, Buffer.from(pcm.buffer)]));
}

const LYRICS = "[Verse]\none\ntwo\n\n[Chorus]\nthree\nfour\n";
const STYLE = "test pulse, 120 BPM";
const never = async (): Promise<SunoGrid> => {
  throw new Error("the suno seam was called");
};
function gemini(): { fetch: FetchLike; calls: number } {
  const box: { fetch: FetchLike; calls: number } = { calls: 0, fetch: (async () => (box.calls++, { ok: false, status: 503, text: async () => "overloaded" })) as FetchLike };
  return box;
}

/** Suno's grid for the click track: clicks every 0.5 s from 0.25, a pickup of two, two parts. */
function clickGrid(): SunoGrid {
  const beats = Array.from({ length: 87 }, (_, i) => ({ time_s: 0.25 + i * 0.5, bar_position: ((i + 2) % 4) + 1 }));
  const words = [["one", 2.25], ["two", 6.25], ["three", 24.25], ["four", 28.25]].map(([w, t]) => ({ word: w as string, start_s: t as number, end_s: (t as number) + 0.6, success: true }));
  return {
    analysis: { audio_id: "click", status: "complete", bpm: 120, key: "B minor", time_signature: 4, beats, sections: [{ start_s: 0, end_s: 22, label: "A" }, { start_s: 22, end_s: 44, label: "B" }] },
    alignment: { audio_id: "click", status: "complete", words },
    warnings: [],
  };
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "music-clip-suno-"));
  wav = path.join(dir, "clicks.wav");
  writeWav(wav);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("analyzeTrack with a Suno song", () => {
  const input = (over: Partial<AnalyzeInput> = {}): AnalyzeInput => ({ audioPath: wav, lyricsText: LYRICS, styleText: STYLE, dry: true, ...over });

  it("no id: the seam is never called and the timeline is the one analyze wrote before", async () => {
    const plain = await analyzeTrack(input());
    const seamed = await analyzeTrack(input(), { sunoGrid: never });
    expect(JSON.stringify(seamed)).toBe(JSON.stringify(plain));
    expect(plain.key).toBeUndefined();
    expect(plain.warnings.some((w) => w.startsWith("suno"))).toBe(false);
    expect(plain.sections.some((s) => s.sunoLabel !== undefined)).toBe(false);
  }, 60_000);

  it("dry: no Suno call, and a warning says the grid was not fetched", async () => {
    const tl = await analyzeTrack(input({ suno: { id: "click" } }), { sunoGrid: never });
    expect(tl.warnings).toContain("suno: dry run - the Suno grid for click was not fetched; the local grid stands");
  }, 60_000);

  it("live: suno's beats, tempo, key, parts and word times; Gemini is not called", async () => {
    const g = gemini();
    let asked = "";
    const tl = await analyzeTrack(input({ dry: false, suno: { id: "click" } }), { fetch: g.fetch, sunoGrid: async (id) => ((asked = id), clickGrid()) });
    expect(asked).toBe("click");
    expect(g.calls).toBe(0);
    expect(tl.key).toBe("B minor");
    expect(tl.tempo.bpmGlobal).toBe(120);
    expect(tl.beats).toHaveLength(87);
    expect(tl.beats.slice(0, 3)).toEqual([{ t: 0.25, bar: 0, beat: 3, downbeat: false }, { t: 0.75, bar: 0, beat: 4, downbeat: false }, { t: 1.25, bar: 1, beat: 1, downbeat: true }]);
    expect(tl.sections.map((s) => s.sunoLabel)).toEqual(["A", "B"]);
    expect(tl.sections[1].startS).toBe(snapToDownbeat(22, tl.beats.filter((b) => b.downbeat).map((b) => b.t)));
    expect(tl.lyrics.map((l) => [l.source, l.startS, l.endS, l.confidence])).toEqual([
      ["suno-align", 2.25, 2.85, "high"],
      ["suno-align", 6.25, 6.85, "high"],
      ["suno-align", 24.25, 24.85, "high"],
      ["suno-align", 28.25, 28.85, "high"],
    ]);
    expect(tl.lyrics[0].words).toEqual([{ text: "one", startS: 2.25, endS: 2.85 }]);
    expect(JSON.parse(JSON.stringify(tl))).toEqual(tl);
  }, 60_000);

  it("unavailable analysis: the local grid stands, the warning is carried", async () => {
    const plain = await analyzeTrack(input());
    const tl = await analyzeTrack(input({ dry: false, suno: { id: "click" } }), { fetch: gemini().fetch, apiKey: "k", sunoGrid: async () => ({ warnings: ["suno: analysis unavailable; the local pass stands"] }) });
    expect(tl.beats).toEqual(plain.beats);
    expect(tl.tempo).toEqual(plain.tempo);
    expect(tl.key).toBeUndefined();
    expect(tl.warnings).toContain("suno: analysis unavailable; the local pass stands");
  }, 60_000);
});

describe("runAnalyze names the song", () => {
  function folder(suno?: string): string {
    const d = mkdtempSync(path.join(dir, "folder-"));
    writeFileSync(path.join(d, "track.mp3"), "not audio");
    writeFileSync(path.join(d, "lyrics.txt"), LYRICS);
    writeFileSync(path.join(d, "style.txt"), STYLE);
    if (suno !== undefined) writeFileSync(path.join(d, "suno.txt"), suno);
    return d;
  }
  const capture = () => {
    const seen: AnalyzeInput[] = [];
    return { seen, analyser: async (i: AnalyzeInput) => (seen.push(i), fixtureTimeline()) };
  };

  it("suno.txt names it; --suno wins; --dry passes it on for analyze to leave unfetched", async () => {
    const c = capture();
    await runAnalyze(folder("https://suno.com/song/abcdef12-0000"), { dry: true }, c.analyser);
    await runAnalyze(folder("abcdef12-0000"), { dry: true, suno: "ffffffff-9999" }, c.analyser);
    await runAnalyze(folder(), { dry: true }, c.analyser);
    expect(c.seen.map((i) => i.suno)).toEqual([{ id: "abcdef12-0000" }, { id: "ffffffff-9999" }, undefined]);
  });

  it("an unreadable suno.txt or --suno is refused; the plan says the Suno calls are free", async () => {
    const c = capture();
    await expect(runAnalyze(folder("not a song"), { dry: true }, c.analyser)).rejects.toThrow(/neither a Suno song id/);
    await expect(runAnalyze(folder(), { dry: true, suno: "x" }, c.analyser)).rejects.toThrow(/--suno needs/);
    const out = await runAnalyze(folder("abcdef12-0000"), {}, c.analyser);
    expect(out.status).toBe("refused");
    expect(out.status === "refused" && out.plan.join("\n")).toContain("suno   abcdef12-0000 (suno.txt): analysis + lyrics alignment, free");
    expect(c.seen).toHaveLength(0);
  });
});
