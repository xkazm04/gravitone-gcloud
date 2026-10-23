// THE KEYFRAME GATES, PURE - pipeline/vlm-probe/ingest.py's sampling and keeping
// rules, ported line for line where Node can, so the /scout ingest keeps the
// frames the corpus study kept and throws the ones it threw. No process is
// spawned here: lib/foundry/scout/ingest.ts runs ffmpeg and hands these
// functions its text and its pixels, so the rules are tested on recorded output.
//
// What the python said and this keeps (ingest.py:13-18): extraction is cheap and
// annotation is not, and a wrong frame costs the corpus more than a missing one -
// a dissolve is two shots averaged into a composition that was never on screen,
// and a near-black fade has no cinematography in it at all. The thresholds are
// "deliberately permissive" (ingest.py:45-48): stylised animation is flat, dark
// and soft in ways live action is not, so the gates reject the indefensible only.
//
// ONE DEVIATION, MEASURED BY CONSTRUCTION RATHER THAN HIDDEN: the python's dHash
// resized the full frame to 9x8 with PIL's bicubic (ingest.py:120). Here the 9x8
// is a box average of the 160x90 grey thumbnail the other two gates already read
// (ffmpeg makes ONE thumbnail per frame, not two). A box average of a bicubic
// thumbnail is a smoother 9x8 than PIL's direct bicubic, so grain and compression
// noise move fewer bits: two frames of one held shot tend to land closer, and the
// duplicate gate leans toward throwing a repeat rather than keeping one. The
// threshold is the python's; it was not re-tuned for the smoother hash.

/** `select='gt(scene,T)'` - the python's default threshold (ingest.py:258). */
export const SCENE_THRESHOLD = 0.3;
/** Frames are scaled to at most this width before they are written (ingest.py:88, 98). */
export const MAX_FRAME_WIDTH = 1280;
/** Near-uniform frame: fades, blackouts, flash transitions (ingest.py:50). */
export const BLANK_STD = 12.0;
/** Almost no edge energy: dissolves, heavy motion smear (ingest.py:51). */
export const EDGE_MIN = 1.6;
/** dHash distance under which two frames are the same shot (ingest.py:52). */
export const DUP_HAMMING = 6;
/** The thumbnail the gates measure on (ingest.py:132 `resize((160, 90))`). */
export const MEASURE_W = 160;
export const MEASURE_H = 90;
/** A night keeps at most this many keyframes per video (spark media-training-loop, wave 4). */
export const MAX_KEYFRAMES = 24;

/** The ffmpeg `-vf` that samples the cuts and stamps each frame's time (ingest.py:95-98). */
export const sceneFilter = (threshold: number = SCENE_THRESHOLD, maxWidth: number = MAX_FRAME_WIDTH): string =>
  `select='gt(scene,${threshold})',showinfo,scale='min(${maxWidth},iw)':-2`;

/**
 * Every `pts_time:` showinfo printed, in frame order (ingest.py:103). Without the
 * timestamp a frame is un-locatable in the source, "and an annotation you cannot
 * trace back to a moment is not evidence" (ingest.py:84-87).
 */
export function ptsTimes(stderr: string): number[] {
  const out: number[] = [];
  for (const m of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export type Measure = { readonly std: number; readonly edge: number; readonly hash: bigint };

/** 160x90 grey bytes -> the three numbers the gates read (ingest.py:130-136). */
export function measureGray(px: Uint8Array, w: number = MEASURE_W, h: number = MEASURE_H): Measure {
  const n = w * h;
  if (px.byteLength < n) throw new RangeError(`a ${w}x${h} grey frame is ${n} bytes; got ${px.byteLength}`);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += px[i] ?? 0;
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) sq += ((px[i] ?? 0) - mean) ** 2;
  // numpy's std is the population deviation (ddof 0).
  const std = Math.sqrt(sq / n);
  let gx = 0;
  let gy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = px[y * w + x] ?? 0;
      if (x + 1 < w) gx += Math.abs((px[y * w + x + 1] ?? 0) - v);
      if (y + 1 < h) gy += Math.abs((px[(y + 1) * w + x] ?? 0) - v);
    }
  }
  const edge = (gx / (h * (w - 1)) + gy / ((h - 1) * w)) / 2;
  return { std, edge, hash: dhash(px, w, h) };
}

/** The difference hash: a 9x8 grey, each pixel against its left neighbour (ingest.py:118-122). */
export function dhash(px: Uint8Array, w: number, h: number, size = 8): bigint {
  const cols = size + 1;
  const g: number[] = [];
  for (let r = 0; r < size; r++) {
    const y0 = Math.floor((r * h) / size);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * h) / size));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * w) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * w) / cols));
      let s = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += px[y * w + x] ?? 0;
      g.push(s / ((y1 - y0) * (x1 - x0)));
    }
  }
  let bits = 0n;
  for (let r = 0; r < size; r++) {
    for (let c = 1; c < cols; c++) bits = (bits << 1n) | ((g[r * cols + c] ?? 0) > (g[r * cols + c - 1] ?? 0) ? 1n : 0n);
  }
  return bits;
}

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x > 0n) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

export type Candidate<T> = { readonly frame: T; readonly at: number; readonly measure: Measure };
export type ThrowReason = "blank" | "no-detail" | "duplicate";
export type Gated<T> = { readonly kept: Candidate<T>[]; readonly thrown: { readonly frame: T; readonly at: number; readonly reason: ThrowReason }[] };

/** Apply the gates in order: blank, then no detail, then a repeat of a kept shot (ingest.py:139-153). */
export function keepOrThrow<T>(frames: readonly Candidate<T>[]): Gated<T> {
  const kept: Candidate<T>[] = [];
  const thrown: Gated<T>["thrown"] = [];
  const seen: bigint[] = [];
  for (const f of frames) {
    if (f.measure.std < BLANK_STD) {
      thrown.push({ frame: f.frame, at: f.at, reason: "blank" });
      continue;
    }
    if (f.measure.edge < EDGE_MIN) {
      thrown.push({ frame: f.frame, at: f.at, reason: "no-detail" });
      continue;
    }
    if (seen.some((h) => hamming(h, f.measure.hash) <= DUP_HAMMING)) {
      thrown.push({ frame: f.frame, at: f.at, reason: "duplicate" });
      continue;
    }
    seen.push(f.measure.hash);
    kept.push(f);
  }
  return { kept, thrown };
}

/** Cap a list evenly across the runtime (ingest.py:229-232 `--max-frames`). */
export function spreadEvenly<T>(xs: readonly T[], max: number): T[] {
  if (max <= 0 || xs.length <= max) return [...xs];
  const step = xs.length / max;
  return Array.from({ length: max }, (_, i) => xs[Math.floor(i * step)] as T);
}

/** "blank 2, duplicate 5" - the thrown frames counted by reason, for a source's sentence. */
export function thrownTally(thrown: readonly { readonly reason: ThrowReason }[]): string {
  const counts = new Map<ThrowReason, number>();
  for (const t of thrown) counts.set(t.reason, (counts.get(t.reason) ?? 0) + 1);
  return [...counts].map(([r, n]) => `${r} ${n}`).join(", ") || "none";
}
