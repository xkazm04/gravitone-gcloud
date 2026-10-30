// THE SPECTRUM PASS: mono PCM in, the per-frame arrays the timeline carries out
// (three bands and RMS at CLIP_FPS, each 0..1) plus the analysis-rate onset
// envelope the tempo and beat passes need. Pure: arrays in, arrays out.
//
// TWO CLOCKS, on purpose. The timeline speaks 30 fps because that is the
// renderer's frame; a beat tracker at 30 fps would be quantised to 33 ms, near
// the whole 40 ms tolerance a cut is judged by. So the STFT runs at hop 256
// (86 frames a second at 22050 Hz, 11.6 ms) and only the published arrays are
// averaged down to 30 fps. The onset envelope never leaves the fine clock.
//
// NORMALISATION is "divide by the 98th percentile and clamp", not by the max:
// one snare crack or a clipped transient would otherwise press every other
// frame of the track toward zero, and a visual that reads these arrays would
// go dim for the whole song because of one frame.

import { CLIP_FPS } from "./types";

export const STFT_SIZE = 2048;
/** The onset transform is shorter than the band transform. A 2048-point Hann
 *  window (93 ms) sees a click ~45 ms before its centre does, and the log
 *  flux jumps at that first sight: measured on a synthetic click track, every
 *  onset came out 33 ms EARLY. 512 points (23 ms) puts the jump within a few
 *  ms of the click and still resolves a kick from a snare. */
export const FLUX_SIZE = 512;
export const STFT_HOP = 256;
const LOW_HZ = 150;
const MID_HZ = 2000;

/** Precomputed radix-2 plan: bit-reversal table and twiddles, built once per
 *  size. A 250 s track is ~21 500 transforms; recomputing sin/cos inside each
 *  would be most of the run. */
export interface FftPlan {
  n: number;
  rev: Uint32Array;
  cos: Float64Array;
  sin: Float64Array;
}

export function fftPlan(n: number): FftPlan {
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`fft size ${n} is not a power of two`);
  const bits = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((-2 * Math.PI * k) / n);
    sin[k] = Math.sin((-2 * Math.PI * k) / n);
  }
  return { n, rev, cos, sin };
}

/** In-place iterative Cooley-Tukey over (re, im), length plan.n. */
export function fft(plan: FftPlan, re: Float64Array, im: Float64Array): void {
  const { n, rev, cos, sin } = plan;
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step];
        const wi = sin[k * step];
        const a = start + k;
        const b = a + half;
        const xr = re[b] * wr - im[b] * wi;
        const xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
      }
    }
  }
}

/** The value at quantile q (0..1) of `xs`, without disturbing it. */
export function quantile(xs: ArrayLike<number>, q: number): number {
  if (xs.length === 0) return 0;
  const s = Float64Array.from(xs).sort();
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

/** Divide by the 98th percentile and clamp to 0..1, rounded to 4 places (the
 *  timeline is JSON; 17 significant digits per frame is megabytes of noise). */
export function robustNormalise(xs: ArrayLike<number>): number[] {
  const p = quantile(xs, 0.98);
  const out = new Array<number>(xs.length);
  for (let i = 0; i < xs.length; i++) {
    const v = p > 0 ? xs[i] / p : 0;
    out[i] = Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000;
  }
  return out;
}

export interface Spectrum {
  /** Published frames at CLIP_FPS, each 0..1. */
  low: number[];
  mid: number[];
  high: number[];
  rms: number[];
  /** Spectral flux averaged to CLIP_FPS, 0..1 (the section pass's density cue). */
  flux: number[];
  /** Onset strength at the fine clock (`envRate` frames a second), >= 0. */
  env: Float64Array;
  envRate: number;
}

/**
 * The STFT pass. Frame j is centred on sample j*hop (zero-padded at the ends),
 * Hann-windowed. Per frame: band energies (sum of |X|^2 over the bins in band)
 * and the half-wave-rectified log-magnitude flux. `frames` is the length of
 * the published arrays - round(duration * 30) - handed in so every array in
 * the timeline agrees on it.
 */
export function spectrum(pcm: Float32Array, rate: number, frames: number): Spectrum {
  const n = STFT_SIZE;
  const hop = STFT_HOP;
  const plan = fftPlan(n);
  const win = hann(n);
  const fn = FLUX_SIZE;
  const fplan = fftPlan(fn);
  const fwin = hann(fn);
  const fbins = fn / 2 + 1;
  const bins = n / 2 + 1;
  const binHz = rate / n;
  const lowTop = Math.floor(LOW_HZ / binHz);
  const midTop = Math.floor(MID_HZ / binHz);

  const count = Math.floor(pcm.length / hop) + 1;
  const lowE = new Float64Array(count);
  const midE = new Float64Array(count);
  const highE = new Float64Array(count);
  const flux = new Float64Array(count);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const fre = new Float64Array(fn);
  const fim = new Float64Array(fn);
  let prev = new Float64Array(fbins);
  let cur = new Float64Array(fbins);
  for (let j = 0; j < count; j++) {
    const c = j * hop - n / 2;
    for (let i = 0; i < n; i++) {
      const s = c + i;
      re[i] = s >= 0 && s < pcm.length ? pcm[s] * win[i] : 0;
      im[i] = 0;
    }
    fft(plan, re, im);
    let lo = 0;
    let mi = 0;
    let hi = 0;
    for (let k = 1; k < bins; k++) {
      const p = re[k] * re[k] + im[k] * im[k];
      if (k <= lowTop) lo += p;
      else if (k <= midTop) mi += p;
      else hi += p;
    }
    const fc = j * hop - fn / 2;
    for (let i = 0; i < fn; i++) {
      const s = fc + i;
      fre[i] = s >= 0 && s < pcm.length ? pcm[s] * fwin[i] : 0;
      fim[i] = 0;
    }
    fft(fplan, fre, fim);
    let fl = 0;
    for (let k = 1; k < fbins; k++) {
      // Log compression (gamma 100) so a quiet hi-hat counts beside a kick.
      const m = Math.log1p(100 * Math.hypot(fre[k], fim[k]));
      cur[k] = m;
      const d = m - prev[k];
      if (d > 0) fl += d;
    }
    lowE[j] = lo;
    midE[j] = mi;
    highE[j] = hi;
    flux[j] = j === 0 ? 0 : fl;
    const t = prev;
    prev = cur;
    cur = t;
  }

  const envRate = rate / hop;
  return {
    low: robustNormalise(toClip(lowE, envRate, frames, true)),
    mid: robustNormalise(toClip(midE, envRate, frames, true)),
    high: robustNormalise(toClip(highE, envRate, frames, true)),
    rms: robustNormalise(rmsFrames(pcm, rate, frames)),
    flux: robustNormalise(toClip(flux, envRate, frames, false)),
    env: onsetEnvelope(flux, envRate),
    envRate,
  };
}

function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** Fine-clock values averaged into CLIP_FPS frames; `amp` takes the square
 *  root of the mean energy, so a band reads as an amplitude like `rms` does. */
function toClip(xs: Float64Array, srcRate: number, frames: number, amp: boolean): Float64Array {
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    const a = Math.floor((i / CLIP_FPS) * srcRate);
    const b = Math.max(a + 1, Math.floor(((i + 1) / CLIP_FPS) * srcRate));
    let s = 0;
    let cnt = 0;
    for (let j = a; j < b && j < xs.length; j++) {
      s += xs[j];
      cnt++;
    }
    const m = cnt ? s / cnt : 0;
    out[i] = amp ? Math.sqrt(m) : m;
  }
  return out;
}

