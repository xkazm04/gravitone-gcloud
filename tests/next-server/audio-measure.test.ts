// AUDIO MEASURED AT INGEST (Phase 6, L60): the pure core over synthetic signals whose answer is
// known (a 440 Hz tone is in A, a click every half second is 120 BPM, silence has neither), then
// the pass on this box's ffmpeg - a WAV made here, put in a temp blob store, pointed at by a music
// item, probed, measured, and read back through the Library detail. A decoder that refuses is a
// row with its words, never a retry loop. Nothing in the real stores is touched.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { err } from "@gt/domain/errors";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { libraryDetail } from "@gt/kernel/library/detail";
import { measuresMissing } from "@gt/kernel/library/measures";
import { upsertItems } from "@gt/kernel/library/write";
import { probeMissing } from "@gt/producers/media-facts/run";

import { ffmpegProbe } from "../../lib/producers/media-facts.ts";
import { keyOf, MEASURE_RATE, measureSignal, peaksOf, samplesOf, tempoOf } from "../../lib/sound/measure.ts";
import { ffmpegDecode, measureMissing } from "../../lib/sound/measureRun.ts";

const R = MEASURE_RATE;
const tone = (hz: number, s: number, amp = 0.5): Float32Array => Float32Array.from({ length: Math.floor(R * s) }, (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / R));
function clicks(bpm: number, s: number): Float32Array {
  const x = new Float32Array(Math.floor(R * s));
  const every = Math.round((60 / bpm) * R);
  for (let i = 0; i < x.length; i += every) for (let j = 0; j < 200 && i + j < x.length; j++) x[i + j] = 0.9 * Math.exp(-j / 40) * Math.sin(j / 3);
  return x;
}

describe("the measure, on signals whose answer is known", () => {
  it("a 440 Hz tone is in A; a click every half second is 120 BPM; 0.6 s is 100", () => {
    expect(keyOf(tone(440, 20), R)?.startsWith("A ")).toBe(true);
    expect(tempoOf(clicks(120, 30), R)).toBe(120);
    expect(Math.abs((tempoOf(clicks(100, 30), R) ?? 0) - 100)).toBeLessThanOrEqual(1);
  });
  it("silence has no tempo and no key, and draws a flat line", () => {
    const m = measureSignal(new Float32Array(R * 10), R, true);
    expect(m).toMatchObject({ tempoBpm: null, key: null, energy: 0, durationS: 10 });
    expect(m.peaks.every((p) => p === 0)).toBe(true);
  });
  it("an effect gets its peaks, length and energy, never a tempo or a key", () => {
    const m = measureSignal(tone(440, 4), R, false);
    expect(m).toMatchObject({ tempoBpm: null, key: null, durationS: 4 });
    expect(m.energy).toBeCloseTo(0.3536, 3);
    expect(m.peaks).toHaveLength(120);
    expect(Math.max(...m.peaks)).toBe(1);
  });
  it("peaks follow the shape: a fade-in rises", () => {
    const x = Float32Array.from({ length: R * 2 }, (_, i) => (i / (R * 2)) * Math.sin(i / 5));
    const p = peaksOf(x);
    expect(p[0]).toBeLessThan(0.05);
    expect(p.at(-1)).toBeGreaterThan(0.95);
  });
  it("f32le bytes read little-endian, a trailing partial sample dropped", () => {
    const b = new Uint8Array(new Float32Array([0.5, -0.25]).buffer);
    expect([...samplesOf(new Uint8Array([...b, 7]))]).toEqual([0.5, -0.25]);
  });
});

let dir: string;
let k: Kernel;
let blobs: BlobStore;
const AT = () => new Date("2026-10-17T00:00:00.000Z");
const music = (id: string, sha: string): LibraryItemInput => ({
  kind: "audio",
  id,
  title: id,
  state: "ratified",
  collections: [],
  origin: "suno",
  rights: { use: "publishable" },
  source: "real",
  lineage: [],
  vocabulary: { type: "music", genre: [], mood: [], instrument: [], provider: "suno", durationS: 6 },
  media: { sha256: sha, bytes: 1, mime: "audio/wav" },
});

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-l60-measure-"));
  const opened = openKernel(":memory:");
  if (!opened.ok) throw opened.error;
  k = opened.value;
  blobs = blobStore(path.join(dir, "blobs"));
  const file = path.join(dir, "a.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=6:sample_rate=44100", "-ac", "2", file], { windowsHide: true });
  const ref = await blobs.put(new Uint8Array(readFileSync(file)), "audio/wav");
  if (!ref.ok) throw ref.error;
  const extras = { audio: { prompt: "p", reasons: [], facts: { asked: { tempoBpm: null, key: null, durationS: 6 }, measured: null }, peaks: [], src: null } };
  const up = upsertItems(k.store, [{ item: music("audio:a", ref.value.sha256), meta: "", extras, feed: "t" }], { styleOf: () => undefined });
  if (!up.ok) throw up.error;
}, 60_000);
afterAll(() => {
  k.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("the measure pass on ffmpeg", () => {
  it("measures a decodable audio blob once, and the Library detail draws it", async () => {
    const facts = await probeMissing(k.store, blobs, ffmpegProbe(), { limit: 10, now: AT });
    if (!facts.ok) throw facts.error;
    const r = await measureMissing(k.store, blobs, ffmpegDecode(), { limit: 10, now: AT });
    expect(r.ok && r.value).toEqual({ measured: 1, failed: [] });
    const d = libraryDetail(k.store, "audio:a");
    if (!d.ok) throw d.error;
    const m = d.value.extras.audio?.facts.measured;
    expect(m?.durationS).toBeCloseTo(6, 1);
    expect(m?.key?.startsWith("A ")).toBe(true);
    expect(d.value.extras.audio?.peaks).toHaveLength(120);
    const owed = measuresMissing(k.store, 10);
    expect(owed.ok && owed.value).toEqual([]);
  });
  it("a decoder that refuses leaves a row with its words, and is not asked again", async () => {
    const ref = await blobs.put(new TextEncoder().encode("RIFF-not-really"), "audio/wav");
    if (!ref.ok) throw ref.error;
    const up = upsertItems(k.store, [{ item: music("audio:b", ref.value.sha256), meta: "", extras: {}, feed: "t" }], { styleOf: () => undefined });
    if (!up.ok) throw up.error;
    // The probe would call it undecodable; force the measure pass to meet it by saying it decodes.
    k.store.tx((t) => t.run("INSERT INTO media_facts (sha, decodable, mime, probed_at, near_black) VALUES (?, 1, 'audio/wav', 'x', 0)", ref.value.sha256));
    let asked = 0;
    const refuse = async () => {
      asked += 1;
      return err<Uint8Array>("unavailable", "ffmpeg decode: Invalid data found when processing input");
    };
    const r = await measureMissing(k.store, blobs, refuse, { limit: 10, now: AT });
    expect(r.ok && r.value.measured).toBe(0);
    await measureMissing(k.store, blobs, refuse, { limit: 10, now: AT });
    expect(asked).toBe(1);
  });
});
