// WHAT A CLIP COSTS — server-only, and honest about how little is known.
//
// THE TABLE IS EMPTY ON PURPOSE. Every cell below is `null`: unpriced, which is
// NOT free. Leonardo bills hosted video in API credits per generation, and no
// per-model, per-duration credit figure for `kling-2-5`, `hailuo-03` or `veo-3`
// could be read from a Leonardo source when this file was written
// (2026-10-06: docs.leonardo.ai/docs/pricing answered 404, leonardo.ai/api
// answered 403 to a fetch, and the search results were third-party summaries
// of the UNDERLYING vendors' own rates — Google's, Kuaishou's, MiniMax's —
// which are not what Leonardo charges for reselling them). A guessed figure
// here would be printed on the Animate button as a price, and a wrong price is
// worse than "unpriced": the creator decides on it.
//
// What IS known comes back from the vendor per call: v2 answers the start with
// `cost: { amount, unit }` (or the legacy `apiCreditCost`), "alongside what it
// just charged" (pipeline/video/leonardo_reference.py). `costFromVendor` turns
// that into USD — `estimated` when it had to convert credits, `vendor-reported`
// only when the unit already was dollars. Fill a cell below the day a figure
// with a source and a date exists; cite it on the line, the way
// lib/imaging/pricing.ts does.
//
// ENV-FREE, like lib/imaging/pricing.ts: the capability route hands this table
// to the browser, and nothing in it may depend on the box it runs on.

import type { ClipDuration, CostBasis, VideoModel } from "./types";
import { CLIP_DURATIONS, VIDEO_MODELS } from "./types";

/** Estimated USD per clip, by model and duration. `null` = unpriced (see the
 *  header — none has a Leonardo source yet). Exhaustive by type: a model or
 *  duration added to types.ts fails to compile until it has a row here. */
const CLIP_PRICE_USD: Readonly<Record<VideoModel, Readonly<Record<ClipDuration, number | null>>>> = {
  "kling-2-5": { 5: null, 10: null },
  "hailuo-03": { 5: null, 10: null },
  "veo-3": { 5: null, 10: null },
};

/** A fresh copy of the whole table — the GET capability's `priceUsd`. */
export function clipPriceTable(): Record<VideoModel, Record<ClipDuration, number | null>> {
  const out = {} as Record<VideoModel, Record<ClipDuration, number | null>>;
  for (const m of VIDEO_MODELS) {
    const row = {} as Record<ClipDuration, number | null>;
    for (const d of CLIP_DURATIONS) row[d] = CLIP_PRICE_USD[m][d];
    out[m] = row;
  }
  return out;
}

/** The declared estimate for one clip, with how to read it. */
export function estimateClipUsd(model: VideoModel, durationS: ClipDuration): { usd: number | null; basis: CostBasis } {
  const usd = CLIP_PRICE_USD[model][durationS];
  return usd === null ? { usd: null, basis: "unpriced" } : { usd, basis: "estimated" };
}

/**
 * What the spend gate HOLDS for one clip while it renders — a policy figure,
 * never shown as a price.
 *
 * Why a hold at all for an unpriced clip: imaging reserves 0 for an unpriced
 * call, and on this class that would mean a ceiling of `0` ("spend nothing")
 * admits every clip, and N concurrent clips all pass against an empty window.
 * A clip is dollars, not cents, so the gate errs high instead.
 *
 * $0.75 per second is the dearest per-second list rate found for any of the
 * three underlying models on 2026-10-06 — Google's published Vertex rate for
 * Veo 3 with audio, as quoted by third-party pricing summaries (not read on a
 * Google page). It is a ceiling-side assumption: the hold is replaced by
 * whatever the vendor reports the moment the clip settles.
 */
export const UNPRICED_HOLD_USD_PER_S = 0.75;

export function gateHoldUsd(model: VideoModel, durationS: ClipDuration): number {
  return CLIP_PRICE_USD[model][durationS] ?? UNPRICED_HOLD_USD_PER_S * durationS;
}

/** Leonardo's credits→USD conversion, the one lib/imaging/providers/leonardo.ts
 *  carries (USD_PER_CREDIT, from the reference client it was lifted from). A
 *  converted figure is an estimate, and is labelled one. */
export const USD_PER_CREDIT = 0.00257;

const USD_PER_UNIT: Readonly<Record<string, { usd: number; basis: CostBasis }>> = {
  CREDITS: { usd: USD_PER_CREDIT, basis: "estimated" },
  CREDIT: { usd: USD_PER_CREDIT, basis: "estimated" },
  DOLLARS: { usd: 1, basis: "vendor-reported" },
  USD: { usd: 1, basis: "vendor-reported" },
};

/**
 * The vendor's own figure, as USD. Same rules as the image adapter: amounts
 * arrive as strings, an absent unit means credits (the legacy field), an
 * UNKNOWN unit is unpriced rather than assumed, and zero/negative is a missing
 * figure, never a free clip.
 */
export function costFromVendor(raw: {
  amount?: unknown;
  unit?: unknown;
  apiCreditCost?: unknown;
}): { usd: number | null; basis: CostBasis } {
  const amount = Number(raw.amount ?? raw.apiCreditCost);
  if (!Number.isFinite(amount) || amount <= 0) return { usd: null, basis: "unpriced" };
  const unit = USD_PER_UNIT[String(raw.amount !== undefined ? (raw.unit ?? "CREDITS") : "CREDITS").toUpperCase()];
  return unit ? { usd: amount * unit.usd, basis: unit.basis } : { usd: null, basis: "unpriced" };
}