/** Time-domain RMS over each CLIP_FPS frame's own samples. */
function rmsFrames(pcm: Float32Array, rate: number, frames: number): Float64Array {
  const out = new Float64Array(frames);
  for (let i = 0; i < frames; i++) {
    const a = Math.floor((i / CLIP_FPS) * rate);
    const b = Math.min(pcm.length, Math.floor(((i + 1) / CLIP_FPS) * rate));
    let s = 0;
    for (let j = a; j < b; j++) s += pcm[j] * pcm[j];
    out[i] = b > a ? Math.sqrt(s / (b - a)) : 0;
  }
  return out;
}

/** Flux minus its own half-second running mean, clamped at 0, divided by its
 *  standard deviation: the part of each frame's novelty that stands out from
 *  the bed it sits in. A wall of distorted guitar is constant flux; the kick
 *  through it is the excess. */
export function onsetEnvelope(flux: Float64Array, rate: number): Float64Array {
  const half = Math.max(1, Math.round(rate * 0.25));
  const n = flux.length;
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + flux[i];
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    out[i] = Math.max(0, flux[i] - (pre[b] - pre[a]) / (b - a));
  }
  let m = 0;
  for (const v of out) m += v;
  m /= n || 1;
  let v2 = 0;
  for (const v of out) v2 += (v - m) * (v - m);
  const sd = Math.sqrt(v2 / (n || 1)) || 1;
  for (let i = 0; i < n; i++) out[i] /= sd;
  return out;
}

/**
 * Onset times (seconds) from the envelope: a frame is an onset when it is the
 * largest within +-35 ms, stands above the local mean (+-150 ms) by `delta`
 * standard deviations, and is at least `minGapS` after the last one taken.
 * The time is refined between frames by a parabola through the peak and its
 * neighbours, so an onset is not quantised to the 11.6 ms hop.
 */
export function pickOnsets(env: Float64Array, rate: number, delta = 0.35, minGapS = 0.06): number[] {
  const n = env.length;
  const w = Math.max(1, Math.round(rate * 0.035));
  const m = Math.max(1, Math.round(rate * 0.15));
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + env[i];
  const out: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < n - 1; i++) {
    const v = env[i];
    const a = Math.max(0, i - m);
    const b = Math.min(n, i + m + 1);
    if (v < (pre[b] - pre[a]) / (b - a) + delta) continue;
    let isMax = true;
    for (let k = Math.max(0, i - w); k <= Math.min(n - 1, i + w) && isMax; k++) if (env[k] > v || (env[k] === v && k < i)) isMax = false;
    if (!isMax) continue;
    const l = env[i - 1];
    const r = env[i + 1];
    const den = l - 2 * v + r;
    const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
    const t = (i + off) / rate;
    if (t - last < minGapS) continue;
    out.push(Math.round(t * 1000) / 1000);
    last = t;
  }
  return out;
}
