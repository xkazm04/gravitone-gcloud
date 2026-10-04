// THE BAKED AUDIO ENVELOPE — one deterministic pass over an uploaded track,
// never a live analyser.
//
// WHY OfflineAudioContext, NOT AudioContext+AnalyserNode. An AnalyserNode pulls
// frequency data at whatever cadence `requestAnimationFrame` happens to fire —
// different on every machine, every tab state, every render. A music video's
// effects are baked against `envelope[frameIndex]` and re-rendered later by a
// headless Playwright capture (this repo's own music-video-project-type idea
// note) that will never run at "live" speed at all. The only representation
// that survives both — a human scrubbing a preview and a frame-by-frame export —
// is a plain array computed once, from the decoded samples, with nothing
// time-of-day about it. `OfflineAudioContext.startRendering()` renders a whole
// buffer as fast as the machine can, with no dropped frames and no clock
// involved, which is what makes the band-energy pass below reproducible.
//
// REAL DURATION, NEVER ESTIMATED. `AudioBuffer.length / AudioBuffer.sampleRate`
// comes from the decoder's own sample count — an mp3 whose header lies about
// its bitrate (common; variable-bitrate files often do) still decodes to the
// right number of samples, which is the only number this module ever reports.
//
// TEMPO IS CANDIDATES, NOT A NUMBER. This repo's own prior measurement (and
// external literature it corroborates) found octave errors — a tempo read at
// half or double the true value — are endemic to onset-interval tempo
// estimators on dense or syncopated material. Collapsing to one BPM here would
// silently pick a coin-flip answer; `estimateTempo` instead returns a base
// estimate plus its half/double siblings and a confidence, and callers must
// treat all three as live candidates.
//
// PURE, DOM/React-FREE above the one browser primitive this task cannot avoid
// (Web Audio decode + offline filter rendering) — no component state, no
// `Date.now()`-seeded randomness, no caller-visible side effects. A canvas
// compositor and a headless Playwright page both already carry a Web Audio
// implementation, so this module runs unmodified in either.

/** One attached track, reduced to what a frame-driven compositor needs to read.
 *
 *  `bands.*` and `flux` are normalized 0..1 against their own peak — a
 *  track-relative "how loud is this moment for THIS track", not an absolute
 *  level, which is what a beat-driven bloom/particle effect wants to drive off.
 *  `onsetFrames` are frame indices (into the same `frameCount`-length axis as
 *  every other array), not seconds — a compositor reading `envelope[i]` reads
 *  all five arrays with the same index. */
export interface AudioEnvelope {
  /** Frames per second the arrays below are resampled to. A parameter, not a
   *  constant: Cut/export (a later work package) renders at whatever fps the
   *  project was baked at, so this travels with the record rather than being
   *  re-guessed downstream. */
  fps: number;
  /** Real duration from decoded sample count — see the module header. */
  durationS: number;
  /** `Math.round(durationS * fps)` — the length every array below shares. */
  frameCount: number;
  /** Per-frame energy, normalized 0..1 per band. Crossovers: low <250Hz,
   *  mid 250Hz-4kHz, high >4kHz — the conventional bass/body/air split for
   *  music (kick+bass energy stays out of the mid band, cymbals/sibilance stay
   *  out of the mid band), picked over a finer multi-band split because the
   *  V1 effect (edge-mask bloom gated on low-band, per the idea note) only
   *  ever reads one band at a time; a third crossover inside "mid" would be
   *  dead data today. */
  bands: { low: number[]; mid: number[]; high: number[] };
  /** Spectral flux per frame, normalized 0..1 against its own peak — "how much
   *  did the spectrum change since last frame", the raw signal onsets are
   *  picked out of. */
  flux: number[];
  /** Frame indices where an onset was detected (local flux peak over an
   *  adaptive threshold). Empty, honestly, for a track with no clear attacks —
   *  see `tempo.confidence` for how a caller should read that case. */
  onsetFrames: number[];
  /** Base tempo plus its half/double siblings — never collapsed to one number.
   *  `confidence` is the fraction of adjacent-onset intervals that agree with
   *  the winning bucket; 0 means no onsets were found at all, which a caller
   *  must render as a stated low-confidence state, not a silent flat line. */
  tempo: { baseBpm: number; halfBpm: number; doubleBpm: number; confidence: number };
}

