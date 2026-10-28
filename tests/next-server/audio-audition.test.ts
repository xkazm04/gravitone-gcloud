// THE AUDITION ENGINE, WITHOUT ANYONE'S SAMPLE LIBRARY (lib/audio/atlas.ts, lib/audio/reference.ts,
// pipeline/audio/audition.py). The libraries the composer plays are licensed to one machine, so
// every fixture here is GENERATED: three decaying sines named the way FL Studio numbers its
// multisamples ("Piano Rhodes (1).wav" - no note in the name), laid out under a temp root the way
// a pack files them. The engine must find the family by its folder, MEASURE each file's pitch,
// play the phrase in the asked key from the nearest sample, and set the loudness it promises.
//
// The pure halves (folder matching, the contour) run everywhere; the render lane SKIPS, saying
// why, when this box's Python lacks the sidecar's requirements.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 90_000 });

import { auditionFile, familiesOf } from "../../lib/audio/atlas.ts";
import { contourOf } from "../../lib/audio/reference.ts";
import { measureFile, SIDECAR_SCRIPT } from "../../lib/audio/sidecar.ts";

const PY = process.env["PYTHON"] ?? (process.platform === "win32" ? "python" : "python3");
const ready = ((): string | null => {
  const r = spawnSync(PY, ["-c", "import numpy, soundfile, pyloudnorm"], { encoding: "utf8", timeout: 30_000, windowsHide: true });
  return r.status === 0 ? null : `${PY} lacks numpy/soundfile/pyloudnorm (pip install -r pipeline/requirements.txt)`;
})();
if (ready !== null) console.warn(`audition render lane skipped: ${ready}`);

const TMP = mkdtempSync(path.join(tmpdir(), "gt-audition-"));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

/** A 16-bit mono PCM WAV. */
function wav16(file: string, rate: number, x: Float32Array): void {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((x[i] ?? 0) * 32767))), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0, "ascii");
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVEfmt ", 8, "ascii");
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}

/** A WAV's 16-bit mono samples, from its `data` chunk wherever the writer put it. */
function readWav16(file: string): { readonly rate: number; readonly x: Float32Array } {
  const b = readFileSync(file);
  const rate = b.readUInt32LE(24);
  let at = 12;
  while (at < b.length - 8 && b.toString("ascii", at, at + 4) !== "data") at += 8 + b.readUInt32LE(at + 4);
  const n = Math.floor(b.readUInt32LE(at + 4) / 2);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(at + 8 + i * 2) / 32768;
  return { rate, x };
}

/** The fundamental of a window, Hz, by autocorrelation over 60-1000 Hz. */
function pitchOf(x: Float32Array, rate: number): number {
  let best = 0;
  let lag = 0;
  for (let t = Math.floor(rate / 1000); t <= Math.floor(rate / 60); t++) {
    let c = 0;
    for (let i = 0; i + t < x.length; i++) c += (x[i] ?? 0) * (x[i + t] ?? 0);
    if (c > best) {
      best = c;
      lag = t;
    }
  }
  return rate / lag;
}

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

describe("the atlas finds a family by its library folder", () => {
  it("the first folder suffix that a directory ends with wins, relative to the root", () => {
    const dirs = new Map<string, readonly string[]>([
      ["instruments/keyboard/rhodes", ["r1.wav"]],
      ["instruments/keyboard/grand", ["g1.wav"]],
      ["core library/samples/multisamples/grand piano", ["gp1.aif"]],
      ["loops/rhodes groove", ["loop.wav"]],
    ]);
    const fams = familiesOf(dirs);
    expect(fams.get("rhodes")).toEqual(["r1.wav"]);
    expect(fams.get("grand-piano")).toEqual(["g1.wav"]);
    expect(fams.has("upright-piano")).toBe(false);
  });
});

describe("a reference's contour", () => {
  it("one RMS per four bars at the measured tempo; under eight bars there is no shape", () => {
    const rate = 1000;
    const group = 8 * rate; // four bars at 120 bpm
    const x = new Float32Array(group * 4);
    [0.05, 0.2, 0.8, 0.1].forEach((a, g) => {
      for (let i = 0; i < group; i++) x[g * group + i] = a * Math.sin(i / 3);
    });
    const c = contourOf(x, rate, 120);
    expect(c).toHaveLength(4);
    expect(c[2]).toBeGreaterThan(c[1] ?? 1);
    expect(c[1]).toBeGreaterThan(c[0] ?? 1);
    expect(contourOf(x.subarray(0, group), rate, 120)).toEqual([]);
  });
});

describe.skipIf(ready !== null)("an audition from a generated multisample", () => {
  const root = path.join(TMP, "packs");
  const family = path.join(root, "Instruments", "Keyboard", "Rhodes");
  mkdirSync(family, { recursive: true });
  const rate = 44_100;
  // Numbered, not named: the engine has to measure these pitches (MIDI 48, 55, 60).
  [48, 55, 60].forEach((m, i) => {
    const x = new Float32Array(rate * 2);
    for (let k = 0; k < x.length; k++) x[k] = 0.6 * Math.sin((2 * Math.PI * hz(m) * k) / rate) * Math.exp(-k / (rate * 0.8));
    wav16(path.join(family, `Piano Rhodes (${i + 1}).wav`), rate, x);
  });
  const env = { ...process.env, GRAVITONE_SAMPLE_ROOTS: root, GRAVITONE_AUDITION_DIR: path.join(TMP, "cache") };

  it("plays the phrase in the asked key from the measured samples, at the promised loudness", async () => {
    expect(SIDECAR_SCRIPT).toContain("sidecar.py");
    const r = await auditionFile({ id: "rhodes", bpm: 120, key: "A minor" }, env);
    if (!r.ok) throw new Error(r.error.message);
    const { rate: got, x } = readWav16(r.value);
    // Sixteen beats at 120 bpm, one more of ring, 0.6 s of tail.
    expect(x.length / got).toBeCloseTo(17 * 0.5 + 0.6, 1);
    // The first note is the tonic, A, in the register the samples cover (A2 = 110 Hz): an A
    // whichever sample it was resampled from - a misread root would land it elsewhere.
    const f = pitchOf(x.subarray(Math.floor(got * 0.05), Math.floor(got * 0.35)), got);
    const semis = 12 * Math.log2(f / 110);
    expect(Math.abs(semis - 12 * Math.round(semis / 12))).toBeLessThan(0.5);
    const m = await measureFile(r.value);
    if (m.ok) expect(m.value.integratedLufs ?? 0).toBeCloseTo(-20, 0);
  });

  it("a second ask is the cached file, and a tempo the renderer cannot play is refused in words", async () => {
    const a = await auditionFile({ id: "rhodes", bpm: 120, key: "A minor" }, env);
    const b = await auditionFile({ id: "rhodes", bpm: 120, key: "A minor" }, env);
    expect(a.ok && b.ok && a.value === b.value).toBe(true);
    const bad = await auditionFile({ id: "rhodes", bpm: 300, key: null }, env);
    expect(bad.ok).toBe(false);
    const none = await auditionFile({ id: "choir", bpm: 120, key: null }, env);
    expect(!none.ok && none.error.message).toContain("no library");
  });
});
