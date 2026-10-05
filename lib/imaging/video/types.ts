// THE VIDEO HOP'S WIRE CONTRACT — image in, clip out.
//
// A governed sibling of the still-image chokepoint (lib/imaging), not a fourth
// `Capability` on it: a clip is asynchronous (minutes, polled), billed per clip
// rather than per image, and stored as a file on this machine rather than
// returned inline. It shares the doors that matter — `guardRequest` on every
// route, the spend kernel (class `video-usd`) — and none of the router's
// image-shaped plumbing.
//
// Server-safe AND client-safe: types and constants only. The adapter
// (./leonardo.ts), the store (./store.ts) and pricing (./pricing.ts) are
// server-only and must never be imported from a component.

import type { Aspect, CostBasis } from "@/lib/imaging/types";

export type { CostBasis };

/** Hosted image-to-video models, by the id the vendor's v2 API takes. The model
 *  is ALWAYS named in the request — an unnamed request once silently received a
 *  different model family (pipeline/video/leonardo_reference.py, header). */
export const VIDEO_MODELS = ["kling-2-5", "hailuo-03", "veo-3"] as const;
export type VideoModel = (typeof VIDEO_MODELS)[number];

/** Clip lengths a request may ask for. Typed, never prose in the prompt. */
export const CLIP_DURATIONS = [5, 10] as const;
export type ClipDuration = (typeof CLIP_DURATIONS)[number];

export type ClipStatus = "queued" | "rendering" | "done" | "failed" | "refused";

/** POST /api/video/clips body. */
export interface VideoClipRequest {
  /** Owning project — recorded on the clip, used for spend attribution. */
  projectId: string;
  /** The adopted key image, base64 (no data: prefix). */
  image: string;
  mime: "image/png" | "image/jpeg" | "image/webp";
  /** Camera-led motion line; style restated by the caller. */
  motion: string;
  durationS: ClipDuration;
  aspect: Aspect;
  model: VideoModel;
}

/** POST /api/video/clips → 202 */
export interface VideoClipStarted {
  clipId: string;
}

/** GET /api/video/clips → what the Animate button needs before it is pressed. */
export interface VideoCapability {
  /** False when no vendor key is configured — the button is absent, not broken. */
  configured: boolean;
  models: VideoModel[];
  /** Estimated USD per clip by model and duration; null where unpriced. */
  priceUsd: Record<VideoModel, Record<ClipDuration, number | null>>;
}

/** GET /api/video/clips/[id] — the stored record (store.ts writes it). */
export interface ClipRecord {
  clipId: string;
  projectId: string;
  status: ClipStatus;
  model: VideoModel;
  durationS: ClipDuration;
  aspect: Aspect;
  motion: string;
  /** Vendor generation id, once the vendor accepted the job. */
  vendorJobId: string | null;
  costUsd: number | null;
  costBasis: CostBasis;
  /** Human-readable reason when failed/refused; the vendor's words verbatim. */
  error: string | null;
  createdAt: number;
  finishedAt: number | null;
}
