// THE COMPOSITOR'S PURE HALF — no DOM beyond a `CanvasRenderingContext2D` it is
// handed, no component state, no `Date.now()`, no `Math.random()`. Every value
// drawn here is a function of its own arguments, which is the whole point:
// `seek-stable-composition-authoring` (the registry's own words, carried in
// `.vault/Spark/ideas/music-video-project-type.md`) requires "every value a
// frame shows must be derivable from the frame index alone", because the same
// component is rendered twice — once live, in a browser, scrubbing a preview;
// once headless, by Playwright, frame-by-frame for export (WP5) — and the two
// must draw pixel-identical output for the same `frameIndex`. A canvas call
// that reached outside its arguments (the wall clock, a running RNG, a ref that
// remembers the last frame) would agree with itself in the first case and
// disagree with its own export.
//
// WHAT IS DETERMINISTIC HERE AND WHY:
//   · the edge mask is computed ONCE, outside this module, from the poster's
//     own pixels — same bytes in, same mask out, every time (see
//     `computeEdgeMask` below, which IS exported from here but is itself pure:
//     same `ImageData` in, same `EdgeMask` out).
//   · the particle field is SEEDED, and seeded in the way the brief's own
//     warning calls out: a particle's state at frame N must depend only on
//     `(seed, frameIndex)`, never on how many frames were rendered before it in
//     this session. See `particleAt` — it derives a particle's birth position,
//     velocity and lifetime from `(seed, particleIndex)` ONCE (a pure hash, not
//     a running generator), then computes its position at `frameIndex` by
//     taking `frameIndex`'s elapsed time modulo that lifetime. There is no
//     "advance the simulation one tick" anywhere in this file — advancing is
//     arithmetic over `frameIndex`, not state carried from the previous call.
//   · the flash-rate cap (`limitFlashRate`) runs ONCE over the whole baked
//     `bands.low` array (a pure array transform), not frame-by-frame during
//     render — so `renderFrame` always reads an already-safe channel and never
//     has to remember how many flashes it has already drawn this session.

/* ───────────────────────────── seeded PRNG ──────────────────────────────── */

/** mulberry32 — a small, fast, deterministic PRNG. Re-seeding it with the same
 *  32-bit integer always produces the same sequence, which is the one property
 *  this module needs from a PRNG; it does not need to be cryptographically
 *  strong. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next() {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Combine the composition's seed with a particle's index into one 32-bit
 *  integer, deterministically. Not cryptographic — just well-mixed enough that
 *  adjacent particle indices do not produce visibly correlated draws. */
function hashSeed(seed: number, index: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ index, 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/* ───────────────────────────── edge detection ───────────────────────────── */

export interface EdgeMask {
  width: number;
  height: number;
  /** 0..1 per pixel, row-major, length `width*height`. */
  data: Float32Array;
}

/** Sobel magnitude over luminance, normalized 0..1 against its own peak.
 *
 *  SOBEL OVER DOG: picked because it is a single, well-understood kernel pair
 *  (Gx/Gy) with no scale parameter to tune — a difference-of-Gaussians edge
 *  mask needs two blur radii chosen relative to the poster's resolution, which
 *  would be one more knob this module would have to get right for every
 *  possible poster size. Sobel's 3x3 kernel is scale-free and the "poster
 *  outline reacting to the beat" effect this module draws does not need
 *  multi-scale edges — the compositor only ever reads ONE mask per poster, so
 *  Sobel's single pass is also the cheaper computation to run once.
 *
 *  PURE: same `image` in, same `EdgeMask` out, every call — nothing here reads
 *  anything but its own argument. */
export function computeEdgeMask(image: ImageData): EdgeMask {
  const { width, height, data } = image;
  const lum = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    // Rec. 601 luma weights — standard, and the only thing this function needs
    // from "how bright is this pixel" rather than "what colour is it".
    lum[p] = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
  }

  const out = new Float32Array(width * height);
  const at = (x: number, y: number) => lum[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))];

  let peak = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const mag = Math.hypot(gx, gy);
      out[y * width + x] = mag;
      if (mag > peak) peak = mag;
    }
  }
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] /= peak;
  return { width, height, data: out };
}

/* ───────────────────────────── flash-rate cap ───────────────────────────── */

/**
 * WCAG 2.3.1's general photosensitivity guidance — no more than three
 * "general flashes" per second — applied to the one channel that drives this
 * compositor's additive bloom: `envelope.bands.low`. Neither the registry nor
 * the external research covered a beat-pulsed-effect-specific number (see the
 * idea note's scout digest), so this carries the general web-accessibility
 * ceiling in rather than inventing a bespoke one.
 *
 * METHOD: a crossing is a RISING EDGE over `threshold` (the band value goes
 * from below the line to at-or-above it) — that is what "a flash" means for a
 * brightness channel: the transition INTO full contrast, not every frame spent
 * there. A sliding window of `fps` frames (one second, since `envelope.fps` is
 * this track's own frame rate) counts how many risings have already been let
 * through; a rising that would be the 4th in that window is clamped to just
 * under the threshold instead — the low-band value for that frame is
 * SMOOTHED, not the opacity it drives downstream, so every consumer of the
 * returned array inherits the same safety ceiling without re-deriving it.
 *
 * ONE PASS, ONE TIME, OVER THE WHOLE TRACK — not evaluated per rendered frame.
 * That is what keeps the render path pure: `renderFrame` below reads
 * `boundedLow[frameIndex]`, a plain array lookup, rather than asking "how many
 * flashes has this session already shown", which would need to remember
 * rendering history and break the "frame index alone" law this whole module
 * exists to satisfy.
 */
