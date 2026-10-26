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
//   4. The same walk for Retry-After headers on 402 responses (earliestExpiry).

import { budgetCeilingUsd, budgetStats, budgetWindowMs, seenSpendRows, spendRows } from "./budget";
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
 * THE ONE ANSWER to "when will this fit": walk the rows by expiry until what is free plus what has
 * aged out covers `needUsd`. null when no row's expiry gets there (the window is held, not booked).
 * Both the quote's `resumeAt` and the 402's Retry-After read it.
 */
function resumeAtFor(rows: readonly { usd: number; expiresAt: number }[], remainingUsd: number, needUsd: number): number | null {
  let expiringUsd = 0;
  for (const r of [...rows].sort((a, b) => a.expiresAt - b.expiresAt)) {
    expiringUsd += r.usd;
    if (remainingUsd + expiringUsd >= needUsd - 1e-7) return r.expiresAt;
  }
  return null;
}

/**
 * Project affordability and earliest resumption time for a planned batch of images.
 */
export async function budgetQuote(opts?: BudgetQuoteOptions): Promise<BudgetQuote> {
  const images = Math.max(1, opts?.images ?? 1);
  const now = opts?.now ?? Date.now();

  // Spent and held from ONE read of the ledger, so a reservation landing
  // between two reads cannot make the remainder describe no moment at all.
  const { ceilingUsd: ceiling, spentUsd: spent, heldUsd: held } = await budgetStats(now);
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

  const windowMs = budgetWindowMs();
  const rows = (await spendRows(now))
    .map((r) => ({ usd: r.usd, expiresAt: r.at + windowMs }))
    .filter((r) => r.expiresAt > now);
  const resumeAt = resumeAtFor(rows, remainingUsd, estimateUsd);

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
 * When a refused image fits again: the moment enough booked spend ages out for `needUsd` (default
 * one image at the dearest declared rate, the estimate the guard itself refused on) to be free -
 * the answer `budgetQuote` gives, from the same walk. Used for 402 over-budget Retry-After.
 * Falls back to the earliest row's expiry when nothing is priced, or when the window is full of
 * holds rather than booked rows (they release when their calls settle; no row's age says when).
 *
 * Synchronous, because its caller (lib/imaging/api.ts, the error mapper) is.
 * It reads the rows as this process last saw them rather than waiting for the
 * ledger's lock: it answers a refusal, and the refusal has just read the ledger.
 * Rows already past the window are filtered here, so an unpruned view gives
 * the same answer.
 */
export function earliestExpiry(now: number = Date.now(), needUsd: number | null = pricedNeed()): number {
  const windowMs = budgetWindowMs();
  const rows = seenSpendRows()
    .map((r) => ({ usd: r.usd, expiresAt: r.at + windowMs }))
    .filter((r) => r.expiresAt > now);
  if (rows.length === 0) return now + windowMs;
  if (needUsd !== null) {
    const spentUsd = rows.reduce((n, r) => n + r.usd, 0);
    const fits = resumeAtFor(rows, Math.max(0, budgetCeilingUsd() - spentUsd), needUsd);
    if (fits !== null) return fits;
  }
  return Math.min(...rows.map((r) => r.expiresAt));
}

const pricedNeed = (): number | null => {
  const usd = estimatePerImage().usd;
  return typeof usd === "number" && Number.isFinite(usd) ? usd : null;
};
