// WAVEFORM SHAPE — the deterministic waveform drawn for each row: the measured
// envelope when the bytes were read, otherwise a shape drawn from the row's id so
// it is the same on every visit. Split out of book.ts. Moved verbatim.
import type { Take } from "./take";

/* ── deterministic waveform shape per row ──────────────────────────────── */

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const peakCache = new Map<string, number[]>();

/** Max-pool (or stretch) a measured envelope to n slices, so a 120-slice
 *  measurement draws in a 96-stroke waveform without losing its transients. */
export function resample(src: readonly number[], n: number): number[] {
  if (src.length === n) return src.slice();
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * src.length);
    const b = Math.max(a + 1, Math.floor(((i + 1) / n) * src.length));
    let m = 0;
    for (let j = a; j < b && j < src.length; j++) m = Math.max(m, src[j]);
    out.push(m);
  }
  return out;
}

/** A fixture row has no bytes to read a waveform off, so its shape is drawn
 *  from its id: an effect as an attack and decay (or a level for a loop), a
 *  track as four sections. Same rows, same shape, every visit (core.js#peaks). */
export function peaksOf(t: Take, n = 96): number[] {
  // A take whose bytes were measured draws ITS waveform, resampled to n — the
  // shape below is only for a row that has nothing to measure.
  if (t.peaks && t.peaks.length) return resample(t.peaks, n);
  const k = `${t.id}:${n}`;
  const hit = peakCache.get(k);
  if (hit) return hit;
  const r = rng(hash(t.id));
  const out: number[] = [];
  if (t.kind === "sfx") {
    const att = 0.04 + r() * 0.1;
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const env = t.loopable
        ? 0.55 + 0.25 * Math.sin(x * 14 + r())
        : x < att
          ? x / att
          : Math.exp(-(x - att) * (3 + r() * 5));
      out.push(Math.max(0.04, Math.min(1, env * (0.7 + r() * 0.3))));
    }
  } else {
    const secs = [0.12 + r() * 0.08, 0.4 + r() * 0.1, 0.62 + r() * 0.08, 0.86 + r() * 0.06];
    for (let i = 0; i < n; i++) {
      const x = i / n;
      const lvl =
        x < secs[0]
          ? 0.25 + x * 2
          : x < secs[1]
            ? 0.6
            : x < secs[2]
              ? 0.35
              : x < secs[3]
                ? 0.9
                : 0.9 - (x - secs[3]) * 6;
      out.push(Math.max(0.05, Math.min(1, lvl * (0.6 + r() * 0.4))));
    }
  }
  peakCache.set(k, out);
  return out;
}
