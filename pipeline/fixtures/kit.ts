// THE FIXTURE KIT — the few primitives every generator in this folder shares:
// a seeded RNG (same seed, same universe), a PNG writer, a WAV writer, and the
// output-root helpers. Plain Node, no dependencies, nothing imported from the
// app except types — a generator that needs the app running is a generator
// that cannot seed a fresh checkout.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

/* ── where it goes ───────────────────────────────────────────────────────── */

export const OUT = path.join(process.cwd(), "fixtures-out");

export function outFile(...segments: string[]): string {
  return path.join(OUT, ...segments);
}

export function writeBytes(file: string, bytes: Uint8Array | string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}

export function writeJson(file: string, value: unknown): void {
  writeBytes(file, `${JSON.stringify(value, null, 2)}\n`);
}

/* ── time ────────────────────────────────────────────────────────────────── */

/** Every timestamp is `NOW` plus an offset, so the universe always reads as
 *  "this week" whatever day it is generated. */
export const NOW = Date.now();
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
/** ISO string at NOW + offsetMs (negative = past). */
export const iso = (offsetMs: number): string => new Date(NOW + offsetMs).toISOString();
/** Epoch ms at NOW - ms. */
export const ago = (ms: number): number => NOW - ms;

/* ── a seeded RNG ────────────────────────────────────────────────────────── */

export interface Rng {
  next(): number;
  int(lo: number, hi: number): number;
  float(lo: number, hi: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
  shuffle<T>(xs: readonly T[]): T[];
  hex(n: number): string;
}

/** mulberry32, seeded from a string so each generator draws its own stream
 *  and adding rows to one never moves another's numbers. */
export function rng(seed: string): Rng {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    float: (lo, hi) => lo + next() * (hi - lo),
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    chance: (p) => next() < p,
    shuffle: (xs) => {
      const out = [...xs];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    hex: (n) => Array.from({ length: n }, () => Math.floor(next() * 16).toString(16)).join(""),
  };
}

/** FNV-1a over a string, as 8 hex digits — for content-hash ids. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* ── PNG ─────────────────────────────────────────────────────────────────── */

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export type RGB = [number, number, number];

/** A valid RGB PNG whose pixel at (x, y) is `px(x, y)`. */
export function png(w: number, h: number, px: (x: number, y: number) => RGB): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const [r, g, b] = px(x, y);
      raw[row + 1 + x * 3] = Math.max(0, Math.min(255, r | 0));
      raw[row + 2 + x * 3] = Math.max(0, Math.min(255, g | 0));
      raw[row + 3 + x * 3] = Math.max(0, Math.min(255, b | 0));
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const hexToRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A "plate": a diagonal gradient between two palette colours with a few soft
 *  discs, so a grid of them reads as a grid of DIFFERENT pictures (a solid
 *  fill does not), and a seed always paints the same picture. Small by default
 *  — fixtures must stay cheap to write and to hold in IndexedDB. */
export function plate(seed: string, palette: readonly string[], w = 320, h = 200): Buffer {
  const r = rng(seed);
  const [c0, c1, c2] = [r.pick(palette), r.pick(palette), r.pick(palette)].map(hexToRgb) as [RGB, RGB, RGB];
  const discs = Array.from({ length: r.int(2, 4) }, () => ({
    x: r.float(0.1, 0.9) * w,
    y: r.float(0.1, 0.9) * h,
    rad: r.float(0.12, 0.34) * Math.min(w, h),
    c: r.chance(0.5) ? c2 : mix(c0, c2, 0.5),
  }));
  const angle = r.float(0, Math.PI);
  const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
  return png(w, h, (x, y) => {
    const t = Math.max(0, Math.min(1, (x / w) * dx + (y / h) * dy));
    let px = mix(c0, c1, t);
    for (const d of discs) {
      const dist = Math.hypot(x - d.x, y - d.y);
      if (dist < d.rad) px = mix(px, d.c, 0.35 + 0.6 * (1 - dist / d.rad));
    }
    return px;
  });
}

export const toDataUri = (bytes: Uint8Array, mime: string): string => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;

/* ── WAV ─────────────────────────────────────────────────────────────────── */

export interface Tone {
  /** Hz. */
  f: number;
  /** Seconds from the start. */
  at: number;
  /** Seconds. */
  len: number;
  /** 0..1 */
  gain?: number;
}

/** A 16-bit mono PCM WAV of `durationS`, built from enveloped sine tones. It
 *  plays and it has a shape (so the waveform and the measured peaks are not a
 *  flat line), and it is a few tens of KB. It is NOT music — and nothing in the
 *  store claims it is: every take it backs carries origin `fixture`. */
export function wav(durationS: number, tones: readonly Tone[], sampleRate = 16_000): Buffer {
  const n = Math.max(1, Math.round(durationS * sampleRate));
  const pcm = Buffer.alloc(n * 2);
  const mixed = new Float32Array(n);
  for (const t of tones) {
    const start = Math.floor(t.at * sampleRate);
    const len = Math.floor(t.len * sampleRate);
    const gain = t.gain ?? 0.4;
    for (let i = 0; i < len && start + i < n; i++) {
      const p = i / len;
      const env = Math.min(1, p * 20) * Math.pow(1 - p, 1.5); // fast attack, decay
      mixed[start + i] += Math.sin((2 * Math.PI * t.f * i) / sampleRate) * env * gain;
    }
  }
  for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mixed[i])) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "ascii");
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVE", 8, "ascii");
  head.write("fmt ", 12, "ascii");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20); // PCM
  head.writeUInt16LE(1, 22); // mono
  head.writeUInt32LE(sampleRate, 24);
  head.writeUInt32LE(sampleRate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "ascii");
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

/** `n` magnitude bins (0..1) off a WAV's samples — what the Sound lab draws. */
export function peaksOf(wavBytes: Buffer, n = 64): number[] {
  const samples = (wavBytes.length - 44) / 2;
  const per = Math.max(1, Math.floor(samples / n));
  const out: number[] = [];
  for (let b = 0; b < n; b++) {
    let m = 0;
    for (let i = b * per; i < Math.min(samples, (b + 1) * per); i++) m = Math.max(m, Math.abs(wavBytes.readInt16LE(44 + i * 2)) / 32768);
    out.push(Math.round(m * 1000) / 1000);
  }
  return out;
}
