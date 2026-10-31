// INTENSITY: one number per frame for "how hard is the track hitting here",
// the curve the cut rate and the visual's energy are read from.
//
// Three ingredients, weighted toward what a viewer feels in this genre: level
// (rms), weight (the low band - kick and downtuned guitar), and density
// (spectral flux - how much is changing). Smoothed over ONE BAR so the curve
// moves with the arrangement rather than with every kick; a cut rate that
// follows a per-frame curve would stutter on every snare. Normalised between
// the 2nd and 98th percentile so the quietest bars sit near 0 and the loudest
// near 1 whatever the master's loudness, which is what the section
// thresholds (0.35 / 0.55 / 0.75) assume.

import { quantile } from "./dsp";
import { CLIP_FPS } from "./types";

const W_RMS = 0.4;
const W_LOW = 0.35;
const W_FLUX = 0.25;

export function intensityCurve(rms: number[], low: number[], flux: number[], bpm: number): number[] {
  const n = rms.length;
  if (n === 0) return [];
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = W_RMS * (rms[i] ?? 0) + W_LOW * (low[i] ?? 0) + W_FLUX * (flux[i] ?? 0);
  const barFrames = Math.max(1, Math.round(((4 * 60) / (bpm > 0 ? bpm : 120)) * CLIP_FPS));
  const half = Math.floor(barFrames / 2);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + raw[i];
  const smooth = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    smooth[i] = (pre[b] - pre[a]) / (b - a);
  }
  const lo = quantile(smooth, 0.02);
  const hi = quantile(smooth, 0.98);
  const span = hi - lo;
  return Array.from(smooth, (v) => {
    const x = span > 0 ? (v - lo) / span : 0;
    return Math.round(Math.min(1, Math.max(0, x)) * 10000) / 10000;
  });
}

/** Mean of `curve` over [startS, endS). */
export function meanOver(curve: number[], startS: number, endS: number): number {
  const a = Math.max(0, Math.floor(startS * CLIP_FPS));
  const b = Math.min(curve.length, Math.max(a + 1, Math.floor(endS * CLIP_FPS)));
  let s = 0;
  for (let i = a; i < b; i++) s += curve[i];
  return b > a ? s / (b - a) : 0;
}