/** Thrown by `analyzeAudioEnvelope` for a file that does not decode as audio —
 *  an HONEST failure, never swallowed into a flat/empty envelope. */
export class AudioDecodeError extends Error {
  constructor(message: string, readonly cause_?: unknown) {
    super(message);
    this.name = "AudioDecodeError";
  }
}

const LOW_CROSSOVER_HZ = 250;
const HIGH_CROSSOVER_HZ = 4000;
/** STFT window for flux/onset — a standard size for music-rate analysis at
 *  typical sample rates (46-93ms at 44.1-48kHz), long enough to resolve bass
 *  content, short enough to localize a drum hit. */
const FFT_SIZE = 2048;
const MIN_BPM = 40;
const MAX_BPM = 220;

/** Decode the uploaded file's bytes into an `AudioBuffer`, once.
 *
 *  `OfflineAudioContext` rather than a live `AudioContext`: decoding does not
 *  need a destination or a running clock, and an offline context is the one
 *  that also exists in a headless Playwright page with no speakers attached. */
async function decodeAudio(file: File, sampleRate: number): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  // Length/channel count here are throwaway — decodeAudioData ignores this
  // context's own destination graph and returns a buffer at `sampleRate`
  // regardless of the placeholder length.
  const ctx = new OfflineAudioContext(1, 1, sampleRate);
  try {
    // Some browsers mutate the ArrayBuffer passed to decodeAudioData; slicing
    // keeps `bytes` available if a caller ever wants the raw file again.
    return await ctx.decodeAudioData(bytes.slice(0));
  } catch (e) {
    throw new AudioDecodeError(
      `"${file.name}" does not decode as audio — ${e instanceof Error ? e.message : String(e)}`,
      e,
    );
  }
}

/** Render one band of `buffer` through an offline filter graph and return the
 *  rendered samples. A fresh `OfflineAudioContext` per band — contexts are
 *  single-render, and three independent renders are the cost of computing
 *  three independent filters deterministically rather than approximating all
 *  three from one FFT pass. */
async function renderBand(
  buffer: AudioBuffer,
  build: (ctx: OfflineAudioContext, source: AudioBufferSourceNode) => AudioNode,
): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, buffer.length, buffer.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const tail = build(ctx, source);
  tail.connect(ctx.destination);
  source.start(0);
  return ctx.startRendering();
}

const lowBand = (ctx: OfflineAudioContext, source: AudioBufferSourceNode): AudioNode => {
  const f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = LOW_CROSSOVER_HZ;
  source.connect(f);
  return f;
};

const highBand = (ctx: OfflineAudioContext, source: AudioBufferSourceNode): AudioNode => {
  const f = ctx.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = HIGH_CROSSOVER_HZ;
  source.connect(f);
  return f;
};

/** Mid is everything LOW_CROSSOVER_HZ..HIGH_CROSSOVER_HZ — a highpass feeding a
 *  lowpass in series, rather than a single bandpass node, so the two edges are
 *  the exact crossovers the low/high bands already use (a bandpass node's
 *  single center+Q cannot name two independent edges). */
const midBand = (ctx: OfflineAudioContext, source: AudioBufferSourceNode): AudioNode => {
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = LOW_CROSSOVER_HZ;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = HIGH_CROSSOVER_HZ;
  source.connect(hp).connect(lp);
  return lp;
};

/** RMS energy per `frameCount` window over a rendered band buffer, normalized
 *  0..1 against its own peak. A silent band (peak 0) comes back all-zero
 *  rather than NaN. */
