// THE BEAT LIST: where each beat falls, heard, not multiplied out.
//
// The registry's track-map-before-treatment is blunt about it: "the grid is a
// LIST of beats, not a multiplication". A generated track drifts - a Suno
// render at "125 BPM" breathes a few percent across four minutes - and a grid
// laid as t0 + k*60/bpm is a full beat off by the final chorus. So beats come
// from Ellis-style dynamic programming (Ellis 2007, "Beat Tracking by Dynamic
// Programming"; the shape librosa's beat_track keeps): every frame's best
// score is its own onset strength plus the best predecessor's score less a
// penalty on how far the gap strays from the expected period, log-squared so
// a 5% stretch costs little and a skipped beat costs a lot. Backtracking from
// the best ending reads off a beat list that leans on real onsets and follows
// the tempo where it moves.
//
// Downbeats are a separate, cheaper guess: of the four phases a bar could
// start on, the one whose beats carry the most low band plus onset strength
// (kicks land on the one in this genre). It is a guess and is fit for cut
// timing, not for transcription.

import type { TimelineBeat } from "./types";

/** Beat frames (fine clock) through `env` at a seed period of `bpm`. */
export function trackBeatFrames(env: Float64Array, rate: number, bpm: number, tightness = 100): number[] {
  const n = env.length;
  if (n === 0) return [];
  const period = (60 * rate) / bpm;
  // Smooth the envelope with a Gaussian of width period/32 (librosa's local
  // score): a beat a frame early or late should not lose its onset.
  const half = Math.max(1, Math.round(period));
  const kern: number[] = [];
  for (let k = -half; k <= half; k++) kern.push(Math.exp(-0.5 * ((k * 32) / period) ** 2));
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += env[j] * kern[k + half];
    }
    local[i] = s;
  }
  let maxLocal = 0;
  for (const v of local) maxLocal = Math.max(maxLocal, v);

  const lo = Math.round(2 * period);
  const hi = Math.max(1, Math.round(period / 2));
  const penalty = new Float64Array(lo + 1);
  for (let d = hi; d <= lo; d++) penalty[d] = -tightness * Math.log(d / period) ** 2;
  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  let started = false;
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    let arg = -1;
    for (let d = hi; d <= lo; d++) {
      const j = i - d;
      if (j < 0) break;
      const s = cum[j] + penalty[d];
      if (s > best) {
        best = s;
        arg = j;
      }
    }
    if (arg < 0) best = 0;
    cum[i] = local[i] + best;
    // Until the first real onset there is nothing to chain from.
    back[i] = !started && local[i] < 0.01 * maxLocal ? -1 : arg;
    if (local[i] >= 0.01 * maxLocal) started = true;
  }

  // End on the last local maximum of the cumulative score that is at least
  // half the median of such maxima (librosa's rule): a fade-out does not drag
  // the chain past the music.
  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) peaks.push(i);
  if (peaks.length === 0) return [];
  const med = peaks.map((i) => cum[i]).sort((a, b) => a - b)[Math.floor(peaks.length / 2)];
  let end = peaks[peaks.length - 1];
  for (let k = peaks.length - 1; k >= 0; k--) {
    if (cum[peaks[k]] >= 0.5 * med) {
      end = peaks[k];
      break;
    }
  }
  const frames: number[] = [];
  for (let i = end; i >= 0; i = back[i]) {
    frames.push(i);
    if (back[i] < 0) break;
  }
  frames.reverse();

  // Trim weak beats at both ends (silence before the first hit, ring-out
  // after the last): below half the RMS of the local score at the beats.
  let rms = 0;
  for (const f of frames) rms += local[f] * local[f];
  rms = Math.sqrt(rms / (frames.length || 1));
  let a = 0;
  let b = frames.length;
  while (a < b && local[frames[a]] < 0.5 * rms) a++;
  while (b > a && local[frames[b - 1]] < 0.5 * rms) b--;
  return frames.slice(a, b);
}

/** Refine a beat frame to the onset envelope's peak within +-2 frames,
 *  parabolically, in seconds. The DP picks the frame; this places it. */
export function refineBeatTimes(frames: number[], env: Float64Array, rate: number): number[] {
  return frames.map((f) => {
    let best = f;
    for (let k = f - 2; k <= f + 2; k++) if (k > 0 && k < env.length - 1 && env[k] > env[best]) best = k;
    if (best <= 0 || best >= env.length - 1) return f / rate;
    const l = env[best - 1];
    const c = env[best];
    const r = env[best + 1];
    const den = l - 2 * c + r;
    const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
    return (best + off) / rate;
  });
}

/**
 * The bar structure over a beat list. `strength(t)` is the downbeat evidence
 * at a beat (low band + onset); the phase (0..3) whose beats sum the most of
 * it is the "one". Bars count from the first downbeat as 1; beats before it
 * are bar 0, numbered so the beat before the first downbeat is a 4.
 */
export function assignBars(times: number[], strength: (t: number) => number): TimelineBeat[] {
  if (times.length === 0) return [];
  const sums = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  times.forEach((t, i) => {
    sums[i % 4] += strength(t);
    counts[i % 4]++;
  });
  let phase = 0;
  for (let p = 1; p < 4; p++) if (sums[p] / (counts[p] || 1) > sums[phase] / (counts[phase] || 1)) phase = p;
  return times.map((t, i) => {
    const k = i - phase;
    const bar = k < 0 ? 0 : Math.floor(k / 4) + 1;
    const beat = ((((k % 4) + 4) % 4) + 1) as 1 | 2 | 3 | 4;
    return { t: Math.round(t * 1000) / 1000, bar, beat, downbeat: k >= 0 && beat === 1 };
  });
}

/** The published global tempo: 60 over the median inter-beat interval. */
export function bpmFromBeats(times: number[]): number | undefined {
  if (times.length < 2) return undefined;
  const ibi = times
    .slice(1)
    .map((t, i) => t - times[i])
    .sort((a, b) => a - b);
  const m = ibi[Math.floor(ibi.length / 2)];
  return m > 0 ? Math.round((60 / m) * 100) / 100 : undefined;
}
