// The generated signals of tests/next-server/audio-triage.test.ts - every defect the triage
// detectors are tested on is BUILT here, by construction, and written as 16-bit PCM WAV (what a
// decoder reads back as int/32768, so full scale is 0.99997 and counts as clipped). Deterministic:
// the hats' noise is a seeded xorshift, so a run is the same signal on every box.

import { writeFileSync } from "node:fs";

export const R = 48_000;
export type Signal = Float64Array;

/** A 16-bit PCM WAV of `channels` (each the same length), clamped to full scale. */
export function wav16(file: string, channels: readonly Signal[]): void {
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
  h.writeUInt32LE(R, 24);
  h.writeUInt32LE(R * ch * 2, 28);
  h.writeUInt16LE(ch * 2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36, "ascii");
  h.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([h, data]));
}

export const signal = (s: number, f: (t: number) => number): Signal => Float64Array.from({ length: Math.round(R * s) }, (_, i) => f(i / R));
export const dbfs = (db: number): number => 10 ** (db / 20);
export const sine = (s: number, a = 0.3, hz = 440): Signal => signal(s, (t) => a * Math.sin(2 * Math.PI * hz * t));
export const chord = (s: number, hzs: readonly number[]): Signal => signal(s, (t) => hzs.reduce((v, hz) => v + 0.1 * Math.sin(2 * Math.PI * hz * t), 0));
export const concat = (...xs: Signal[]): Signal => {
  const out = new Float64Array(xs.reduce((n, x) => n + x.length, 0));
  let at = 0;
  for (const x of xs) {
    out.set(x, at);
    at += x.length;
  }
  return out;
};
export const neg = (x: Signal): Signal => x.map((v) => -v);

/** 10 ms decaying 1.5 kHz clicks, one per beat, the beat length read from `bpmAt(t)`. */
export function clicks(s: number, bpmAt: (t: number) => number): Signal {
  const x = new Float64Array(Math.round(R * s));
  const len = Math.round(0.01 * R);
  for (let beat = 0; beat < s; beat += 60 / bpmAt(beat)) {
    const i = Math.round(beat * R);
    for (let k = 0; k < len && i + k < x.length; k++) x[i + k] = 0.8 * Math.sin((2 * Math.PI * 1500 * k) / R) * Math.exp(-k / (0.002 * R));
  }
  return x;
}

/** Speech-shaped: `n` syllables of 0.3 s (20 ms attack, a held vowel, a 10 ms-constant release)
 * 0.15 s apart, the first at 0.2 s; `cutAt` stops the take mid-vowel. */
export function syllables(n: number, total: number, cutAt = total): Signal {
  return signal(Math.min(total, cutAt), (t) => {
    const i = Math.floor((t - 0.2) / 0.45);
    const u = t - 0.2 - i * 0.45;
    if (i < 0 || i >= n || u >= 0.3) return 0;
    const env = Math.min(1, u / 0.02) * (u < 0.25 ? 1 : Math.exp(-(u - 0.25) / 0.01));
    const hz = 180 + 40 * (i % 3);
    return 0.3 * env * Math.sin(2 * Math.PI * hz * u) * (1 + 0.3 * Math.sin(2 * Math.PI * 900 * u));
  });
}

/** Deterministic noise in -1..1 (xorshift32): hats that are the same on every run. */
function noise(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x7fffffff - 1;
  };
}

/** 8 bars of 120 bpm drums rendered CIRCULARLY (a hit's tail past the end lands on the start, as a
 * loop plays): a pitch-dropping kick on beats 1 and 3, the downbeat accented, a noise hat on every
 * eighth. It starts on its downbeat, so its first 100 ms are a transient and its last a bar-end.
 * `drumsDb(t)` and `hatsDb(t)` are gains across the loop - a drift its wrap then steps by. */
export function drumLoop(drumsDb: (t: number) => number = () => 0, hatsDb: (t: number) => number = () => 0): Signal {
  const n = R * 16;
  const x = new Float64Array(n);
  const rnd = noise(7);
  const hit = (at: number, len: number, gain: (k: number) => number, f: (u: number) => number, gainDb: (t: number) => number): void => {
    const i0 = Math.round(at * R);
    for (let k = 0; k < Math.round(len * R); k++) {
      const i = (i0 + k) % n;
      x[i] = (x[i] ?? 0) + gain(k) * f(k / R) * dbfs(gainDb(i / R));
    }
  };
  for (let beat = 0; beat < 32; beat++) {
    if (beat % 2 === 0) {
      const accent = beat % 4 === 0 ? 0.8 : 0.6;
      hit(beat * 0.5, 0.4, () => accent, (u) => Math.sin(2 * Math.PI * (50 * u + 3 * (1 - Math.exp(-30 * u)))) * Math.exp(-9 * u), drumsDb);
    }
    for (const half of [0, 0.25]) hit(beat * 0.5 + half, 0.08, () => 0.25 * rnd(), (u) => Math.exp(-80 * u), (t) => drumsDb(t) + hatsDb(t));
  }
  return x;
}
