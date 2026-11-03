// THE TEMPO PASS: how fast the track goes, heard from the onset envelope, with
// the style prompt's "125 BPM" as a PRIOR and never as the answer.
//
// Why a prior and not the answer: the style text is what was ASKED of the
// generator, and Suno does not always deliver what it is asked (a "125 BPM"
// prompt can come back at 120, or felt in half time). The registry's
// track-map-before-treatment says the grid is a list of beats heard in the
// audio, not a multiplication of a number - so the number only breaks the one
// tie autocorrelation cannot: whether the pulse is b, b/2 or 2b. Where the
// evidence at the prior's octave is weak (under half the strongest peak), the
// evidence wins and the disagreement is said out loud as a warning.
//
// The global figure this returns is a SEED for the beat tracker; the final
// `bpmGlobal` the timeline publishes is re-read from the tracked beats'
// median interval (see beats.ts), so drift the tracker followed is in it.

/** "125 BPM" / "125bpm" / "bpm 125" in the style text, else undefined. */
export function parseBpmPrior(styleText: string): number | undefined {
  const m = /(\d{2,3}(?:\.\d+)?)\s*bpm\b/i.exec(styleText) ?? /\bbpm\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)/i.exec(styleText);
  if (!m) return undefined;
  const v = Number(m[1]);
  return v >= 40 && v <= 260 ? v : undefined;
}

/** Normalised autocorrelation of the mean-removed envelope, lags 0..maxLag. */
export function autocorrelate(env: Float64Array, maxLag: number): Float64Array {
  const n = env.length;
  let mean = 0;
  for (const v of env) mean += v;
  mean /= n || 1;
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = env[i] - mean;
  const out = new Float64Array(maxLag + 1);
  for (let l = 0; l <= maxLag && l < n; l++) {
    let s = 0;
    for (let i = 0; i + l < n; i++) s += x[i] * x[i + l];
    out[l] = s / (n - l);
  }
  const z = out[0] || 1;
  for (let l = 0; l <= maxLag; l++) out[l] /= z;
  return out;
}

/** The ACF read between lags by a parabola through the nearest three. */
function peakAt(acf: Float64Array, lag: number): { lag: number; v: number } {
  const i = Math.round(lag);
  if (i < 1 || i >= acf.length - 1) return { lag, v: acf[Math.max(0, Math.min(acf.length - 1, i))] ?? 0 };
  // Climb to the local maximum within two lags of the guess.
  let best = i;
  for (let k = i - 2; k <= i + 2; k++) if (k > 0 && k < acf.length - 1 && acf[k] > acf[best]) best = k;
  const l = acf[best - 1];
  const c = acf[best];
  const r = acf[best + 1];
  const den = l - 2 * c + r;
  const off = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (l - r)) / den)) : 0;
  return { lag: best + off, v: c - 0.25 * (l - r) * off };
}

export interface TempoEstimate {
  bpm: number;
  /** What the envelope said before the prior was consulted. */
  detectedBpm: number;
  warnings: string[];
}

const MIN_BPM = 60;
const MAX_BPM = 200;

/**
 * Global tempo of `env` (rate = frames a second). Peaks of the ACF in the
 * 60..200 BPM range are scored by height times a one-octave log-Gaussian
 * centred on the prior (or 120, the registry's usual centre, without one); the
 * winner is then checked against its relatives (x2, /2, x3/2, x2/3) and the
 * one nearest the prior is taken when its own peak is at least half the
 * winner's. The bar-length lag (4 beats) refines the figure: an error of a
 * fraction of a frame at one beat is a quarter of that at four.
 */
export function estimateTempo(env: Float64Array, rate: number, prior?: number): TempoEstimate {
  const warnings: string[] = [];
  const lagOf = (bpm: number) => (60 * rate) / bpm;
  const maxLag = Math.ceil(lagOf(MIN_BPM) * 4) + 3;
  const acf = autocorrelate(env, Math.min(maxLag, env.length - 1));
  const centre = prior ?? 120;
  const weight = (bpm: number) => Math.exp(-0.5 * Math.log2(bpm / centre) ** 2);

  const lo = Math.floor(lagOf(MAX_BPM));
  const hi = Math.min(acf.length - 2, Math.ceil(lagOf(MIN_BPM)));
  let best: { lag: number; v: number } | undefined;
  let bestScore = -Infinity;
  for (let l = Math.max(2, lo); l <= hi; l++) {
    if (acf[l] < acf[l - 1] || acf[l] < acf[l + 1]) continue;
    const p = peakAt(acf, l);
    const s = p.v * weight(lagOf(p.lag));
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  if (!best || best.v <= 0) {
    warnings.push(`tempo: no periodicity in the onset envelope; using ${prior ? `the style prior ${prior}` : "120"} BPM as the beat seed`);
    const b = prior ?? 120;
    return { bpm: b, detectedBpm: b, warnings };
  }
  const detectedBpm = lagOf(best.lag);
  let chosen = best;
  if (prior !== undefined) {
    for (const f of [2, 0.5, 1.5, 2 / 3]) {
      const lag = best.lag / f;
      if (lag < 2 || lag >= acf.length - 2) continue;
      const p = peakAt(acf, lag);
      const nearer = Math.abs(Math.log(lagOf(p.lag) / prior)) < Math.abs(Math.log(lagOf(chosen.lag) / prior));
      if (nearer && p.v >= 0.5 * best.v) chosen = p;
    }
  }
  // Refine on the bar lag when it is in range and is itself a peak.
  let lag = chosen.lag;
  if (chosen.lag * 4 < acf.length - 2) {
    const bar = peakAt(acf, chosen.lag * 4);
    if (Math.abs(bar.lag / 4 - chosen.lag) < 0.5) lag = bar.lag / 4;
  }
  const bpm = lagOf(lag);
  if (prior !== undefined && Math.abs(Math.log(lagOf(chosen.lag) / lagOf(best.lag))) > 0.01) {
    warnings.push(`tempo: the envelope's strongest pulse was ${detectedBpm.toFixed(1)} BPM; resolved to ${bpm.toFixed(1)} toward the style prior ${prior}`);
  }
  return { bpm, detectedBpm, warnings };
}

/** Running median of `xs` over an odd window (edges use what is in range). */
export function medianFilter(xs: number[], width: number): number[] {
  const h = Math.floor(width / 2);
  return xs.map((_, i) => {
    const w = xs.slice(Math.max(0, i - h), Math.min(xs.length, i + h + 1)).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

/** One tempo point per bar: at each downbeat, 60 / the median-filtered
 *  inter-beat interval of the beats in that bar. */
export function tempoCurve(beats: { t: number; downbeat: boolean }[]): { t: number; bpm: number }[] {
  if (beats.length < 3) return [];
  const ibi = medianFilter(
    beats.slice(1).map((b, i) => b.t - beats[i].t),
    5,
  );
  const out: { t: number; bpm: number }[] = [];
  for (let i = 0; i < beats.length - 1; i++) {
    if (!beats[i].downbeat) continue;
    const span = ibi.slice(i, Math.min(ibi.length, i + 4));
    const m = span.slice().sort((a, b) => a - b)[Math.floor(span.length / 2)];
    if (m > 0) out.push({ t: Math.round(beats[i].t * 1000) / 1000, bpm: Math.round((60 / m) * 10) / 10 });
  }
  return out;
}
