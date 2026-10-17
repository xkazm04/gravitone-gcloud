// WHAT AN AUDIO FILE IS, MEASURED ONCE AT INGEST - the pure half. Mono PCM in (the driver,
// ./measureRun.ts, has ffmpeg decode the blob), the take's measure out: 120 waveform peaks, the
// decoded length, the RMS energy, and for MUSIC a tempo and a key.
//
// Absorbed from v1 app/playground/shared/analysis.ts + measure.ts (the Library's analyser, the
// contest entry's core.js `analyzeFile`), whose method is kept: onset-envelope autocorrelation
// with a mild prior around 120 BPM for tempo, Goertzel chroma over four octaves against the
// Krumhansl profiles for key, RMS for energy, reading at most 60 s from 15 % in so an intro does
// not decide the tempo; tempo and key for music only, because the analyser will name a key for a
// door slam and a key on an effect is a number with no property behind it.
// Upgraded:
//   · it runs on the server when the bytes enter the Library (the free media-facts job), not in
//     the first browser that opened the take - v1 decoded in the page and PATCHed the result
//     back, so a take nobody opened had no waveform anywhere and two tabs measured it twice;
//   · silence measures as silence: a flat onset envelope has no tempo and an empty chroma no
//     key (v1 answered 60 BPM and "C major" for a silent file - the first candidate won a race
//     against nothing);
//   · peaks come from the analysed signal at the decode rate, not a 64-sample stride over channel
//     0, so a stereo file panned right still draws its shape.

export type AudioMeasure = {
  /** 120 bars, 0..1, normalised to the loudest. Empty for a file with no samples. */
  readonly peaks: readonly number[];
  /** RMS of the analysed window, 0..1 (v1 MeasuredSound.energy). */
  readonly energy: number;
  /** The decoded length, seconds. */
  readonly durationS: number;
  readonly tempoBpm: number | null;
  readonly key: string | null;
};

export const PEAK_BARS = 120;
/** The rate the driver decodes at: what v1 downsampled to before analysing. */
export const MEASURE_RATE = 11_025;

const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const at = (a: ArrayLike<number>, i: number): number => a[i] ?? 0;
const round = (n: number, places: number): number => Math.round(n * 10 ** places) / 10 ** places;

function corr(a: readonly number[], b: readonly number[]): number {
  const ma = a.reduce((x, y) => x + y, 0) / 12;
  const mb = b.reduce((x, y) => x + y, 0) / 12;
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    n += (at(a, i) - ma) * (at(b, i) - mb);
    da += (at(a, i) - ma) ** 2;
    db += (at(b, i) - mb) ** 2;
  }
  return da * db === 0 ? 0 : n / Math.sqrt(da * db);
}

/** Peaks over the whole file: the loudest sample per bar, normalised to the loudest bar. */
export function peaksOf(x: Float32Array, bars = PEAK_BARS): number[] {
  if (x.length === 0) return [];
  const out: number[] = [];
  for (let p = 0; p < bars; p++) {
    let m = 0;
    const end = Math.floor(((p + 1) / bars) * x.length);
    for (let i = Math.floor((p / bars) * x.length); i < end; i++) m = Math.max(m, Math.abs(at(x, i)));
    out.push(m);
  }
  const top = Math.max(...out);
  return out.map((p) => (top === 0 ? 0 : round(p / top, 3)));
}

/** Tempo by onset-envelope autocorrelation, 60..180 BPM; null when nothing onsets. */
export function tempoOf(x: Float32Array, rate: number): number | null {
  const hop = 256;
  const frames = Math.floor(x.length / hop);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < hop; i++) e += at(x, f * hop + i) ** 2;
    e = Math.log(1 + 100 * e);
    env[f] = Math.max(0, e - prev);
    prev = e;
  }
  const fps = rate / hop;
  // A candidate must score above zero to win: a flat envelope (silence) names no tempo, where
  // v1 started below zero and crowned the first candidate it tried.
  let best: number | null = null;
  let bestV = 0;
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let v = 0;
    for (let f = 0; f + lag * 2 < frames; f++) v += at(env, f) * at(env, Math.round(f + lag));
    v *= Math.exp((-0.5 * Math.log2(bpm / 120) ** 2) / 0.8);
    if (v > bestV) {
      bestV = v;
      best = bpm;
    }
  }
  return best;
}

/** Key by Goertzel chroma against the Krumhansl profiles; null when the chroma is empty. */
export function keyOf(x: Float32Array, rate: number): string | null {
  const chroma = new Array<number>(12).fill(0);
  const win = 2048;
  for (let s = 0; s + win < x.length; s += win * 4) {
    for (let pc = 0; pc < 12; pc++) {
      for (let oct = 2; oct <= 5; oct++) {
        const f = 440 * 2 ** ((pc - 9) / 12 + (oct - 4));
        const cw = 2 * Math.cos((2 * Math.PI * f) / rate);
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < win; i++) {
          const s0 = at(x, s + i) + cw * s1 - s2;
          s2 = s1;
          s1 = s0;
        }
        chroma[pc] = at(chroma, pc) + s1 * s1 + s2 * s2 - cw * s1 * s2;
      }
    }
  }
  if (chroma.every((c) => c <= 1e-9)) return null;
  let key: string | null = null;
  let kv = -2;
  for (let r = 0; r < 12; r++) {
    const rot = [...chroma.slice(r), ...chroma.slice(0, r)];
    const a = corr(rot, MAJ);
    const b = corr(rot, MIN);
    if (a > kv) {
      kv = a;
      key = `${NOTES[r] ?? "C"} major`;
    }
    if (b > kv) {
      kv = b;
      key = `${NOTES[r] ?? "C"} minor`;
    }
  }
  return key;
}

/** The analysed window: at most 60 s, starting 15 % in. */
export function windowOf(x: Float32Array, rate: number): Float32Array {
  const start = Math.floor(x.length * 0.15);
  return x.subarray(start, start + Math.min(x.length - start, Math.floor(rate * 60)));
}

export function measureSignal(x: Float32Array, rate: number, music: boolean): AudioMeasure {
  const w = windowOf(x, rate);
  let sq = 0;
  for (let i = 0; i < w.length; i++) sq += at(w, i) ** 2;
  const rms = Math.sqrt(sq / Math.max(1, w.length));
  return {
    peaks: peaksOf(x),
    energy: Math.min(1, round(rms, 4)),
    durationS: round(x.length / rate, 2),
    tempoBpm: music ? tempoOf(w, rate) : null,
    key: music ? keyOf(w, rate) : null,
  };
}

/** Little-endian f32 bytes (ffmpeg `-f f32le`) as samples; a trailing partial sample is dropped. */
export function samplesOf(raw: Uint8Array): Float32Array {
  const n = Math.floor(raw.byteLength / 4);
  const view = new DataView(raw.buffer, raw.byteOffset, n * 4);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}
