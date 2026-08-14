// PRICING — the one place in the app where a price for an imaging call lives.
//
// WHY THIS FILE EXISTS. Only Leonardo tells us what a call cost, and Leonardo
// is a dev-only fallback. Google answers all three capabilities in production
// and its Interactions response carries no money field at all, so every spend
// figure the studio renders was structurally `undefined` in production — the
// two spend lines in Frames included. A number that is always missing reads as
// "free", which is the one thing it certainly is not.
//
// THE RULE THIS FILE IS BUILT AROUND: never invent a price. An unpriced call is
// honest; a guessed price presented as a dollar figure is not. So every row
// below either carries a figure WITH the source it came from and the date that
// source was last checked, or carries no figure and the reason there is none.
// `undefined` here is a decision, not an omission — read the `source` line.
//
// EDITING THIS TABLE is the whole point: when a vendor changes a rate, or when
// somebody actually measures one of the unpriced rows, this file is the only
// edit. Change the figure, change `checked`, and say in `source` how you know.
//
// SERVER ONLY, like everything under lib/imaging/. Not because this file holds
// a secret — it holds none — but because the directory is the seam that keeps
// keys out of the browser bundle, and a component reaching in for a price would
// be the first crack in it. A surface that needs a price before the call gets
// it through a prop or the API, never through an import (see
// app/library/Playground.tsx).

import type { ProviderId } from "./types";

/**
 * Where a cost figure came from. The distinction is the point: a vendor-reported
 * figure is a receipt, an estimated one is our arithmetic over the table below,
 * and downstream must be able to say which before it prints a dollar sign.
 */
export type CostBasis = "vendor-reported" | "estimated" | "unpriced";

export interface PriceQuote {
  /** USD for the WHOLE call. `undefined` iff `basis` is "unpriced". */
  usd?: number;
  basis: CostBasis;
  /** Where the figure came from, or why there is none. Safe to log or show. */
  note: string;
}

interface ModelPrice {
  provider: ProviderId;
  /** Exact model id as it goes on the wire, and as it lands in `Provenance`. */
  model: string;
  /** USD per image. Absent = deliberately unpriced; `source` says why. */
  usdPerImage?: number;
  /**
   * The `image_size` the figure was measured at. When set, a request at any
   * OTHER size — or one that pins no size at all and takes the vendor's default
   * — is unpriced rather than quoted at this rate. Nano Banana's price roughly
   * doubles per size step (providers/google.ts:50-52), so carrying a 1K figure
   * over to a 2K render would not be a rounding error, it would be a fiction.
   */
  atSize?: string;
  /** How we know. Cite a measurement in this repo or a published rate card. */
  source: string;
  /** ISO date `source` was last checked. Stale provenance is the failure mode. */
  checked: string;
}

/**
 * THE TABLE. Three priced rows, five deliberately unpriced ones.
 *
 * Neither priced figure is a vendor list price — both are this repo's own bill
 * divided by its own renders, from the 6-style x 5-beat trial grid (60 graded
 * cells, `docs/imaging.md` § The provider verdict, restated at
 * `lib/imaging/router.ts:46-47`). That makes them good estimates and bad
 * receipts, which is exactly how `basis` labels them.
 */