export function limitFlashRate(
  low: number[],
  fps: number,
  threshold = 0.6,
  maxPerWindow = 3,
): number[] {
  const out = new Array<number>(low.length);
  const windowFrames = Math.max(1, Math.round(fps));
  // Frame indices (in OUTPUT terms) of risings still inside the trailing window.
  let recent: number[] = [];
  let prevOut = 0;
  for (let i = 0; i < low.length; i++) {
    let v = low[i];
    recent = recent.filter((f) => i - f < windowFrames);
    const rising = v >= threshold && prevOut < threshold;
    if (rising && recent.length >= maxPerWindow) {
      // Clamp just under the line: the moment is still audible in a slightly
      // dimmer bloom, it just never crosses into what this cap counts as a
      // full-contrast flash.
      v = Math.min(v, threshold - 0.001);
    } else if (rising) {
      recent.push(i);
    }
    out[i] = v;
    prevOut = v;
  }
  return out;
}

/* ───────────────────────────── particle field ───────────────────────────── */

export interface EffectParams {
  /** Schema version — stamped so a future default change never reinterprets a
   *  composition saved under an earlier set of numbers (WP5 reads this record
   *  for export and must reproduce exactly what the user saw). */
  version: 1;
  edgeThreshold: number;
  bloomIntensity: number;
  bloomBlurPasses: number;
  particleCount: number;
  /** Fraction of the canvas's shorter side crossed per second, at speed 1. */
  particleSpeed: number;
  particleLifetimeMinS: number;
  particleLifetimeMaxS: number;
  flashThreshold: number;
  flashMaxPerWindow: number;
}

export const DEFAULT_EFFECT_PARAMS: EffectParams = {
  version: 1,
  edgeThreshold: 0.12,
  bloomIntensity: 0.9,
  bloomBlurPasses: 3,
  particleCount: 140,
  particleSpeed: 0.05,
  particleLifetimeMinS: 3,
  particleLifetimeMaxS: 8,
  flashThreshold: 0.6,
  flashMaxPerWindow: 3,
};

interface Particle {
  x0: number;
  y0: number;
  vx: number;
  vy: number;
  lifetimeS: number;
  phase: number;
}

/** A particle's own constants, derived ONCE from `(seed, index)` — never from
 *  `frameIndex`, and never carried in mutable state. `particleAt` below calls
 *  this fresh on every invocation; it is cheap (one PRNG, six draws) and
 *  keeping it stateless is what makes "frame N's particle state depends only
 *  on seed and frameIndex" true by construction rather than by discipline. */
function particleConstants(seed: number, index: number, params: EffectParams): Particle {
  const rng = mulberry32(hashSeed(seed, index));
  const angle = rng() * Math.PI * 2;
  const speed = params.particleSpeed * (0.5 + rng());
  return {
    x0: rng(),
    y0: rng(),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    lifetimeS: params.particleLifetimeMinS + rng() * (params.particleLifetimeMaxS - params.particleLifetimeMinS),
    phase: rng(),
  };
}

const wrap01 = (v: number) => v - Math.floor(v);

/** Where particle `index` is at `frameIndex`, and how visible it is — a pure
 *  function of `(seed, index, frameIndex, fps, params)`. Position loops
 *  through the particle's own lifetime via modulo arithmetic over elapsed
 *  seconds, which is what makes it independent of render history: the "which
 *  lap of its loop is this particle on" question is answered by division, not
 *  by remembering the previous lap. */
export function particleAt(
  seed: number,
  index: number,
  frameIndex: number,
  fps: number,
  params: EffectParams,
): { x: number; y: number; opacity: number } {
  const p = particleConstants(seed, index, params);
  const tSec = frameIndex / fps;
  const age = ((tSec + p.phase * p.lifetimeS) % p.lifetimeS + p.lifetimeS) % p.lifetimeS;
  const frac = age / p.lifetimeS;
  const x = wrap01(p.x0 + p.vx * age);
  const y = wrap01(p.y0 + p.vy * age);
  // Fade in, fade out over its own lifetime rather than popping in and out.
  const opacity = Math.sin(Math.PI * frac);
  return { x, y, opacity: Math.max(0, opacity) };
}

/* ──────────────────── the bloom texture (built once, not per frame) ─────── */

/**
 * Blur + threshold + tint the edge mask into a drawable canvas, ONCE per
 * poster — this is the "cache this" the brief asks for. `renderFrame` below
 * only ever adjusts this texture's ALPHA per frame (from the flash-safe low
 * band); it never re-blurs or re-thresholds it, which is what keeps a
 * beat-reactive bloom cheap enough to run every preview frame.
 *
 * Pure: same `edgeMask` + `params` in, same canvas pixels out.
 */
