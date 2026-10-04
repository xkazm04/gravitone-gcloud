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
export function buildBloomTexture(edgeMask: EdgeMask, params: EffectParams): HTMLCanvasElement {
  const blurred = boxBlur(edgeMask.data, edgeMask.width, edgeMask.height, params.bloomBlurPasses);
  const canvas = document.createElement("canvas");
  canvas.width = edgeMask.width;
  canvas.height = edgeMask.height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(edgeMask.width, edgeMask.height);
  for (let i = 0; i < blurred.length; i++) {
    const v = blurred[i] > params.edgeThreshold ? blurred[i] : 0;
    const a = Math.min(255, Math.round(v * 255));
    // A cool cyan-white tint — additive, so only the alpha channel matters for
    // intensity; colour is a fixed constant, not a reactive value.
    imgData.data[i * 4 + 0] = 200;
    imgData.data[i * 4 + 1] = 230;
    imgData.data[i * 4 + 2] = 255;
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
  if (posterAspect > canvasAspect) {
    dh = w / posterAspect;
    dy = (h - dh) / 2;
  } else {
    dw = h * posterAspect;
    dx = (w - dw) / 2;
  }
  ctx.drawImage(input.poster, dx, dy, dw, dh);

  // EDGE-MASK BLOOM ON BEATS. Opacity/intensity driven by the FLASH-SAFE low
  // band (never the raw one) — reading `boundedLow` here, rather than
  // `envelope.bands.low` directly, is what makes the cap apply to every
  // consumer automatically rather than something each caller has to remember.
  const low = boundedLow[frameIndex] ?? 0;
  if (low > 0.001) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(1, low * params.bloomIntensity);
    ctx.drawImage(bloomTexture, dx, dy, dw, dh);
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
    ctx.fillStyle = "rgba(255,255,255,1)";
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
