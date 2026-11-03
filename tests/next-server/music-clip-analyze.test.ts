// /music-clip analyzeTrack END TO END on this box's ffmpeg: a click track written
// here as a WAV (120 BPM, quiet half then loud half), a two-tag lyrics sheet, and
// the vendor as a stand-in. Dry spends nothing (the stand-in is never called);
// a live-shaped answer lands as gemini+snap; a refusal is a warning and the
// section-only floor, never a failed analysis. The store is never opened.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { analyzeTrack } from "@/lib/music-clip/analyze";
import type { FetchLike } from "@/lib/music-clip/gemini";
import type { TimelineV1 } from "@/lib/music-clip/types";

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

function standIn(answer: unknown, status = 200): { fetch: FetchLike; calls: number } {
  const box = {
    calls: 0,
    fetch: (async () => {
      box.calls++;
      const text = status === 200 ? JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }) : "overloaded";
      return { ok: status === 200, status, text: async () => text };
    }) as FetchLike,
  };
  return box;
}

function checkShape(tl: TimelineV1): void {
  const frames = Math.round(tl.track.durationS * 30);
  expect(tl.v).toBe(1);
  expect(tl.fps).toBe(30);
  expect(tl.tempo.bpmPrior).toBe(120);
  expect(Math.abs(tl.tempo.bpmGlobal - 120)).toBeLessThan(1);
  for (const k of ["low", "mid", "high", "rms"] as const) {
    expect(Math.abs(tl.bands[k].length - frames)).toBeLessThanOrEqual(1);
    expect(tl.bands[k].every((v) => v >= 0 && v <= 1)).toBe(true);
  }
  expect(tl.intensity.length).toBe(tl.bands.low.length);
  expect(tl.beats.every((b, i) => i === 0 || b.t > tl.beats[i - 1].t)).toBe(true);
  expect(tl.sections[0].startS).toBe(0);
  expect(tl.sections[tl.sections.length - 1].endS).toBe(tl.track.durationS);
  tl.sections.forEach((s, i) => i > 0 && expect(s.startS).toBe(tl.sections[i - 1].endS));
  expect(tl.lyrics.map((l) => l.text)).toEqual(["one", "two", "three", "four"]);
  expect(tl.voice[0].startS).toBe(0);
  expect(tl.voice[tl.voice.length - 1].endS).toBe(tl.track.durationS);
  expect(JSON.parse(JSON.stringify(tl))).toEqual(tl);
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "music-clip-analyze-"));
  wav = path.join(dir, "clicks.wav");
  writeWav(wav);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("analyzeTrack", () => {
  it("dry: no vendor call, a valid timeline, every line section-only", async () => {
    const s = standIn({});
    const tl = await analyzeTrack({ audioPath: wav, lyricsText: LYRICS, styleText: STYLE, dry: true }, { fetch: s.fetch, apiKey: "k" });
    expect(s.calls).toBe(0);
    checkShape(tl);
    expect(tl.track).toMatchObject({ file: "clicks.wav", durationS: DUR, sampleRate: RATE });
    expect(tl.track.sha1).toMatch(/^[0-9a-f]{40}$/);
    expect(tl.lyrics.every((l) => l.confidence === "section-only" && l.source === "section")).toBe(true);
    expect(tl.warnings.some((w) => w.startsWith("lyrics: dry run"))).toBe(true);
  }, 60_000);

  it("live-shaped: one call, times snapped to the clicks", async () => {
    const s = standIn({ lines: [{ id: "L001", startS: 2.3, endS: 3 }, { id: "L002", startS: 6.2, endS: 7 }, { id: "L003", startS: 24.3, endS: 25 }, { id: "L004", startS: 28.21, endS: 29 }], sections: [] });
    const tl = await analyzeTrack({ audioPath: wav, lyricsText: LYRICS, styleText: STYLE, dry: false }, { fetch: s.fetch, apiKey: "k" });
    expect(s.calls).toBe(1);
    checkShape(tl);
    expect(tl.lyrics.every((l) => l.source === "gemini+snap")).toBe(true);
    // Each start lands on the click it was nearest (clicks at 0.25 + k/2).
    expect(tl.lyrics.map((l) => Math.round(l.startS * 100) / 100)).toEqual([2.25, 6.25, 24.25, 28.25]);
  }, 60_000);

  it("a refused call is a warning and the section-only floor, not a failure", async () => {
    const s = standIn(null, 503);
    const tl = await analyzeTrack({ audioPath: wav, lyricsText: LYRICS, styleText: STYLE, dry: false }, { fetch: s.fetch, apiKey: "k" });
    checkShape(tl);
    expect(tl.lyrics.every((l) => l.confidence === "section-only")).toBe(true);
    expect(tl.warnings.some((w) => w.includes("the Gemini call failed") && w.includes("503"))).toBe(true);
  }, 60_000);
});