export function buildBloomTexture(edgeMask: EdgeMask, params: EffectParams, rgb: readonly [number, number, number] = [200, 230, 255]): HTMLCanvasElement {
  const blurred = boxBlur(edgeMask.data, edgeMask.width, edgeMask.height, params.bloomBlurPasses);
  const canvas = document.createElement("canvas");
  canvas.width = edgeMask.width;
  canvas.height = edgeMask.height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(edgeMask.width, edgeMask.height);
  for (let i = 0; i < blurred.length; i++) {
    const v = blurred[i] > params.edgeThreshold ? blurred[i] : 0;
    const a = Math.min(255, Math.round(v * 255));
    // A cool cyan-white tint unless a look names its own (a red picture's
    // edges lit cyan-white read as haze, not as its light - Misu Vol 3,
    // 2026-10-30) — additive, so only the alpha channel matters for
    // intensity; colour is a fixed constant, not a reactive value.
    imgData.data[i * 4 + 0] = rgb[0];
    imgData.data[i * 4 + 1] = rgb[1];
    imgData.data[i * 4 + 2] = rgb[2];
    imgData.data[i * 4 + 3] = a;
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/* ───────────────────────────── the frame render ─────────────────────────── */

export interface RenderInput {
  /** The poster, decoded once and reused across every frame. */
  poster: CanvasImageSource;
  posterWidth: number;
  posterHeight: number;
  /** `buildBloomTexture(edgeMask, effectParams)` — built once per poster, see
   *  above. `renderFrame` only ever modulates its alpha. */
  bloomTexture: CanvasImageSource;
  seed: number;
  effectParams: EffectParams;
  fps: number;
  /** `limitFlashRate(envelope.bands.low, envelope.fps, …)` — precomputed ONCE
   *  per envelope, not per frame (see `limitFlashRate`'s own header). */
  boundedLow: number[];
  highBand: number[];
  frameIndex: number;
  /** Dampens particle drift to near-static and disables the simple zoom (there
   *  is none in this build — see the module header) rather than removing the
   *  effect outright, per the registry's "replace, never remove" rule. */
  reducedMotion: boolean;
  /** How the poster meets the canvas. Absent = "contain" (letterboxed, the
   *  studio's own frame). The music-video queue covers its still to 16:9 -
   *  a generated still has no bars worth keeping. */
  fit?: "contain" | "cover";
  /** Particle tint, 0..360. Absent = today's white dust. */
  particleHue?: number;
  /** The one code-drawn element pulsed by the low band (the music-video
   *  queue's treatment places it). Absent = no element, and the frame is
   *  byte-identical to the studio's (mv-render.probe pins that). */
  focal?: FocalInput;
  /** A look's placed light and weather (see `SceneFx`). Absent = the frame is
   *  byte-identical to one rendered before scene effects existed. */
  scene?: SceneFx;
  /** The envelope's mid band, read by the scene's instrument glow. */
  midBand?: number[];
}

export type FocalKind = "halo" | "ring" | "light" | "orb";

/** The focal element as `renderFrame` reads it. Mirrors `MvFocal`
 *  (lib/sound/mv/types.ts) plus the pulse; declared here rather than imported
 *  because this file must transpile in isolation for the export page. */
export interface FocalInput {
  kind: FocalKind;
  /** Centre, normalised to the canvas (0..1). */
  x: number;
  y: number;
  /** Radius against the canvas height (0..1). */
  r: number;
  hue: number;
  /** 0..1 - how far the pulse moves radius and brightness. */
  pulseStrength: number;
  /** `focalPulseTrack(boundedLow, ...)` - precomputed ONCE per envelope. */
  pulse: number[];
}

/* ───────────────────────────── the focal element ───────────────────────── */

/** Attack and release of the pulse, in seconds. A fast attack so the swell
 *  lands ON the kick, a slow release so it exhales between kicks instead of
 *  snapping off - the difference between a pulse and a jitter. */
const FOCAL_ATTACK_S = 0.03;
const FOCAL_RELEASE_S = 0.28;
/** The idle breath: a slow sine under everything, so a quiet passage still
 *  moves and the frame never freezes. Period and depth are small on purpose -
 *  4.5s and under a tenth of the range is breathing, not flashing. */
const FOCAL_BREATH_S = 4.5;
const FOCAL_BREATH_DEPTH = 0.08;
const FOCAL_IDLE = 0.1;

/**
 * The focal element's drive channel: the flash-safe low band through an
 * attack/release follower, then through `limitFlashRate` AGAIN.
 *
 * WHY TWICE. A follower cannot add excursions over the threshold (between two
 * of its own crossings the input must have dipped below the line), but its
 * attack delay can move an edge later and so bunch two edges closer than the
 * input had them. Re-running the cap over the follower's own output makes
 * "<= maxPerWindow per second" a property of the channel the element is
 * actually drawn from, not an argument about it.
 *
 * Pure and whole-track, like `limitFlashRate`: computed once per envelope, so
 * `renderFrame` reads `pulse[frameIndex]` and carries nothing between frames.
 */
export function focalPulseTrack(boundedLow: number[], fps: number, threshold = 0.6, maxPerWindow = 3): number[] {
  const attack = 1 - Math.exp(-1 / Math.max(1e-6, fps * FOCAL_ATTACK_S));
  const release = 1 - Math.exp(-1 / Math.max(1e-6, fps * FOCAL_RELEASE_S));
  const out = new Array<number>(boundedLow.length);
  let y = 0;
  for (let i = 0; i < boundedLow.length; i++) {
    const x = boundedLow[i] ?? 0;
    y += (x > y ? attack : release) * (x - y);
    out[i] = y;
  }
  return limitFlashRate(out, fps, threshold, maxPerWindow);
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const hueOf = (h: number) => (((Number.isFinite(h) ? h : 0) % 360) + 360) % 360;
const hsla = (h: number, s: number, l: number, a: number) =>
  `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${clamp01(a).toFixed(4)})`;

/** Draw the focal element for `frameIndex`. Every value is a function of the
 *  frame index, the precomputed pulse and the element's own constants. */
function drawFocal(ctx: CanvasRenderingContext2D, f: FocalInput, frameIndex: number, fps: number): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const t = frameIndex / fps;
  const breath = FOCAL_IDLE + FOCAL_BREATH_DEPTH * Math.sin((2 * Math.PI * t) / FOCAL_BREATH_S);
  const level = clamp01(breath + clamp01(f.pulseStrength) * (f.pulse[frameIndex] ?? 0));
  const cx = clamp01(f.x) * w;
  const cy = clamp01(f.y) * h;
  const R = Math.max(0.02, Math.min(0.5, Number.isFinite(f.r) ? f.r : 0.15)) * h;
  const hue = hueOf(f.hue);
  const alpha = 0.3 + 0.7 * level;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 1;
  if (f.kind === "halo") {
    const rr = R * (1 + 0.35 * level);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    g.addColorStop(0, hsla(hue, 90, 72, alpha));
    g.addColorStop(0.45, hsla(hue, 90, 60, alpha * 0.45));
    g.addColorStop(1, hsla(hue, 90, 50, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  } else if (f.kind === "ring") {
    const rr = R * (0.9 + 0.18 * level);
    // The ring's glow is a wide faint stroke under a thin bright one, not
    // `shadowBlur`, whose kernel is each browser's own business.
    ctx.lineWidth = Math.max(4, R * (0.18 + 0.12 * level));
    ctx.strokeStyle = hsla(hue, 90, 60, alpha * 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, R * (0.04 + 0.03 * level));
    ctx.strokeStyle = hsla(hue, 95, 78, alpha);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  } else if (f.kind === "light") {
    const rr = R * (1 + 0.5 * level);
    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
    bloom.addColorStop(0, hsla(hue, 80, 85, alpha * 0.8));
    bloom.addColorStop(0.3, hsla(hue, 90, 65, alpha * 0.3));
    bloom.addColorStop(1, hsla(hue, 90, 50, 0));
    ctx.fillStyle = bloom;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
    // Six rays turning slowly with the frame clock: the angle is arithmetic
    // over `t`, never an accumulated rotation.
    const turn = t * 0.12;
    const len = R * (1.2 + 0.8 * level);
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(1.5, R * 0.025);
    for (let k = 0; k < 6; k++) {
      const ang = turn + (k * Math.PI) / 3;
      const ex = cx + Math.cos(ang) * len;
      const ey = cy + Math.sin(ang) * len;
      const ray = ctx.createLinearGradient(cx, cy, ex, ey);
      ray.addColorStop(0, hsla(hue, 80, 85, alpha * 0.6));
      ray.addColorStop(1, hsla(hue, 80, 70, 0));
      ctx.strokeStyle = ray;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
    const cr = R * 0.22 * (1 + 0.5 * level);
    const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    core.addColorStop(0, hsla(hue, 30, 97, alpha + 0.2));
    core.addColorStop(1, hsla(hue, 60, 85, 0));
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // ORB: a filled sphere (source-over: it occludes the still) lit from the
    // upper left, inside an additive glow that carries most of the pulse.
    const rr = R * (1 + 0.12 * level);
    const glow = ctx.createRadialGradient(cx, cy, rr * 0.8, cx, cy, rr * 1.7);
    glow.addColorStop(0, hsla(hue, 85, 60, alpha * 0.55));
    glow.addColorStop(1, hsla(hue, 85, 50, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, rr * 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    const body = ctx.createRadialGradient(cx - rr * 0.35, cy - rr * 0.35, rr * 0.05, cx, cy, rr);
    body.addColorStop(0, hsla(hue, 70, 55 + 35 * level, 0.97));
    body.addColorStop(0.7, hsla(hue, 70, 30 + 20 * level, 0.95));
    body.addColorStop(1, hsla(hue, 70, 18, 0.9));
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A few passes of a cheap separable box blur over a single-channel buffer —
 *  "good enough" bloom softening without pulling in a convolution library.
 *  Deterministic: pure array math, no canvas filter, so the determinism test
 *  does not depend on a particular browser's `filter: blur()` implementation
 *  agreeing with itself (it would, in one session, but this needs no such
 *  assumption). */
function boxBlur(src: Float32Array, width: number, height: number, passes: number): Float32Array {
  let buf = src;
  for (let pass = 0; pass < passes; pass++) {
    const tmp = new Float32Array(buf.length);
    // horizontal
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let dx = -1; dx <= 1; dx++) {
          const sx = x + dx;
          if (sx < 0 || sx >= width) continue;
          sum += buf[y * width + sx];
          n++;
        }
        tmp[y * width + x] = sum / n;
      }
    }
    const tmp2 = new Float32Array(buf.length);
    // vertical
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const sy = y + dy;
          if (sy < 0 || sy >= height) continue;
          sum += tmp[sy * width + x];
          n++;
        }
        tmp2[y * width + x] = sum / n;
      }
    }
    buf = tmp2;
  }
  return buf;
}

/**
 * Render ONE frame into `ctx`, as a pure function of `input`. Called from the
 * live preview's `requestAnimationFrame` loop (with whichever `frameIndex` the
 * loop computes as "closest to now") and, later, from WP5's headless
 * Playwright capture (with an explicit, monotonically-walked `frameIndex`) —
 * the same function either way, which is the whole determinism guarantee.
 *
 * `ctx.canvas.width`/`height` are read, not written, by this function — the
 * caller owns the output resolution (preview size today, export size later).
 */
export function renderFrame(ctx: CanvasRenderingContext2D, input: RenderInput): void {
  const { canvas } = ctx;
  const w = canvas.width;
  const h = canvas.height;
  const { frameIndex, effectParams: params, seed, bloomTexture, boundedLow, highBand, reducedMotion } = input;

  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);

  // BASE LAYER. No zoom/pan in this build (see module header) — the poster is
  // drawn once, full-frame, letterboxed to the canvas's own aspect. Still a
  // pure function of (poster, w, h): nothing here reads elapsed wall time.
  const posterAspect = input.posterWidth / input.posterHeight;
  const canvasAspect = w / h;
  let dw = w, dh = h, dx = 0, dy = 0;
  if (input.fit === "cover") {
    // COVER: the poster fills the canvas and its overhang is cropped - the
    // contain branch below with the comparison turned round.
    if (posterAspect > canvasAspect) {
      dw = h * posterAspect;
      dx = (w - dw) / 2;
    } else {
      dh = w / posterAspect;
      dy = (h - dh) / 2;
    }
  } else if (posterAspect > canvasAspect) {
    dh = w / posterAspect;
    dy = (h - dh) / 2;
  } else {
    dw = h * posterAspect;
    dx = (w - dw) / 2;
  }
  ctx.drawImage(input.poster, dx, dy, dw, dh);
  const dim = Math.min(0.8, Math.max(0, input.scene?.dim ?? 0));
  if (dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(dx, dy, dw, dh);
  }

  // EDGE-MASK BLOOM ON BEATS. Opacity/intensity driven by the FLASH-SAFE low
  // band (never the raw one) — reading `boundedLow` here, rather than
  // `envelope.bands.low` directly, is what makes the cap apply to every
  // consumer automatically rather than something each caller has to remember.
  const low = boundedLow[frameIndex] ?? 0;
  if (low > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // An intensity past 1 is drawn as extra additive passes rather than
    // clamped at one: a clamp would turn "three times the light" into "the
    // same light, saturated sooner". Under 1 this is the single draw it was.
    for (let a = low * params.bloomIntensity; a > 0.001; a -= 1) {
      ctx.globalAlpha = Math.min(1, a);
      ctx.drawImage(bloomTexture, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  // DUST PARTICLES. Density/shimmer reads the HIGH band (the track's "air") —
  // documented choice: high-frequency content (hats, air, sibilance) is the
  // register dust-in-light visually reads as, where the low band is already
  // spent on the bloom. Position is governed by `reducedMotion` below;
  // opacity continues to shimmer either way because an alpha change is not
  // spatial motion in the vestibular-trigger sense this app's "replace, never
  // remove" rule is about.
  const shimmer = 0.4 + 0.6 * (highBand[frameIndex] ?? 0);
  // Tinted dust stays pale (85% lightness): still dust in light, now in the
  // treatment's colour. An absent hue keeps the studio's white exactly.
  const particleFill = input.particleHue === undefined ? "rgba(255,255,255,1)" : hsla(hueOf(input.particleHue), 70, 85, 1);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < params.particleCount; i++) {
    // REDUCED MOTION dampens drift to near-static by freezing the particle's
    // own clock at frame 0 — it still exists, still shimmers, it simply does
    // not travel. "Replace, never remove": the particle layer stays on, only
    // its motion component is held still.
    const { x, y, opacity } = particleAt(seed, i, reducedMotion ? 0 : frameIndex, input.fps, params);
    const px = dx + x * dw;
    const py = dy + y * dh;
    const r = 1 + 1.5 * opacity;
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity * shimmer));
    ctx.fillStyle = particleFill;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // THE SCENE'S OWN LIGHT AND WEATHER, when the album's look places any.
  if (input.scene) {
    drawScene(ctx, input.scene, {
      seed, frameIndex, fps: input.fps, dx, dy, dw, dh,
      low: boundedLow, mid: input.midBand ?? [], high: highBand,
    });
  }

  // THE FOCAL ELEMENT, last and on top: the one thing the treatment placed.
  if (input.focal) drawFocal(ctx, input.focal, frameIndex, input.fps);
}


/* ───────────────────────────── the scene's light and weather ─────────────── */

// A LOOK is an album's fixed picture, so its light sources are placed ONCE, in
// the picture's own 0..1 coordinates (x across, y down; radii against the
// picture's height), and every layer below is a pure function of
// (seed, frameIndex, envelope) - no state carried between frames, same as the
// particle field. Each layer reads the band the thing it draws would answer
// to: fire to the low band, the voice's threads to the high band, the
// instruments' glow to the mid band. The flash limiter's bounded low band is
// the only low band read, and every drive is averaged over ~0.25 s before it
// moves anything, so a layer swells and exhales and never strobes.

export interface ScenePoint { x: number; y: number }

export interface SceneFx {
  /** How far the band-driven part of every layer swings; 1 = the base look.
   *  Only the swing is scaled - a quiet passage rests where it always did. */
  intensity?: number;
  /** A slow build across the track: the swing is scaled from `lo` where the
   *  track is at its quietest to `hi` where it is at its fullest, by the
   *  overall level smoothed over `smoothS` seconds. Derived once per envelope. */
  arc?: { smoothS: number; lo: number; hi: number };
  /** The dust's tint, 0..360, over the treatment's own. */
  particleHue?: number;
  /** The queue's compact encode quality for this look (30 when absent): a
   *  dark, hazy picture wants a lower number. Read by the render, not drawn. */
  crf?: number;
  /** Fine falling rain over the whole frame. */
  rain?: { count: number; angleDeg: number; lengthPx: number; hue: number; warmZones: { x: number; y: number; r: number }[] };
  /** Fire: a flickering glow and rising sparks at each source. */
  fires?: { x: number; y: number; r: number; sparks: number }[];
  /** Light rising from `from` along curves to each target (the voice).
   *  `lift` is how far the curve arches above the straight line (0.09 default),
   *  `l` the lightness of the motes (78 default). */
  threads?: { from: ScenePoint; to: ScenePoint[]; count: number; hue: number; lift?: number; l?: number };
  /** Soft glows on the targets, rippled in order by `lagFrames`. */
  glows?: { x: number; y: number; r: number; hue: number; lagFrames: number; l?: number }[];
  /** A slow breathing halo. */
  moon?: { x: number; y: number; r: number };
  /** Twinkling glints inside rects: amber left of `warmBelowX`, cool right of
   *  it - or all one `hue` when it is given. */
  glints?: { rects: { x0: number; y0: number; x1: number; y1: number }[]; count: number; warmBelowX: number; hue?: number };
  /** Steady lamps that swell on the low band (taillights): no flicker. */
  lamps?: { points: ScenePoint[]; r: number; hue: number };
  /** Soft vertical streaks (a lit thing's reflection in a wet floor), centred
   *  on x, from y down by h, w wide, breathing on `band`. */
  reflect?: { streaks: { x: number; y: number; w: number; h: number; band: "low" | "mid" | "high" }[]; hue: number };
  /** Slow soft haze blobs drifting along a band of the frame. */
  smoke?: { y0: number; y1: number; count: number; hue: number };
  /** Faint steady lights with a slow twinkle (a skyline, a tube). */
  beacons?: { x: number; y: number; r: number; hue: number; l: number; a: number; rate: number }[];
  /** The edge light's colour, 0..255 each (cyan-white when absent). Read by
   *  the render page when it builds the bloom texture, not drawn here. */
  bloomRgb?: [number, number, number];
  /** How far the picture itself is darkened under every light, 0..0.8 (0 when
   *  absent): a dimmer rest leaves the beat's light more room to lift it. */
  dim?: number;
  /** The drifting dust's count against the treatment's (1 when absent). Read
   *  by the render, not drawn here. */
  dust?: number;
  /** Sparks carried one way along a stream the picture already paints: each
   *  is born in `from`'s box and lands in `to`'s, its hue drifting from `hue`
   *  to `hueTo`. The low band thickens a stream, the high band brightens it. */
  streams?: {
    from: { x0: number; y0: number; x1: number; y1: number };
    to: { x0: number; y0: number; x1: number; y1: number };
    count: number; hue: number; hueTo?: number; l?: number;
    lifeS: [number, number]; sizePx: number; sway?: number;
  }[];
}

interface SceneCtx {
  seed: number;
  frameIndex: number;
  fps: number;
  dx: number; dy: number; dw: number; dh: number;
  low: number[]; mid: number[]; high: number[];
}

/** Mean of a band over the ~0.25 s ending at `frame` (0 when absent). */
function drive(band: number[], frame: number, fps: number, lag = 0): number {
  if (!band.length) return 0;
  const n = Math.max(1, Math.round(fps * 0.25));
  const end = Math.min(band.length - 1, Math.max(0, frame - lag));
  let sum = 0;
  let c = 0;
  for (let i = Math.max(0, end - n + 1); i <= end; i++) {
    sum += band[i];
    c++;
  }
  return c ? sum / c : 0;
}

const fract = (v: number) => v - Math.floor(v);

function radial(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: string, outer: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function drawScene(ctx: CanvasRenderingContext2D, fx: SceneFx, c: SceneCtx): void {
  const { seed, frameIndex, fps, dx, dy, dw, dh } = c;
  const t = frameIndex / fps;
  const px = (x: number) => dx + x * dw;
  const py = (y: number) => dy + y * dh;
  const u = dh / 1080; // pixel sizes are authored for a 1080-high frame
  const low = drive(c.low, frameIndex, fps);
  const high = drive(c.high, frameIndex, fps);
  const level = (low + drive(c.mid, frameIndex, fps) + high) / 3;
  const k = (fx.intensity ?? 1) * (fx.arc ? arcFactor(fx.arc, c) : 1);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // THE MOON: a slow breath, kept low so the title space stays clean.
  if (fx.moon) {
    const breath = 0.5 + 0.5 * Math.sin((t / 7) * Math.PI * 2);
    radial(ctx, px(fx.moon.x), py(fx.moon.y), fx.moon.r * dh * 3.2, hsla(214, 70, 82, 0.1 + 0.05 * breath), hsla(214, 70, 82, 0));
  }

  // RAIN. Each streak is a fixed lane that falls and wraps; denser and a touch
  // brighter as the track gets louder. Streaks that pass a fire's glow turn amber.
  if (fx.rain) {
    const rad = (fx.rain.angleDeg * Math.PI) / 180;
    const sx = Math.sin(rad);
    const cy = Math.cos(rad);
    const shown = Math.round(fx.rain.count * (0.65 + 0.35 * k * Math.min(1, level * 1.6)));
    ctx.lineCap = "round";
    for (let i = 0; i < shown; i++) {
      const rng = mulberry32(hashSeed(seed ^ 0x51ed, i));
      const lane = rng();
      const phase = rng();
      const depth = 0.35 + 0.65 * rng(); // near streaks are longer, faster, brighter
      const speed = 0.55 + 0.9 * depth;
      const p = fract(phase + t * speed * 0.9);
      // The fall spans the frame plus its own length, so a streak enters and leaves off-screen.
      const x = lane + sx * (p - 0.5) * 0.35;
      const y = -0.08 + p * 1.16;
      const len = fx.rain.lengthPx * depth * u;
      const X = px(x);
      const Y = py(y);
      let warm = 0;
      for (const z of fx.rain.warmZones) {
        const d = Math.hypot((x - z.x) * dw, (y - z.y) * dh) / (z.r * dh);
        if (d < 1) warm = Math.max(warm, 1 - d);
      }
      ctx.lineWidth = (0.7 + 0.9 * depth) * u;
      ctx.strokeStyle = warm > 0.05
        ? hsla(34, 95, 70, (0.12 + 0.32 * warm) * depth)
        : hsla(fx.rain.hue, 60, 82, (0.07 + 0.2 * depth) * (0.8 + 0.4 * k * level));
      ctx.beginPath();
      ctx.moveTo(X, Y);
      ctx.lineTo(X - sx * len, Y - cy * len);
      ctx.stroke();
    }
  }

  // FIRE: a flickering amber glow that rises a little on the low band, and sparks.
  const fires = fx.fires ?? [];
  for (let fi = 0; fi < fires.length; fi++) {
    const f = fires[fi];
    const flick = 0.55 + 0.25 * Math.sin(t * 7.3 + fi * 2.1) + 0.12 * Math.sin(t * 13.7 + fi * 0.7) + 0.08 * Math.sin(t * 23.1 + fi);
    const a = Math.max(0, flick * 0.2 + 0.2 * k * low);
    radial(ctx, px(f.x), py(f.y), f.r * dh * (1 + 0.12 * k * low), hsla(32, 100, 58, a), hsla(26, 100, 45, 0));
    for (let i = 0; i < f.sparks; i++) {
      const rng = mulberry32(hashSeed(seed ^ (0xf1e0 + fi * 977), i));
      const life = 2.2 + rng() * 2.8;
      const age = fract(rng() + t / life); // 0 born .. 1 gone
      const sway = (rng() - 0.5) * 0.05 + Math.sin(t * (1.1 + rng()) + rng() * 6.28) * 0.012 * (0.4 + age);
      const x = f.x + (rng() - 0.5) * f.r * 0.5 * (dh / dw) + sway;
      const y = f.y - age * (0.12 + 0.16 * rng());
      const fade = Math.sin(Math.PI * Math.min(1, age * 1.15)) * (1 - age * 0.3);
      const tw = 0.75 + 0.25 * Math.sin(t * (9 + rng() * 8) + rng() * 6.28);
      const size = (1 + 2 * rng()) * (1 - age * 0.55) * u;
      ctx.globalAlpha = Math.max(0, Math.min(1, fade * tw * 0.9));
      ctx.fillStyle = hsla(26 + 18 * rng(), 100, 55 + 20 * (1 - age), 1);
      ctx.beginPath();
      ctx.arc(px(x), py(y), size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // THE INSTRUMENTS' GLOW: mid band, each a few frames behind the last, so a
  // phrase travels lyre -> flute -> drum.
  for (const g of fx.glows ?? []) {
    const m = drive(c.mid, frameIndex, fps, g.lagFrames);
    const gl = g.l ?? 72;
    radial(ctx, px(g.x), py(g.y), g.r * dh * (1 + 0.1 * k * m), hsla(g.hue, 100, gl, 0.05 + 0.2 * k * m), hsla(g.hue, 100, gl - 12, 0));
  }

  // THE VOICE'S THREADS: motes leave the singer and arc to the instruments;
  // the high band (breath, sibilance, air) is what brightens them.
  if (fx.threads) {
    const th = fx.threads;
    const tl = th.l ?? 78;
    const lift = th.lift ?? 0.09;
    for (let i = 0; i < th.count; i++) {
      const rng = mulberry32(hashSeed(seed ^ 0x7b3a, i));
      const target = th.to[i % th.to.length];
      const life = 3.5 + rng() * 3;
      const p = fract(rng() + t / life);
      const bow = (rng() - 0.5) * 0.16;
      const wobble = Math.sin(t * (1.3 + rng()) + rng() * 6.28) * 0.012;
      const e = p * p * (3 - 2 * p); // ease: leaves slowly, lands softly
      const mx = (th.from.x + target.x) / 2;
      const my = (th.from.y + target.y) / 2 - lift - bow * 0.5;
      const x = (1 - e) * (1 - e) * th.from.x + 2 * (1 - e) * e * mx + e * e * target.x + wobble;
      const y = (1 - e) * (1 - e) * th.from.y + 2 * (1 - e) * e * my + e * e * target.y + wobble * 0.6;
      const a = Math.sin(Math.PI * p) * (0.3 + 0.7 * Math.min(1, k * high * 1.8));
      const size = (1.2 + 2.2 * rng()) * u;
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      radial(ctx, px(x), py(y), size * 4, hsla(th.hue, 100, tl, 0.5), hsla(th.hue, 100, tl - 8, 0));
      ctx.fillStyle = hsla(th.hue, 90, Math.min(96, tl + 14), 1);
      ctx.beginPath();
      ctx.arc(px(x), py(y), size * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // GLINTS on the wet steps and the sea: amber where the fire reflects, cool elsewhere.
  if (fx.glints) {
    const gl = fx.glints;
    for (let i = 0; i < gl.count; i++) {
      const rng = mulberry32(hashSeed(seed ^ 0x6c17, i));
      const r = gl.rects[Math.floor(rng() * gl.rects.length)];
      const x = r.x0 + rng() * (r.x1 - r.x0);
      const y = r.y0 + rng() * (r.y1 - r.y0);
      const f = 0.25 + rng() * 0.55;
      const tw = Math.pow(Math.max(0, Math.sin(t * Math.PI * 2 * f + rng() * 6.28)), 6);
      const a = tw * (0.35 + 0.65 * Math.min(1, k * low * 1.4 + 0.2));
      if (a < 0.02) continue;
      const warm = x < gl.warmBelowX;
      const wpx = (3 + 9 * rng()) * u;
      ctx.globalAlpha = Math.min(1, a);
      ctx.fillStyle = gl.hue !== undefined ? hsla(gl.hue, 100, 62, 1) : warm ? hsla(34, 100, 66, 1) : hsla(208, 90, 82, 1);
      ctx.beginPath();
      ctx.ellipse(px(x), py(y), wpx, 0.9 * u + 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }


  // HAZE: slow blobs along the floor band, a little denser as the track fills.
  if (fx.smoke) {
    const sm = fx.smoke;
    for (let i = 0; i < sm.count; i++) {
      const rng = mulberry32(hashSeed(seed ^ 0x5a0c, i));
      const speed = (0.004 + 0.008 * rng()) * (rng() < 0.5 ? 1 : -1);
      const x = fract(rng() + t * speed);
      const y = sm.y0 + (sm.y1 - sm.y0) * rng() + Math.sin(t * 0.21 + rng() * 6.28) * 0.012;
      const r = (0.1 + 0.12 * rng()) * dh;
      const a = (0.025 + 0.03 * rng()) * (0.6 + 0.8 * Math.min(1, level * 1.4)) * k;
      radial(ctx, px(x), py(y), r, hsla(sm.hue, 75, 45, a), hsla(sm.hue, 75, 35, 0));
    }
  }

  // LAMPS: steady glow that swells on the kick and exhales between.
  if (fx.lamps) {
    const lp = fx.lamps;
    for (const p of lp.points) {
      radial(ctx, px(p.x), py(p.y), lp.r * dh * (1 + 0.18 * k * low), hsla(lp.hue, 100, 52, Math.min(0.9, 0.16 + 0.34 * k * low)), hsla(lp.hue, 100, 40, 0));
    }
  }

  // REFLECTIONS: elliptical soft streaks on the floor, each on its own band.
  if (fx.reflect) {
    const rf = fx.reflect;
    for (let i = 0; i < rf.streaks.length; i++) {
      const st = rf.streaks[i];
      const b = st.band === "low" ? low : st.band === "mid" ? drive(c.mid, frameIndex, fps) : high;
      const shimmer = 0.75 + 0.25 * Math.sin(t * 1.7 + i * 2.3);
      const a = Math.min(0.8, (0.07 + 0.2 * k * b) * shimmer);
      ctx.save();
      ctx.translate(px(st.x), py(st.y + st.h / 2));
      ctx.scale((st.w * dw) / 2, (st.h * dh) / 2);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, hsla(rf.hue, 100, 50, a));
      g.addColorStop(1, hsla(rf.hue, 100, 40, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
    }
  }

  // BEACONS: far lights that barely move.
  for (const bc of fx.beacons ?? []) {
    const tw = 0.6 + 0.4 * Math.sin(t * bc.rate * Math.PI * 2 + bc.x * 17);
    radial(ctx, px(bc.x), py(bc.y), bc.r * dh, hsla(bc.hue, 100, bc.l, bc.a * tw * (0.8 + 0.2 * k)), hsla(bc.hue, 100, 50, 0));
  }

  // STREAMS: the picture's painted sparks, set moving the way they already
  // point. A spark's lane and life come from (seed, stream, index) alone, and
  // the low band only decides how many lanes show, so a lane never jumps.
  const streams = fx.streams ?? [];
  for (let si = 0; si < streams.length; si++) {
    const s = streams[si];
    const sl = s.l ?? 62;
    const shown = Math.round(s.count * (0.5 + 0.5 * Math.min(1, k * low * 1.4)));
    const bright = 0.3 + 0.7 * Math.min(1, k * high * 1.8);
    for (let i = 0; i < shown; i++) {
      const rng = mulberry32(hashSeed(seed ^ (0x57e0 + si * 131), i));
      const x0 = s.from.x0 + rng() * (s.from.x1 - s.from.x0);
      const y0 = s.from.y0 + rng() * (s.from.y1 - s.from.y0);
      const x1 = s.to.x0 + rng() * (s.to.x1 - s.to.x0);
      const y1 = s.to.y0 + rng() * (s.to.y1 - s.to.y0);
      const life = s.lifeS[0] + rng() * (s.lifeS[1] - s.lifeS[0]);
      const p = fract(rng() + t / life);
      const sway = Math.sin(t * (0.9 + rng()) + rng() * 6.28) * (s.sway ?? 0.006);
      const x = x0 + (x1 - x0) * p + sway * (dh / dw);
      const y = y0 + (y1 - y0) * p;
      const tw = 0.6 + 0.4 * Math.sin(t * (6 + rng() * 10) + rng() * 6.28);
      const a = Math.sin(Math.PI * p) * tw * bright;
      if (a < 0.02) continue;
      // The short way round the wheel: 4 -> 356 is eight degrees through red,
      // not 352 through green and blue.
      const hue = s.hue + ((((s.hueTo ?? s.hue) - s.hue + 540) % 360) - 180) * p;
      const size = s.sizePx * (0.5 + rng()) * u;
      ctx.globalAlpha = Math.min(1, a);
      radial(ctx, px(x), py(y), size * 3.5, hsla(hue, 100, sl, 0.45), hsla(hue, 100, sl - 10, 0));
      ctx.fillStyle = hsla(hue, 80, Math.min(95, sl + 22), 1);
      ctx.beginPath();
      ctx.arc(px(x), py(y), size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// THE ARC: the overall level (the three bands' mean) smoothed over `smoothS`
// seconds and stretched to 0..1 across the track, so a three-wave build reads
// as three steps of one slope. Derived from the envelope alone and cached on
// it, so a frame still depends only on (seed, frameIndex, envelope).
const arcCache = new WeakMap<number[], number[]>();

function arcCurve(c: SceneCtx, smoothS: number): number[] {
  const hit = arcCache.get(c.low);
  if (hit) return hit;
  const n = c.low.length;
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + (c.low[i] + (c.mid[i] ?? 0) + (c.high[i] ?? 0)) / 3;
  const half = Math.max(1, Math.round((smoothS * c.fps) / 2));
  const out = new Array<number>(n);
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - half);
    const b = Math.min(n, i + half + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
    if (out[i] < lo) lo = out[i];
    if (out[i] > hi) hi = out[i];
  }
  const span = hi - lo > 1e-6 ? hi - lo : 1;
  for (let i = 0; i < n; i++) out[i] = (out[i] - lo) / span;
  arcCache.set(c.low, out);
  return out;
}

function arcFactor(arc: NonNullable<SceneFx["arc"]>, c: SceneCtx): number {
  const v = arcCurve(c, arc.smoothS)[Math.min(c.low.length - 1, Math.max(0, c.frameIndex))] ?? 0;
  return arc.lo + (arc.hi - arc.lo) * v;
}
