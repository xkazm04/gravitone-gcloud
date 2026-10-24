// THE AUDIO SIDECAR, THROUGH ITS NODE DOOR (lib/audio/sidecar.ts -> pipeline/audio/sidecar.py).
// Every fixture is GENERATED here by a 16-bit WAV writer - a sine whose loudness ffmpeg's ebur128
// is asked for on the same file, a full-scale square, silence, a voice-like tone - in a temp
// directory; nothing binary is committed and nothing in the real stores is touched.
//
// The sidecar lanes SKIP, saying why, when `doctor` finds this box's Python without the
// requirements (python -m pip install -r pipeline/requirements.txt). The measure pass's half
// (lib/sound/measureRun.ts with a Loudness port) runs everywhere: its port is a fake.

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Each lane spawns Python (about 0.7 s cold here, several under the full parallel run); a 5 s
// default timed out on a loaded box with every assertion still true.
vi.setConfig({ testTimeout: 60_000 });

import type { AudioMeasureFull } from "@gt/domain/audio.accept";
import { fxStageSchema, type FxChain, type FxStage } from "@gt/domain/audio.fx";
import { err, ok } from "@gt/domain/errors";
import type { LibraryItemInput } from "@gt/domain/libraryItem";
import { blobStore, type BlobStore } from "@gt/kernel/blob";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { libraryDetail } from "@gt/kernel/library/detail";
import { loudnessMissing, readMeasure } from "@gt/kernel/library/measures";
import { upsertItems } from "@gt/kernel/library/write";

import { applyChain, measureFile, sidecarDoctor, SIDECAR_SCRIPT } from "../../lib/audio/sidecar.ts";
import { sidecarLoudness } from "../../lib/producers/media-facts.ts";
import { ffmpegDecode, measureMissing, type Decode, type Loudness } from "../../lib/sound/measureRun.ts";

const PY = process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");

