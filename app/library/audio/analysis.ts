"use client";

// LOCAL SIGNAL ANALYSIS OF A REFERENCE FILE — in the browser, offline. Nothing
// leaves the machine and no vendor is called: this is the open-source path the
// owner chose over the retired cloud read (2026-10-03, ./audioRefs.ts).
//
// Onset-envelope autocorrelation for tempo, Goertzel chroma against the
// Krumhansl profiles for key, RMS for energy and a zero-crossing proxy for
// brightness — the same family of measurement librosa makes, ported verbatim
// from the contest entry's core.js#analyzeFile. It reads at most 60 s, starting
// 15% in, so an intro does not decide the tempo.

export type Stage = "decode" | "tempo" | "key" | "spectrum" | "done";
export const STAGES: readonly Exclude<Stage, "done">[] = ["decode", "tempo", "key", "spectrum"];

export interface Analysis {
  name: string;
  tempo: number;
  key: string;
  keyConfidence: number;
  energy: "high" | "medium" | "low";
  /** The RMS the band is read off, 0..1 — the figure the sound store keeps
   *  (lib/sound/types.ts MeasuredSound.energy); the band is `energyBand(rms)`. */
  rms: number;
  centroidHz: number;
  brightness: "bright" | "balanced" | "dark";
  duration: number;
  peaks: number[];
  method: string;
}

const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

/** The Library's energy word for an RMS. One threshold pair, read by the
 *  analyser and by the store adapter (./soundAdapter.ts), so a take measured
 *  in the lab and one measured here name the same band. */
export function energyBand(rms: number): "high" | "medium" | "low" {
  return rms > 0.2 ? "high" : rms > 0.09 ? "medium" : "low";
}

function corr(a: number[], b: number[]): number {
  const ma = a.reduce((x, y) => x + y) / 12;
  const mb = b.reduce((x, y) => x + y) / 12;
  let n = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < 12; i++) {
    n += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return n / Math.sqrt(da * db || 1);
}

/** Yield to the browser between stages so the stage chips can paint. */
const tick = () => new Promise((r) => setTimeout(r, 30));

export async function analyzeFile(file: File, onStage: (s: Stage) => void): Promise<Analysis> {
  onStage("decode");
  const AC =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  let buf: AudioBuffer;
  try {
    buf = await ctx.decodeAudioData(await file.arrayBuffer());
  } finally {
    void ctx.close();
  }
  await tick();
  // mono, downsampled to ~11 kHz, at most 60 s from 15% in
  const sr0 = buf.sampleRate;
  const ch = buf.numberOfChannels;
  const step = Math.max(1, Math.round(sr0 / 11025));
  const sr = sr0 / step;
  const start = Math.floor(buf.length * 0.15);
  const len = Math.min(Math.floor((buf.length - start) / step), Math.floor(sr * 60));
  const x = new Float32Array(len);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) x[i] += d[start + i * step] / ch;
  }

  onStage("tempo");
  await tick();
  const hop = 256;
  const frames = Math.floor(len / hop);
  const env = new Float32Array(frames);
  let prev = 0;
  for (let f = 0; f < frames; f++) {
    let e = 0;
    for (let i = 0; i < hop; i++) e += x[f * hop + i] ** 2;
    e = Math.log(1 + 100 * e);
    env[f] = Math.max(0, e - prev);
    prev = e;
  }
  const fps = sr / hop;
  let bestBpm = 0;
  let bestV = -1;
  for (let bpm = 60; bpm <= 180; bpm += 0.5) {
    const lag = (60 / bpm) * fps;
    let v = 0;
    for (let f = 0; f + lag * 2 < frames; f++) v += env[f] * env[Math.round(f + lag)];
    // a mild prior around 120, as librosa's beat tracker uses
    v *= Math.exp((-0.5 * Math.log2(bpm / 120) ** 2) / 0.8);
    if (v > bestV) {
      bestV = v;
      bestBpm = bpm;
    }
  }

  onStage("key");
  await tick();
  const chroma = new Array<number>(12).fill(0);
  const win = 2048;
  for (let s = 0; s + win < len; s += win * 4) {
    for (let pc = 0; pc < 12; pc++) {
      for (let oct = 2; oct <= 5; oct++) {
        const f = 440 * Math.pow(2, (pc - 9) / 12 + (oct - 4));
        const cw = 2 * Math.cos((2 * Math.PI * f) / sr);
        let s1 = 0;
        let s2 = 0;
        for (let i = 0; i < win; i++) {
          const s0 = x[s + i] + cw * s1 - s2;
          s2 = s1;
          s1 = s0;
        }
        chroma[pc] += s1 * s1 + s2 * s2 - cw * s1 * s2;
      }
    }
  }
  let key = "C major";
  let kv = -2;
  for (let r = 0; r < 12; r++) {
    const rot = chroma.slice(r).concat(chroma.slice(0, r));
    const a = corr(rot, MAJ);
    const b = corr(rot, MIN);
    if (a > kv) {
      kv = a;
      key = `${NOTES[r]} major`;
    }
    if (b > kv) {
      kv = b;
      key = `${NOTES[r]} minor`;
    }
  }

  onStage("spectrum");
  await tick();
  let rms = 0;
  for (let i = 0; i < len; i++) rms += x[i] * x[i];
  rms = Math.sqrt(rms / Math.max(1, len));
  // centroid by a zero-crossing proxy: cheap, and monotonic with brightness
  let zc = 0;
  for (let i = 1; i < len; i++) if (x[i] >= 0 !== x[i - 1] >= 0) zc++;
  const centroidHz = Math.floor(zc / 2 / (Math.max(1, len) / sr));
  const peaks: number[] = [];
  const n = 120;
  const d0 = buf.getChannelData(0);
  for (let p = 0; p < n; p++) {
    let m = 0;
    const a = Math.floor((p / n) * buf.length);
    const b = Math.floor(((p + 1) / n) * buf.length);
    for (let i = a; i < b; i += 64) m = Math.max(m, Math.abs(d0[i]));
    peaks.push(m);
  }
  const mx = Math.max(...peaks, 0.001);
  onStage("done");
  return {
    name: file.name.replace(/\.[a-z0-9]+$/i, ""),
    tempo: bestBpm,
    key,
    keyConfidence: kv,
    energy: energyBand(rms),
    rms: Math.min(1, Math.round(rms * 10000) / 10000),
    centroidHz,
    brightness: centroidHz > 2600 ? "bright" : centroidHz > 1200 ? "balanced" : "dark",
    duration: buf.duration,
    peaks: peaks.map((p) => p / mx),
    method: "onset autocorr · goertzel chroma",
  };
}
