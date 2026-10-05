// BUDGET FORECAST — pre-call spend projections and resumability timing.
//
// WHY THIS FILE EXISTS.
// The spend ceiling (budget.ts) enforces a rolling window cap, but callers were
// spending blind: a batch render would launch 16 plates against a $1 ceiling,
// fail partway through with an over-budget error, and leave the operator with no
// knowledge of how many plates could be afforded or when the window would roll
// over enough to resume.
//
// This module projects:
//   1. What a planned number of images will cost (using pricing.ts pre-call estimate).
//   2. How many images fit in the remaining window allowance right now.
//   3. When the window will age out enough booked spend to afford the full request.
//   4. Earliest expiry for Retry-After headers on 402 responses.

import {
  budgetCeilingUsd,
  budgetWindowMs,
  currentSpendUsd,
  heldUsd,
  spendRows,
} from "./budget";
import { estimatePerImage, type PriceQuote } from "./pricing";

export type BudgetVerdict = "fits" | "partial" | "blocked" | "unknown";

export interface BudgetQuoteOptions {
  images?: number;
  now?: number;
  overrideEstimate?: PriceQuote | null;
}

export interface BudgetQuote {
  remainingUsd: number;
  estimateUsd: number | null;
  affordableImages: number;
  verdict: BudgetVerdict;
  resumeAt: number | null;
  perImageUsd: number | null;
}

const roundMoney = (v: number): number => Math.round(v * 10000) / 10000;

/**
 * Project affordability and earliest resumption time for a planned batch of images.
 */
export function budgetQuote(opts?: BudgetQuoteOptions): BudgetQuote {
  const images = Math.max(1, opts?.images ?? 1);
  const now = opts?.now ?? Date.now();

  const ceiling = budgetCeilingUsd();
  const spent = currentSpendUsd(now);
  const held = heldUsd();
  const remainingUsd = roundMoney(Math.max(0, ceiling - spent - held));

  const pricing = opts?.overrideEstimate ?? estimatePerImage();
  const perImageUsd = typeof pricing.usd === "number" && Number.isFinite(pricing.usd) ? pricing.usd : null;

  if (perImageUsd === null) {
    return {
      remainingUsd,
      estimateUsd: null,
      affordableImages: images,
      verdict: "unknown",
      resumeAt: null,
      perImageUsd: null,
    };
  }

  const estimateUsd = roundMoney(perImageUsd * images);
  const affordableImages = Math.min(images, Math.floor((remainingUsd + 1e-7) / perImageUsd));

  if (affordableImages >= images) {
    return {
      remainingUsd,
      estimateUsd,
      affordableImages: images,
      verdict: "fits",
      resumeAt: null,
      perImageUsd,
    };
  }

  const verdict: BudgetVerdict = affordableImages === 0 ? "blocked" : "partial";

  // Calculate earliest expiry from spendRows where remainingUsd + expiringUsd >= estimateUsd
  const windowMs = budgetWindowMs();
  const rows = spendRows(now)
    .map((r) => ({ usd: r.usd, expiresAt: r.at + windowMs }))
    .filter((r) => r.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt);

  let expiringUsd = 0;
  let resumeAt: number | null = null;
  for (const r of rows) {
    expiringUsd += r.usd;
    if (remainingUsd + expiringUsd >= estimateUsd - 1e-7) {
      resumeAt = r.expiresAt;
      break;
    }
  }

  return {
    remainingUsd,
    estimateUsd,
    affordableImages,
    verdict,
    resumeAt,
    perImageUsd,
  };
}

/**
 * The earliest timestamp when any booked spend row in the window expires.
 * Used for 402 over-budget Retry-After headers.
 */
export function earliestExpiry(now: number = Date.now()): number {
  const windowMs = budgetWindowMs();
  const rows = spendRows(now)
    .map((r) => r.at + windowMs)
    .filter((t) => t > now);
  if (rows.length === 0) return now + windowMs;
  return Math.min(...rows);
}