export const PRICES: readonly ModelPrice[] = [
  {
    provider: "google",
    model: "gemini-3.1-flash-image",
    usdPerImage: 0.045,
    atSize: "1K",
    source:
      "MEASURED in this repo: 30 Google cells of the style-trial grid at 1K, 16:9 — $0.0450/render (docs/imaging.md § The provider verdict; lib/imaging/router.ts:46-47). Google publishes no per-image list price for this model, so this is our spend over our render count, not a rate card.",
    checked: "2026-08-13",
  },
  {
    provider: "google",
    model: "gemini-3.1-flash-lite-image",
    // UNPRICED ON PURPOSE.
    source:
      "Never measured here — the repo runs the full model, because Lite supports object references only and cannot hold style-lock (providers/google.ts:37-46). Lite is known to be cheaper than NB2 and by no established amount, and 'cheaper' is not a number. Measure a batch or read Google's rate card, then price this row.",
    checked: "2026-08-14",
  },
  {
    provider: "google",
    model: "gemini-3.6-flash",
    // UNPRICED ON PURPOSE.
    source:
      "Recognition is billed per TOKEN — prompt, completion and the image's own tokens — not per call, so there is no per-call figure to put here. The Interactions response carries a `usage` block that this adapter does not decode, and no USD-per-token rate has been checked. Decoding usage and pricing it is the work that would fill this row.",
    checked: "2026-08-14",
  },
  {
    provider: "leonardo",
    model: "lucid-origin",
    usdPerImage: 0.0257,
    // No `atSize`: our Leonardo calls always send an ASPECT_PX size (~1.2MP),
    // and the measurement was taken at one of them.
    source:
      "MEASURED in this repo: 30 Leonardo cells of the same grid at 1472x832 — $0.0257/render, which is the 10-credit charge at USD_PER_CREDIT = 0.00257 (providers/leonardo.ts:39-41). FALLBACK ONLY: Leonardo reports its own cost on the start response, and a reported figure always outranks this one. Sound only for the sizes ASPECT_PX declares — Leonardo bills by pixel count.",
    checked: "2026-08-13",
  },
  // Qwen — the direction asked for "the same treatment or an explicit recorded
  // reason why it cannot". This is the reason, and it is recorded three times
  // because the adapter rotates across three SKUs on quota
  // (providers/qwen.ts:29-31) and one per-call figure could not be right for
  // all three even if we had it.
  {
    provider: "qwen",
    model: "qwen3.8-max",
    source:
      "DashScope bills per token against a prepaid balance, and the three SKUs this adapter rotates through bill at DIFFERENT rates against SEPARATE allowances. The chat response returns `usage.prompt_tokens`/`completion_tokens`, but no USD-per-token rate has been checked against Alibaba's published card. Unpriced until someone reads that card.",
    checked: "2026-08-14",
  },
  {
    provider: "qwen",
    model: "qwen3.7-plus",
    source: "Per-token, rate unchecked — see the qwen3.8-max row.",
    checked: "2026-08-14",
  },
  {
    provider: "qwen",
    model: "qwen3.6-flash",
    source: "Per-token, rate unchecked — see the qwen3.8-max row.",
    checked: "2026-08-14",
  },
];

const rowFor = (provider: ProviderId, model: string): ModelPrice | undefined =>
  PRICES.find((p) => p.provider === provider && p.model === model);

/**
 * What did this call cost, and how do we know?
 *
 * A vendor's own figure always wins — `vendorUsd` short-circuits the table, so
 * a rate that drifts out of date here can never overwrite a receipt. Everything
 * else is arithmetic over the row above, labelled "estimated". When there is no
 * usable row the answer is `unpriced` with the reason attached; callers set
 * `costUsd` to `quote.usd` and let it stay `undefined`, because a call we
 * cannot price must not surface as $0.00.
 */
export function priceCall(args: {
  provider: ProviderId;
  model: string;
  /** How many images the call produced. Defaults to 1. */
  images?: number;
  /** The `image_size` the REQUEST pinned, when it pinned one. */
  size?: string;
  /** What the vendor itself said this cost, in USD, when it said anything. */
  vendorUsd?: number;
}): PriceQuote {
  const { provider, model, images = 1, size, vendorUsd } = args;

  if (typeof vendorUsd === "number" && Number.isFinite(vendorUsd))
    return {
      usd: vendorUsd,
      basis: "vendor-reported",
      note: `${provider} reported this cost on the call itself.`,
    };

  const row = rowFor(provider, model);
  if (!row)
    return {
      basis: "unpriced",
      note: `No price is declared for ${provider}/${model}. Add a row to lib/imaging/pricing.ts with its source — do not guess one at the call site.`,
    };

  if (row.usdPerImage === undefined)
    return { basis: "unpriced", note: row.source };

  if (row.atSize !== undefined && size !== row.atSize)
    return {
      basis: "unpriced",
      note:
        `The declared figure for ${provider}/${model} is measured at image_size ${row.atSize}; this call ` +
        (size === undefined
          ? "pins no size, so the vendor's default applied and the rate does not carry over."
          : `asked for ${size}, and the price does not scale linearly across sizes.`),
    };

  const n = Math.max(images, 0);
  return {
    usd: row.usdPerImage * n,
    basis: "estimated",
    note: `Estimated: ${n} x $${row.usdPerImage} per image (${row.source} Checked ${row.checked}).`,
  };
}

/** The `costUsd` for a `Provenance`, or `undefined` when we cannot price it. */
export const costUsdFor = (args: Parameters<typeof priceCall>[0]): number | undefined =>
  priceCall(args).usd;