function probeSidecar(): string | null {
  const r = spawnSync(PY, [SIDECAR_SCRIPT, "doctor", "--json"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  const last = (r.stdout ?? "").trim().split(/\r?\n/).at(-1) ?? "";
  try {
    const d = JSON.parse(last) as { ok?: boolean; missing?: string[] };
    if (d.ok !== true) return `doctor answered ${last}`;
    return (d.missing ?? []).length === 0 ? null : `${PY} lacks ${(d.missing ?? []).join(", ")} (pip install -r pipeline/requirements.txt)`;
  } catch {
    return `${PY} did not run the sidecar: ${(r.error?.message ?? r.stderr ?? "").trim().slice(-200)}`;
  }
}
const NOT_READY = probeSidecar();
const HAS_FFMPEG = spawnSync(process.env["FFMPEG"] ?? "ffmpeg", ["-version"], { windowsHide: true }).status === 0;
if (NOT_READY !== null) console.warn(`audio-sidecar lanes skipped: ${NOT_READY}`);

/** A 16-bit PCM WAV of `channels` (each a Float32Array of the same length). */
function wav16(file: string, rate: number, channels: readonly Float32Array[]): void {
  const n = channels[0]?.length ?? 0;
  const ch = channels.length;
  const data = Buffer.alloc(n * ch * 2);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((channels[c]?.[i] ?? 0) * 32767))), (i * ch + c) * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(ch, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * ch * 2, 28);
  h.writeUInt16LE(ch * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}
const R = 48_000;
const signal = (s: number, f: (t: number) => number): Float32Array => Float32Array.from({ length: Math.round(R * s) }, (_, i) => f(i / R));
const dbfs = (db: number): number => 10 ** (db / 20);

let dir: string;
const at = (name: string): string => path.join(dir, name);
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-audio-sidecar-"));
  const sine = signal(10, (t) => dbfs(-20) * Math.sin(2 * Math.PI * 1000 * t));
  wav16(at("sine.wav"), R, [sine, sine]);
  wav16(at("square.wav"), R, [signal(2, (t) => (Math.sin(2 * Math.PI * 100 * t) >= 0 ? 1 : -1))]);
  wav16(at("silence.wav"), R, [new Float32Array(R * 2)]);
  wav16(at("voice.wav"), R, [signal(2, (t) => 0.3 * Math.sin(2 * Math.PI * 220 * t) * Math.sin(2 * Math.PI * 3 * t))]);
  wav16(at("hot.wav"), R, [signal(2, (t) => 0.95 * Math.sin(2 * Math.PI * 330 * t))]);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const must = <T>(r: { ok: true; value: T } | { ok: false; error: Error }): T => {
  if (!r.ok) throw r.error;
  return r.value;
};

describe.skipIf(NOT_READY !== null)("measure", () => {
  it.skipIf(!HAS_FFMPEG)("a 1 kHz sine at -20 dBFS reads within 0.5 LU of ffmpeg ebur128 on the same file", async () => {
    const m = must(await measureFile(at("sine.wav")));
    const said = spawnSync(process.env["FFMPEG"] ?? "ffmpeg", ["-nostats", "-hide_banner", "-i", at("sine.wav"), "-filter_complex", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8", windowsHide: true }).stderr;
    const ref = Number(/Summary:[\s\S]*?I:\s+(-?[\d.]+) LUFS/.exec(said)?.[1]);
    expect(Number.isFinite(ref)).toBe(true);
    expect(m.integratedLufs).not.toBeNull();
    expect(Math.abs((m.integratedLufs ?? 0) - ref)).toBeLessThanOrEqual(0.5);
    expect(m.truePeakDb).toBeCloseTo(-20, 0);
    expect(m.lra).toBeCloseTo(0, 0);
    expect(m).toMatchObject({ clippedSamples: 0, leadSilenceS: 0, tailSilenceS: 0, durationS: 10 });
  });

  it("a full-scale square is clipped; two seconds of silence have no loudness and no peak", async () => {
    expect(must(await measureFile(at("square.wav"))).clippedSamples).toBeGreaterThan(0);
    expect(must(await measureFile(at("silence.wav")))).toEqual({ integratedLufs: null, truePeakDb: null, lra: null, clippedSamples: 0, leadSilenceS: 2, tailSilenceS: 2, durationS: 2 });
  });

  it("a file that is not audio is refused in the decoder's own words", async () => {
    writeFileSync(at("junk.wav"), "RIFF-not-really");
    const r = await measureFile(at("junk.wav"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/^audio sidecar measure: ffmpeg decode: .*Invalid data/);
  });
});

const chain = (...stages: FxStage[]): FxChain => ({ v: 1, stages });

describe.skipIf(NOT_READY !== null)("fx", () => {
  it("pitch -5, delay 0.3 s, reverb: the take keeps its length (tails cut) and its true peak is under -1 dBTP", async () => {
    const out = at("fx-out.wav");
    const r = must(await applyChain(at("voice.wav"), chain({ kind: "pitch", semitones: -5 }, { kind: "delay", delayS: 0.3, feedback: 0.4, mix: 0.5 }, { kind: "reverb", roomSize: 0.8, damping: 0.5, wet: 0.5, dry: 0.6, width: 1 }), out));
    expect(Math.abs(r.durationS - 2)).toBeLessThanOrEqual(0.01);
    const m = must(await measureFile(out));
    expect(Math.abs(m.durationS - 2)).toBeLessThanOrEqual(0.01);
    expect(m.truePeakDb).not.toBeNull();
    expect(m.truePeakDb ?? 0).toBeLessThanOrEqual(-1);
    expect(readFileSync(out).equals(readFileSync(at("voice.wav")))).toBe(false);
  });

  it("a chain that drives the take over the ceiling is turned down to just under it", async () => {
    const out = at("hot-out.wav");
    const r = must(await applyChain(at("hot.wav"), chain({ kind: "gain", db: 12 }, { kind: "ringmod", hz: 60, mix: 1 }), out));
    expect(r.durationS).toBe(2);
    const m = must(await measureFile(out));
    expect(m.truePeakDb ?? 0).toBeLessThanOrEqual(-1);
    expect(m.truePeakDb ?? -99).toBeGreaterThan(-1.5);
  });

  it("every stage renders at both ends of its bounds - the Python table has not drifted from @gt/domain/audio.fx", async () => {
    const ends: FxStage[] = [];
    for (const option of fxStageSchema.options) {
      const shape = option.shape as Record<string, { value?: unknown; minValue?: number | null; maxValue?: number | null }>;
      for (const end of ["minValue", "maxValue"] as const) {
        const stage: Record<string, unknown> = {};
        for (const [key, s] of Object.entries(shape)) stage[key] = key === "kind" ? s.value : s[end];
        ends.push(stage as FxStage);
      }
    }
    expect(ends).toHaveLength(26);
    for (let i = 0; i < ends.length; i += 8) {
      const r = await applyChain(at("voice.wav"), chain(...ends.slice(i, i + 8)), at(`ends-${i}.wav`));
      expect(r.ok ? "rendered" : r.error.message).toBe("rendered");
    }
  });

  it("the sidecar refuses a chain past a bound with the door's path, as `invalid`", async () => {
    const r = await applyChain(at("voice.wav"), { v: 1, stages: [{ kind: "pitch", semitones: 14 }] } as FxChain, at("x.wav"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.error.code, r.error.message]).toEqual(["invalid", "audio sidecar fx: stages.0.semitones: 14 is outside -12..12"]);
  });
});

describe.skipIf(NOT_READY !== null)("a Python without the requirements", () => {
  let venv: string;
  const saved = process.env["PYTHON"];
  beforeAll(() => {
    // A real interpreter with nothing installed: a bare venv, not a stub that pretends.
    venv = path.join(dir, "bare-venv");
    execFileSync(PY, ["-m", "venv", "--without-pip", venv], { windowsHide: true, timeout: 120_000 });
    process.env["PYTHON"] = process.platform === "win32" ? path.join(venv, "Scripts", "python.exe") : path.join(venv, "bin", "python");
  }, 150_000);
  afterAll(() => {
    if (saved === undefined) delete process.env["PYTHON"];
    else process.env["PYTHON"] = saved;
  });

  it("measure fails with Python's import sentence verbatim; doctor names every missing module", async () => {
    const m = await measureFile(at("sine.wav"));
    expect(m.ok ? null : [m.error.code, m.error.message]).toEqual(["unavailable", "audio sidecar measure: No module named 'numpy'"]);
    const d = await sidecarDoctor();
    expect(d.ok).toBe(false);
    if (!d.ok) for (const name of ["numpy", "scipy", "soundfile", "pyloudnorm", "pedalboard"]) expect(d.error.message).toContain(`${name} (No module named '${name}')`);
  });
});

describe("the posture refuses before anything spawns", () => {
  it("LOCAL_BINARIES=off: every verb is refused with the posture's sentence", async () => {
    const saved = process.env["LOCAL_BINARIES"];
    process.env["LOCAL_BINARIES"] = "off";
    try {
      const m = await measureFile(at("sine.wav"));
      expect(m.ok ? null : m.error.message).toBe("audio sidecar measure: LOCAL_BINARIES=off forbids spawning a local binary on this machine");
      expect((await applyChain(at("sine.wav"), chain({ kind: "gsm" }), at("y.wav"))).ok).toBe(false);
      expect((await sidecarDoctor()).ok).toBe(false);
    } finally {
      if (saved === undefined) delete process.env["LOCAL_BINARIES"];
      else process.env["LOCAL_BINARIES"] = saved;
    }
  });
});

// ---- the measure pass with a Loudness port (no Python needed: the port is a fake)

const AT = () => new Date("2026-10-24T00:00:00.000Z");
const item = (id: string, sha: string): LibraryItemInput => ({
  kind: "audio",
  id,
  title: id,
  state: "ratified",
  collections: [],
  origin: "suno",
  rights: { use: "publishable" },
  source: "real",
  lineage: [],
  vocabulary: { type: "sfx", genre: [], mood: [], instrument: [], provider: "suno", durationS: 2 },
  media: { sha256: sha, bytes: 1, mime: "audio/wav" },
});
const pcm: Decode = async () => ok(new Uint8Array(new Float32Array(11_025).fill(0.25).buffer));
const FIVE: AudioMeasureFull = { integratedLufs: -18.5, truePeakDb: -3.2, lra: 4, clippedSamples: 0, leadSilenceS: 0.1, tailSilenceS: 0.3, durationS: 2 };

describe("the measure pass carries the sidecar's five", () => {
  let k: Kernel;
  let blobs: BlobStore;
  beforeAll(() => {
    const opened = openKernel(":memory:");
    if (!opened.ok) throw opened.error;
    k = opened.value;
    blobs = blobStore(path.join(dir, "blobs"));
  });
  afterAll(() => k.close());

  async function blob(id: string, bytes: string): Promise<string> {
    const ref = must(await blobs.put(new TextEncoder().encode(bytes), "audio/wav"));
    must(upsertItems(k.store, [{ item: item(id, ref.sha256), meta: "", extras: {}, feed: "t" }], { styleOf: () => undefined }));
    k.store.tx((t) => t.run("INSERT INTO media_facts (sha, decodable, mime, probed_at, near_black) VALUES (?, 1, 'audio/wav', 'x', 0)", ref.sha256));
    return ref.sha256;
  }

  it("a sidecar that is not installed: the measure still lands, the five stay NULL, its sentence is said once", async () => {
    const a = await blob("audio:a", "a");
    const b = await blob("audio:b", "b");
    let asked = 0;
    const absent: Loudness = async () => {
      asked += 1;
      return err("unavailable", "audio sidecar: python is missing pedalboard (No module named 'pedalboard')");
    };
    const r = must(await measureMissing(k.store, blobs, pcm, { limit: 10, now: AT, loudness: absent }));
    expect(r.measured).toBe(2);
    expect(r.loudness?.measured).toBe(0);
    expect(r.loudness?.failed).toHaveLength(1);
    expect(asked).toBe(2); // once per new blob; the backfill does not ask the same blob again in the run
    for (const sha of [a, b]) expect(must(k.store.read((x) => readMeasure(x, sha)))).toMatchObject({ durationS: 1, lufs: null, clippedSamples: null });
  });

  it("the sidecar arrives: the next run backfills the rows it missed, and a new blob lands with its five", async () => {
    const present: Loudness = async () => ok(FIVE);
    const r = must(await measureMissing(k.store, blobs, pcm, { limit: 10, now: AT, loudness: present }));
    expect(r).toEqual({ measured: 0, failed: [], loudness: { measured: 2, failed: [] } });
    expect(must(loudnessMissing(k.store, 10))).toEqual([]);
    const c = await blob("audio:c", "c");
    must(await measureMissing(k.store, blobs, pcm, { limit: 10, now: AT, loudness: present }));
    expect(must(k.store.read((x) => readMeasure(x, c)))).toMatchObject({ lufs: -18.5, truePeakDb: -3.2, lra: 4, clippedSamples: 0, tailSilenceS: 0.3 });
  });

  it("with no port the pass is as it was: no loudness key, nothing asked", async () => {
    await blob("audio:d", "d");
    expect(must(await measureMissing(k.store, blobs, pcm, { limit: 10, now: AT }))).toEqual({ measured: 1, failed: [] });
  });

});

describe.skipIf(NOT_READY !== null || !HAS_FFMPEG)("on this box's sidecar (the media-facts binding)", () => {
  it("a real take lands with its loudness in the Library detail", async () => {
    const opened = openKernel(":memory:");
    if (!opened.ok) throw opened.error;
    const k = opened.value;
    try {
      const blobs = blobStore(path.join(dir, "blobs-real"));
      const ref = must(await blobs.put(new Uint8Array(readFileSync(at("sine.wav"))), "audio/wav"));
      const extras = { audio: { prompt: "p", reasons: [], facts: { asked: { tempoBpm: null, key: null, durationS: 10 }, measured: null }, peaks: [], src: null } };
      must(upsertItems(k.store, [{ item: item("audio:sine", ref.sha256), meta: "", extras, feed: "t" }], { styleOf: () => undefined }));
      k.store.tx((t) => t.run("INSERT INTO media_facts (sha, decodable, mime, probed_at, near_black) VALUES (?, 1, 'audio/wav', 'x', 0)", ref.sha256));
      const r = must(await measureMissing(k.store, blobs, ffmpegDecode(), { limit: 10, now: AT, loudness: sidecarLoudness() }));
      expect(r).toMatchObject({ measured: 1, failed: [], loudness: { measured: 1, failed: [] } });
      const m = must(libraryDetail(k.store, "audio:sine")).extras.audio?.facts.measured;
      expect(m?.lufs).toBeCloseTo(-20, 0);
      expect(m?.truePeakDb).toBeCloseTo(-20, 0);
    } finally {
      k.close();
    }
  }, 60_000);
});