function energyPerFrame(buffer: AudioBuffer, frameCount: number): number[] {
  const data = buffer.getChannelData(0);
  const hop = data.length / frameCount;
  const raw: number[] = new Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const start = Math.floor(i * hop);
    const end = Math.max(start + 1, Math.floor((i + 1) * hop));
    let sum = 0;
    for (let j = start; j < end && j < data.length; j++) sum += data[j] * data[j];
    raw[i] = Math.sqrt(sum / Math.max(1, end - start));
  }
  const peak = Math.max(...raw, 0);
  return peak > 0 ? raw.map((v) => v / peak) : raw.map(() => 0);
}

/** Down-mix every channel to one, averaged — the flux/onset pass reads the
 *  whole spectrum, not a per-band split, so stereo width is not meaningful to
 *  it either way. */
function toMono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

/** In-place iterative radix-2 Cooley-Tukey FFT. `re`/`im` length must be a
 *  power of two. No library dependency — this module stays free of anything
 *  that cannot also run inside a headless Playwright page with no network. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curWr = 1;
      let curWi = 0;
      for (let k = 0; k < len / 2; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + len / 2] * curWr - im[i + k + len / 2] * curWi;
        const vIm = re[i + k + len / 2] * curWi + im[i + k + len / 2] * curWr;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + len / 2] = uRe - vRe;
        im[i + k + len / 2] = uIm - vIm;
        const nextWr = curWr * wr - curWi * wi;
        curWi = curWr * wi + curWi * wr;
        curWr = nextWr;
      }
    }
  }
}

/** Spectral flux per output frame (half-wave rectified magnitude-spectrum
 *  delta), normalized 0..1, plus the frame indices it peaks at over an
 *  adaptive local threshold. One FFT window per output frame, hopped at the
 *  requested fps — so the flux/onset axis is already the same length and the
 *  same index space as the band-energy arrays, with no separate resampling
 *  step. */
function fluxAndOnsets(
  mono: Float32Array,
  sampleRate: number,
  frameCount: number,
  fps: number,
): { flux: number[]; onsetFrames: number[] } {
  const hop = sampleRate / fps;
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  // Hann window, precomputed once.
  const win = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));

  let prevMag: Float64Array | null = null;
  const rawFlux: number[] = new Array(frameCount).fill(0);

  for (let i = 0; i < frameCount; i++) {
    const start = Math.floor(i * hop - FFT_SIZE / 2);
    re.fill(0);
    im.fill(0);
    for (let j = 0; j < FFT_SIZE; j++) {
      const s = start + j;
      re[j] = s >= 0 && s < mono.length ? mono[s] * win[j] : 0;
    }
    fft(re, im);
    const half = FFT_SIZE / 2;
    const mag = new Float64Array(half);
    for (let k = 0; k < half; k++) mag[k] = Math.hypot(re[k], im[k]);

    if (prevMag) {
      let sum = 0;
      for (let k = 0; k < half; k++) sum += Math.max(0, mag[k] - prevMag[k]);
      rawFlux[i] = sum / half;
    }
    prevMag = mag;
  }

  const peak = Math.max(...rawFlux, 0);
  const flux = peak > 0 ? rawFlux.map((v) => v / peak) : rawFlux.map(() => 0);

  // Adaptive-threshold local-max picking: a frame is an onset if it is the
  // local peak within ±2 frames AND clears its neighbourhood's mean by a
  // margin — a fixed global threshold under- or over-fires depending on how
  // dynamic the track is, which an adaptive window corrects for.
  const RADIUS = 2;
  const K = 1.5;
  const onsetFrames: number[] = [];
  for (let i = 0; i < frameCount; i++) {
    const lo = Math.max(0, i - RADIUS * 4);
    const hi = Math.min(frameCount, i + RADIUS * 4 + 1);
    const window = flux.slice(lo, hi);
    const mean = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / window.length;
    const threshold = mean + K * Math.sqrt(variance);
    if (flux[i] <= threshold || flux[i] <= 0) continue;
    let isLocalMax = true;
    for (let d = 1; d <= RADIUS && isLocalMax; d++) {
      if (flux[i - d] !== undefined && flux[i - d] > flux[i]) isLocalMax = false;
      if (flux[i + d] !== undefined && flux[i + d] > flux[i]) isLocalMax = false;
    }
    if (isLocalMax) onsetFrames.push(i);
  }

  return { flux, onsetFrames };
}

