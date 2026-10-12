// THE SECTION PASS - where a track changes character, and a word for each part.
// Pure: arrays in, chapters out; no node, no DOM, no clock. It reads the
// envelope `lib/audioEnvelope.ts` bakes (inside the headless page; see
// render.ts) and is the source of the YouTube chapters the metadata step
// prints.
//
// METHOD, after the registry's music-video-production/track-map-before-treatment
// ("Sections are a different analysis from onsets"): boundaries are found by
// COMPARING STRETCHES of the track with each other, not by looking for loud
// moments. The track is cut into one-second blocks, each block a feature
// vector (mean low / mid / high band energy and spectral flux - the spectral
// balance and density, not just level), and a Foote checkerboard kernel is
// slid down the diagonal of the blocks' self-distance matrix: at each block,
// how far apart are the ten seconds before and the ten seconds after,
// against how far apart each side is from itself. Peaks of that novelty curve
// are boundaries; the kernel's half-width sets the scale of change it hears,
// and ten seconds is verse-to-chorus scale, not phrase scale.
//
// WHAT THIS DOES NOT DO, said out loud because the technique asks for more:
//   - no downbeat grid exists in the envelope, so a boundary is snapped to the
//     nearest detected ONSET within half a second, a proxy for the downbeat
//     the technique names, not the thing itself;
//   - nobody confirms a boundary by ear here - every chapter this returns is
//     an unconfirmed analysis result, fit for a visualizer's chapter list and
//     for nothing that cuts on it;
//   - the LABELS come from energy, which the technique warns against for
//     BOUNDARIES (a quiet chorus and a loud verse are both common). Here the
//     boundaries do not come from energy; only the words do, and a chapter
//     title that says "chorus" over a quiet chorus is a cosmetic miss, not a
//     mistimed cut. The rule is in `labelSections`.
//
// YouTube needs the first chapter at 0:00, at least three, each >= 10s. The
// first is always 0 and the minimum section length (20s) is twice YouTube's
// floor; when the heuristic cannot find three, it returns what it found and
// the metadata step decides whether to print chapters at all.

import type { MvChapter } from "./types";

/** The slice of `AudioEnvelope` this pass reads. Structural, so a test can
 *  hand it a synthetic array without baking a real track. */
export interface SectionInput {
  fps: number;
  bands: { low: number[]; mid: number[]; high: number[] };
  flux?: number[];
  onsetFrames?: number[];
}

export interface SectionOptions {
  /** No section shorter than this, the last one included. */
  minSectionS?: number;
  /** Half-width of the checkerboard kernel - the scale of change detected. */
  kernelHalfS?: number;
  /** A novelty peak below this (feature units: band energies are 0..1) is
   *  noise, not a section change. Absolute rather than relative to the peak,
   *  so a track with no structure at all yields one section instead of its
   *  loudest ripple promoted to a boundary. */
  minNovelty?: number;
}

const BLOCK_S = 1;

/** One-second block features: [low, mid, high, flux] means. */
function blockFeatures(env: SectionInput): number[][] {
  const n = env.bands.low.length;
  const per = Math.max(1, Math.round(env.fps * BLOCK_S));
  const blocks: number[][] = [];
  for (let s = 0; s < n; s += per) {
    const e = Math.min(n, s + per);
    const f = [0, 0, 0, 0];
    for (let i = s; i < e; i++) {
      f[0] += env.bands.low[i] ?? 0;
      f[1] += env.bands.mid[i] ?? 0;
      f[2] += env.bands.high[i] ?? 0;
      f[3] += env.flux?.[i] ?? 0;
    }
    blocks.push(f.map((v) => v / (e - s)));
  }
  return blocks;
}

const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, k) => v - b[k]));

/** Foote novelty: for each block, the Gaussian-tapered checkerboard over the
 *  self-distance matrix - cross-boundary distance minus same-side distance,
 *  normalised by the weight that was in range, clamped at 0. Distance rather
 *  than similarity: the kernel sums to zero, so the sign flip is the only
 *  difference and no similarity scale has to be invented. */
export function noveltyCurve(features: number[][], halfBlocks: number): number[] {
  const n = features.length;
  const out = new Array<number>(n).fill(0);
  const sigma = halfBlocks / 2;
  const w = (k: number) => Math.exp(-((k + 0.5) ** 2) / (2 * sigma * sigma));
  for (let c = 0; c < n; c++) {
    let cross = 0;
    let same = 0;
    let wc = 0;
    let ws = 0;
    // a, b index the blocks BEFORE (-1..-L) and AFTER (0..L-1) the boundary at c.
    for (let a = -halfBlocks; a < halfBlocks; a++) {
      const i = c + a;
      if (i < 0 || i >= n) continue;
      for (let b = -halfBlocks; b < halfBlocks; b++) {
        const j = c + b;
        if (j < 0 || j >= n || j <= i) continue;
        const weight = w(a < 0 ? -a - 1 : a) * w(b < 0 ? -b - 1 : b);
        const d = dist(features[i], features[j]);
        if ((a < 0) !== (b < 0)) {
          cross += weight * d;
          wc += weight;
        } else {
          same += weight * d;
          ws += weight;
        }
      }
    }
    // A block too near the edge to have both sides scores 0: there is no
    // "before" to differ from.
    out[c] = wc > 0 && ws > 0 ? Math.max(0, cross / wc - same / ws) : 0;
  }
  return out;
}

