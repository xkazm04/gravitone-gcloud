// A SONG, HEARD IN THE BROWSER (spark track-mirror-studio): peaks and loudness are computed here from the bytes
// the page already holds, never by a server read - this box's PYTHON has no librosa, and the section picker must
// not depend on it. A file just dropped decodes from itself; a cover reloaded later has no local file and
// decodes from its sourceUrl. One decode per address, kept for the page's life.
import { errorMessage } from "@gt/domain/errors";

export type Heard = {
  readonly lenS: number;
  readonly peaks: readonly number[];
  /** Root-mean-square level of a span, 0..1 full scale. */
  readonly rms: (fromS: number, toS: number) => number;
};

export type HeardAnswer = { readonly ok: true; readonly value: Heard } | { readonly ok: false; readonly error: string };

/** Bars across the strip: enough for a section's edges to land on a bar at a 1920 px screen. */
export const PEAK_BARS = 480;

/** One mono channel's peaks, normalised so the loudest bar is full height. */
export function peaksOf(mono: Float32Array, bars: number): number[] {
  if (mono.length === 0 || bars <= 0) return [];
  const per = mono.length / bars;
  const out: number[] = [];
  let top = 0;
  for (let i = 0; i < bars; i++) {
    let m = 0;
    const from = Math.floor(i * per);
    const to = Math.min(mono.length, Math.floor((i + 1) * per));
    for (let j = from; j < to; j++) {
      const v = Math.abs(mono[j] ?? 0);
      if (v > m) m = v;
    }
    out.push(m);
    if (m > top) top = m;
  }
  return top === 0 ? out : out.map((p) => Math.round((p / top) * 1000) / 1000);
}

export function rmsOf(mono: Float32Array, rate: number, fromS: number, toS: number): number {
  const a = Math.max(0, Math.floor(fromS * rate));
  const b = Math.min(mono.length, Math.floor(toS * rate));
  if (b <= a) return 0;
  // Every fourth sample is plenty for a level, and a six-minute song stays inside a frame's budget.
  let sum = 0;
  let n = 0;
  for (let i = a; i < b; i += 4) {
    const v = mono[i] ?? 0;
    sum += v * v;
    n++;
  }
  return n === 0 ? 0 : Math.sqrt(sum / n);
}

function mixDown(buf: AudioBuffer): Float32Array {
  const n = buf.numberOfChannels;
  if (n === 1) return buf.getChannelData(0);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < n; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] = (out[i] ?? 0) + (d[i] ?? 0) / n;
  }
  return out;
}

async function decode(bytes: ArrayBuffer): Promise<Heard> {
  const ctx = new OfflineAudioContext(1, 1, 44_100);
  const buf = await ctx.decodeAudioData(bytes);
  const mono = mixDown(buf);
  return { lenS: buf.duration, peaks: peaksOf(mono, PEAK_BARS), rms: (f, t) => rmsOf(mono, buf.sampleRate, f, t) };
}

const heard = new Map<string, Promise<HeardAnswer>>();

const settle = (p: Promise<Heard>): Promise<HeardAnswer> =>
  p.then(
    (value): HeardAnswer => ({ ok: true, value }),
    (e: unknown): HeardAnswer => ({ ok: false, error: `decodeAudioData: ${errorMessage(e)}` }),
  );

/** A dropped file, decoded under the key it will be read back by (its cover's id once uploaded). */
export function hearFile(key: string, file: Blob): Promise<HeardAnswer> {
  const p = settle(file.arrayBuffer().then(decode));
  heard.set(key, p);
  return p;
}

/** Carry a dropped file's decode over to the id the upload answered. */
export function rekey(from: string, to: string): void {
  const p = heard.get(from);
  if (p !== undefined) heard.set(to, p);
}

export function hearUrl(url: string, key: string = url): Promise<HeardAnswer> {
  const had = heard.get(key);
  if (had !== undefined) return had;
  const p = settle(
    fetch(url, { credentials: "same-origin" }).then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} · ${url.split("?")[0] ?? url}`);
      return decode(await res.arrayBuffer());
    }),
  );
  heard.set(key, p);
  // A failed read is not kept: the next mount asks again.
  void p.then((a) => {
    if (!a.ok) heard.delete(key);
  });
  return p;
}

/** The level every side is turned down to: quieter than any mastered song, so nothing is turned up past 1. */
export const LEVEL_TARGET_RMS = 0.06;

export const levelFor = (rms: number | undefined): number => (rms === undefined || rms <= 0 ? 0.5 : Math.min(1, LEVEL_TARGET_RMS / rms));