/** Base tempo + half/double candidates from onset spacing — see the module
 *  header for why this never collapses to one number. `confidence` is 0 for
 *  fewer than two onsets: there is no interval to measure, and a caller must
 *  show that honestly rather than a default BPM. */
function estimateTempo(onsetFrames: number[], fps: number): AudioEnvelope["tempo"] {
  if (onsetFrames.length < 2) return { baseBpm: 0, halfBpm: 0, doubleBpm: 0, confidence: 0 };

  // Histogram of the BPM implied by every pair of CONSECUTIVE onsets, binned
  // to the nearest whole BPM and clamped to a plausible musical range — the
  // clamp only affects which bin an interval votes into, never whether the
  // onset itself was real.
  const bins = new Map<number, number>();
  let total = 0;
  for (let i = 1; i < onsetFrames.length; i++) {
    const ioiS = (onsetFrames[i] - onsetFrames[i - 1]) / fps;
    if (ioiS <= 0) continue;
    let bpm = Math.round(60 / ioiS);
    while (bpm < MIN_BPM) bpm *= 2;
    while (bpm > MAX_BPM) bpm = Math.round(bpm / 2);
    bins.set(bpm, (bins.get(bpm) ?? 0) + 1);
    total++;
  }
  if (total === 0) return { baseBpm: 0, halfBpm: 0, doubleBpm: 0, confidence: 0 };

  let baseBpm = MIN_BPM;
  let bestCount = 0;
  for (const [bpm, count] of bins) {
    if (count > bestCount) {
      bestCount = count;
      baseBpm = bpm;
    }
  }
  return {
    baseBpm,
    halfBpm: baseBpm / 2,
    doubleBpm: baseBpm * 2,
    confidence: bestCount / total,
  };
}

/**
 * Decode `file` once and bake its envelope — the one analysis every effects
 * frame and every exported frame reads from, never recomputed live.
 *
 * `fps` defaults to 30: this repo's export target is mass-market web video
 * (the idea note's YouTube spec research), where 30fps is the more common
 * delivery rate than a cinematic 24 and gives a beat-driven effect twice the
 * temporal resolution per second of a typical 120-160 BPM track than 24 would.
 * It is a parameter rather than a constant because Cut/export needs the same
 * number later and must read it off this record rather than re-guess it.
 */
export async function analyzeAudioEnvelope(
  file: File,
  opts?: { fps?: number; sampleRate?: number },
): Promise<AudioEnvelope> {
  const fps = opts?.fps ?? 30;
  const sampleRate = opts?.sampleRate ?? 48000;

  const buffer = await decodeAudio(file, sampleRate);
  const durationS = buffer.length / buffer.sampleRate;
  const frameCount = Math.max(1, Math.round(durationS * fps));

  const [lowBuf, midBuf, highBuf] = await Promise.all([
    renderBand(buffer, lowBand),
    renderBand(buffer, midBand),
    renderBand(buffer, highBand),
  ]);

  const bands = {
    low: energyPerFrame(lowBuf, frameCount),
    mid: energyPerFrame(midBuf, frameCount),
    high: energyPerFrame(highBuf, frameCount),
  };

  const mono = toMono(buffer);
  const { flux, onsetFrames } = fluxAndOnsets(mono, buffer.sampleRate, frameCount, fps);
  const tempo = estimateTempo(onsetFrames, fps);

  return { fps, durationS, frameCount, bands, flux, onsetFrames, tempo };
}