/** Peaks of `novelty`, strongest first, each at least `minBlocks` from 0,
 *  from the end, and from every peak already taken. */
function pickBoundaries(novelty: number[], minBlocks: number, minNovelty: number): number[] {
  const n = novelty.length;
  const candidates: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const v = novelty[i];
    if (v < minNovelty) continue;
    let isMax = true;
    for (let d = 1; d <= 2 && isMax; d++) {
      if ((novelty[i - d] ?? -1) > v || (novelty[i + d] ?? -1) > v) isMax = false;
    }
    if (isMax) candidates.push(i);
  }
  candidates.sort((a, b) => novelty[b] - novelty[a] || a - b);
  const taken: number[] = [];
  for (const c of candidates) {
    if (c < minBlocks || n - c < minBlocks) continue;
    if (taken.some((t) => Math.abs(t - c) < minBlocks)) continue;
    taken.push(c);
  }
  return taken.sort((a, b) => a - b);
}

/** Snap a boundary (seconds) to the nearest onset within half a second - the
 *  downbeat proxy the module header owns up to. */
function snapToOnset(startS: number, env: SectionInput): number {
  const onsets = env.onsetFrames ?? [];
  let best = startS;
  let bestD = 0.5;
  for (const f of onsets) {
    const t = f / env.fps;
    const d = Math.abs(t - startS);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/**
 * Words for sections, from each section's mean energy relative to the
 * track's quietest and loudest section (`rel`, 0..1):
 *   - LOUD (rel >= 0.7) is "chorus" - the loudest level, and where it recurs
 *     that recurrence is the chorus cue the technique names; a lone loud
 *     section is still the track's peak and reads as one;
 *   - the first section is "intro" and the last "outro" when quiet
 *     (rel < 0.5) and there are at least three sections;
 *   - a non-loud section with two choruses behind it and one ahead is
 *     "bridge" (V C V C B C);
 *   - everything else is "verse".
 * A track whose sections barely differ (spread under 0.05 of energy) reads
 * as one level: all "verse", bar an intro/outro nothing can distinguish.
 */
export function labelSections(energies: number[]): string[] {
  const n = energies.length;
  if (n === 0) return [];
  const lo = Math.min(...energies);
  const hi = Math.max(...energies);
  const flat = hi - lo < 0.05;
  const rel = energies.map((e) => (flat ? 0.5 : (e - lo) / (hi - lo)));
  const loud = rel.map((r) => !flat && r >= 0.7);
  return rel.map((r, i) => {
    if (n >= 3 && !loud[i] && r < 0.5 && i === 0) return "intro";
    if (n >= 3 && !loud[i] && r < 0.5 && i === n - 1) return "outro";
    if (loud[i]) return "chorus";
    const before = loud.slice(0, i).filter(Boolean).length;
    const after = loud.slice(i + 1).filter(Boolean).length;
    if (before >= 2 && after >= 1) return "bridge";
    return "verse";
  });
}

/** Sections of the track: the first at 0, each >= `minSectionS`, labelled. */
export function detectSections(env: SectionInput, opts: SectionOptions = {}): MvChapter[] {
  const minSectionS = opts.minSectionS ?? 20;
  const kernelHalfS = opts.kernelHalfS ?? 10;
  const minNovelty = opts.minNovelty ?? 0.04;

  const features = blockFeatures(env);
  if (features.length === 0) return [];
  const novelty = noveltyCurve(features, Math.max(1, Math.round(kernelHalfS / BLOCK_S)));
  const boundaries = pickBoundaries(novelty, Math.ceil(minSectionS / BLOCK_S), minNovelty);

  const startsS = [0, ...boundaries.map((b) => snapToOnset(b * BLOCK_S, env))];
  const totalS = env.bands.low.length / env.fps;
  const energies = startsS.map((s, k) => {
    const e = k + 1 < startsS.length ? startsS[k + 1] : totalS;
    const from = Math.floor(s * env.fps);
    const to = Math.max(from + 1, Math.floor(e * env.fps));
    let sum = 0;
    for (let i = from; i < to; i++) sum += ((env.bands.low[i] ?? 0) + (env.bands.mid[i] ?? 0) + (env.bands.high[i] ?? 0)) / 3;
    return sum / (to - from);
  });
  const labels = labelSections(energies);
  return startsS.map((s, k) => ({ startS: Math.round(s * 10) / 10, label: labels[k] }));
}

/** Mean energy per tenth of the track, scaled so the loudest tenth is 1 - the
 *  shape, not the level (the bands are already track-relative). A silent
 *  track is ten zeros. */
export function energyShape(env: SectionInput, steps = 10): number[] {
  const n = env.bands.low.length;
  const raw: number[] = [];
  for (let k = 0; k < steps; k++) {
    const from = Math.floor((k * n) / steps);
    const to = Math.max(from + 1, Math.floor(((k + 1) * n) / steps));
    let sum = 0;
    let cnt = 0;
    for (let i = from; i < to && i < n; i++) {
      sum += ((env.bands.low[i] ?? 0) + (env.bands.mid[i] ?? 0) + (env.bands.high[i] ?? 0)) / 3;
      cnt++;
    }
    raw.push(cnt ? sum / cnt : 0);
  }
  const peak = Math.max(...raw, 0);
  return raw.map((v) => (peak > 0 ? Math.round((v / peak) * 1000) / 1000 : 0));
}
