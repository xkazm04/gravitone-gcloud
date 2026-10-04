"use client";

// THE LIVE PREVIEW — a canvas that reacts to the real baked envelope.
//
// WHAT IS ONE-TIME SETUP vs WHAT RUNS EVERY FRAME, named explicitly because
// mixing the two up is exactly how a compositor stops being deterministic:
//
//   ONCE PER POSTER  — decode the image, compute its edge mask (Sobel over
//                       luminance), build the bloom texture (blur+threshold+
//                       tint). All three are cached in this component's state
//                       and never recomputed on a preview tick.
//   ONCE PER ENVELOPE — the flash-rate-limited low band (`limitFlashRate`,
//                       one pass over the whole track).
//   EVERY FRAME        — `renderFrame` (./compositor.ts), reading only the
//                       cached poster/bloom/edge objects, the precomputed
//                       arrays, and `frameIndex`.
//
// THE PREVIEW LOOP ITSELF IS NOT WHAT MAKES THIS DETERMINISTIC. It is a plain
// `requestAnimationFrame` computing "which frame index is closest to the
// monotonic clock right now" — real-time, lossy, and that is fine, because the
// determinism law this package is graded on is about EXPORT (a later work
// package, replaying `renderFrame` frame-by-frame at an explicit timestamp,
// never live) being a pure function of frame index. This loop exists only so
// a human watching the preview sees the effect reacting to the music.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { AudioEnvelope } from "@/lib/audioEnvelope";

import { useLoadFor } from "../../_shared/useLoadFor";
import {
  buildBloomTexture,
  computeEdgeMask,
  limitFlashRate,
  renderFrame,
  type EdgeMask,
  type EffectParams,
} from "./compositor";

/** `window.matchMedia("(prefers-reduced-motion: reduce)")`, read through
 *  `useSyncExternalStore` rather than an effect + `setState` — the OS setting
 *  is an external store exactly like `stepStore.ts#useStorageTrouble` reads
 *  one, and the subscription model is what lets a creator toggle it while
 *  this step is open and see the effect respond without a reload, without an
 *  effect body that writes state synchronously on mount. */
function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function reducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function reducedMotionServerSnapshot(): boolean {
  return false;
}
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, reducedMotionServerSnapshot);
}

interface PosterRig {
  image: HTMLImageElement;
  width: number;
  height: number;
  edgeMask: EdgeMask;
  bloomTexture: HTMLCanvasElement;
}

/** Decode the poster once and derive its static inputs once — see the module
 *  header for why nothing here runs again on a preview tick. The analysis
 *  canvas is capped at 640px on its long edge: the edge mask only drives a
 *  blurred additive overlay, so a full-resolution Sobel pass would spend real
 *  CPU on detail the blur erases immediately afterward. */
async function buildPosterRig(url: string, effectParams: EffectParams): Promise<PosterRig> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The poster image could not be decoded."));
    img.src = url;
  });

  const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = longEdge > 640 ? 640 / longEdge : 1;
  const w = Math.max(1, Math.round(image.naturalWidth * scale));
  const h = Math.max(1, Math.round(image.naturalHeight * scale));

  const analysis = document.createElement("canvas");
  analysis.width = w;
  analysis.height = h;
  const actx = analysis.getContext("2d", { willReadFrequently: true })!;
  actx.drawImage(image, 0, 0, w, h);
  const edgeMask = computeEdgeMask(actx.getImageData(0, 0, w, h));
  const bloomTexture = buildBloomTexture(edgeMask, effectParams);

  return { image, width: image.naturalWidth, height: image.naturalHeight, edgeMask, bloomTexture };
}

export default function EffectsStudio({
  posterUrl,
  envelope,
  seed,
  effectParams,
}: {
  posterUrl: string;
  envelope: AudioEnvelope;
  seed: number;
  effectParams: EffectParams;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rig, setRig] = useState<PosterRig | null>(null);
  const [rigError, setRigError] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  // ONCE PER POSTER. Through `useLoadFor` (`../../_shared/useLoadFor.ts`)
  // rather than a hand-rolled `let alive = true` guard — this is exactly the
  // "one load, one key, apply the result" shape that primitive owns, keyed on
  // the poster url plus the effect params that feed the bloom texture (a
  // future params editor would need a fresh rig; today it is constant after
  // the first poster, so the key only ever moves once). The load itself
  // catches its own rejection and returns an outcome rather than throwing,
  // so a decode failure reaches `apply` as data instead of an unhandled
  // rejection `useLoadFor` was never written to catch.
  const rigKey = `${posterUrl}::${JSON.stringify(effectParams)}`;
  useLoadFor<{ ok: true; rig: PosterRig } | { ok: false; error: string }>(
    rigKey,
    async () => {
      try {
        return { ok: true, rig: await buildPosterRig(posterUrl, effectParams) };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    (outcome) => {
      if (outcome.ok) {
        setRig(outcome.rig);
        setRigError(null);
      } else {
        setRig(null);
        setRigError(outcome.error);
      }
    },
  );

  // ONCE PER ENVELOPE. See compositor.ts#limitFlashRate's own header for why
  // this is a single pass over the whole track rather than a per-frame check.
  const boundedLow = useMemo(
    () => limitFlashRate(envelope.bands.low, envelope.fps, effectParams.flashThreshold, effectParams.flashMaxPerWindow),
    [envelope, effectParams],
  );

  // THE PREVIEW LOOP. Not the determinism seam — see module header.
  useEffect(() => {
    if (!rig) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const startedAt = performance.now();
    const durationS = Math.max(envelope.durationS, 1 / envelope.fps);

    const tick = () => {
      const elapsedS = ((performance.now() - startedAt) / 1000) % durationS;
      const frameIndex = Math.min(
        envelope.frameCount - 1,
        Math.max(0, Math.floor(elapsedS * envelope.fps)),
      );
      renderFrame(ctx, {
        poster: rig.image,
        posterWidth: rig.width,
        posterHeight: rig.height,
        bloomTexture: rig.bloomTexture,
        seed,
        effectParams,
        fps: envelope.fps,
        boundedLow,
        highBand: envelope.bands.high,
        frameIndex,
        reducedMotion,
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rig, envelope, seed, effectParams, boundedLow, reducedMotion]);

  if (rigError)
    return (
      <p className="font-jetbrains text-label text-rose-200/85" role="alert" data-testid="music-video-rig-error">
        {rigError}
      </p>
    );

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="w-full rounded-lg border border-white/10 bg-black"
        data-testid="music-video-compositor-canvas"
        aria-label="A preview of the poster animating with the track's beat"
      />
      {!rig && (
        <p className="font-jetbrains text-label text-white/35" data-testid="music-video-rig-loading">
          preparing the edge mask…
        </p>
      )}
      {reducedMotion && (
        <p className="font-jetbrains text-label text-white/35" data-testid="music-video-reduced-motion-note">
          reduced motion — particle drift held still
        </p>
      )}
    </div>
  );
}
