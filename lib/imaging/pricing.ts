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
// it through a prop or the API, never through an import.
//
// THE BROWSER'S ROUTE INTO THIS TABLE is `GET /api/imaging/pricing`, served by
// `priceTable()` at the bottom of this file. It exists because the alternative
// was a component restating a number this table owns — app/library/Playground.tsx
// carried its own `0.045` — and a price declared twice is a price that rots.
// What crosses that wire is audited in the route handler, and the audit rests on
// one property of this module: **it reads no `process.env` and imports nothing
// that does.** Its only import is type-only and therefore erased. Keep it that
// way; a `keyFor()` or an `isConfigured()` in here would put the seam's whole
// purpose behind one convenience.

import type { CostBasis, ProviderId } from "./types";

/**
 * Where a cost figure came from — declared in `types.ts` because it travels on
 * `Provenance`, re-exported here so the pricing code still reads as one piece.
 */
export type { CostBasis } from "./types";

export interface PriceQuote {
  /** USD for the WHOLE call. `undefined` iff `basis` is "unpriced". */
  usd?: number;
  basis: CostBasis;
  /** Where the figure came from, or why there is none. Safe to log or show. */
  note: string;
}

/**
 * What the vendor counts when it bills this model.
 *
 * Machine-readable rather than left to the prose in `source`, because the
 * pre-call estimate has to pick out the rows that could price ONE IMAGE and
 * ignore the ones billed per token. Inferring that from "does `usdPerImage`
 * happen to be set" would be right today by luck and wrong the day somebody
 * measures a per-call figure for the vision model.
 */
export type BillingUnit = "per-image" | "per-token";

interface ModelPrice {
  provider: ProviderId;
  /** Exact model id as it goes on the wire, and as it lands in `Provenance`. */
  model: string;
  /** What the vendor counts. See BillingUnit. */
  bills: BillingUnit;
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
    bills: "per-image",
    usdPerImage: 0.045,
    atSize: "1K",
    source:
      "MEASURED in this repo: 30 Google cells of the style-trial grid at 1K, 16:9 — $0.0450/render (docs/imaging.md § The provider verdict; lib/imaging/router.ts:46-47). Google publishes no per-image list price for this model, so this is our spend over our render count, not a rate card.",
    checked: "2026-08-13",
  },
  {
    provider: "google",
    model: "gemini-3.1-flash-lite-image",
    bills: "per-image",
    // UNPRICED ON PURPOSE.
    source:
      "Never measured here — the repo runs the full model, because Lite supports object references only and cannot hold style-lock (providers/google.ts:37-46). Lite is known to be cheaper than NB2 and by no established amount, and 'cheaper' is not a number. Measure a batch or read Google's rate card, then price this row.",
    checked: "2026-08-14",
  },
  {
    provider: "google",
    model: "gemini-3.6-flash",
    bills: "per-token",
    // UNPRICED ON PURPOSE.
    source:
      "Recognition is billed per TOKEN — prompt, completion and the image's own tokens — not per call, so there is no per-call figure to put here. The Interactions response carries a `usage` block that this adapter does not decode, and no USD-per-token rate has been checked. Decoding usage and pricing it is the work that would fill this row.",
    checked: "2026-08-14",
  },
  {
    provider: "leonardo",
    model: "lucid-origin",
    bills: "per-image",
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
    bills: "per-token",
    source:
      "DashScope bills per token against a prepaid balance, and the three SKUs this adapter rotates through bill at DIFFERENT rates against SEPARATE allowances. The chat response returns `usage.prompt_tokens`/`completion_tokens`, but no USD-per-token rate has been checked against Alibaba's published card. Unpriced until someone reads that card.",
    checked: "2026-08-14",
  },
  {
    provider: "qwen",
    model: "qwen3.7-plus",
    bills: "per-token",
    source: "Per-token, rate unchecked — see the qwen3.8-max row.",
    checked: "2026-08-14",
  },
  {
    provider: "qwen",
    model: "qwen3.6-flash",
    bills: "per-token",
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

/* ── The public half: what a surface may know BEFORE the call ─────────────── */
//
// Everything above prices a call that already happened. A surface that is about
// to spend money needs the figure BEFORE the click, and it cannot import this
// file to get it (see the header). So the two functions below are the wire
// shape, served by app/api/imaging/pricing/route.ts.
//
// They are deliberately derived from `PRICES` alone. Nothing here reads the
// environment, asks which vendors are configured, or consults the router's
// plan — a caller must not be able to work out from a price response which keys
// this deployment holds, and the cheapest way to guarantee that is to have
// nothing to leak in the first place.

/**
 * A table row as the wire carries it.
 *
 * Field-for-field the same as `ModelPrice`, and written out longhand rather
 * than by spreading the row. That is the point: a projection you have to edit
 * to widen cannot accidentally widen. If a future row grows a field that should
 * not be public, the default is that it stays private.
 */
export interface PublicPrice {
  provider: ProviderId;
  model: string;
  bills: BillingUnit;
  usdPerImage?: number;
  atSize?: string;
  source: string;
  checked: string;
}

export interface PriceTable {
  /** What ONE generated image is likely to cost. See `estimatePerImage`. */
  perImage: PriceQuote;
  /** Every declared row, priced and unpriced alike. */
  prices: PublicPrice[];
}

/**
 * The pre-click estimate: the DEAREST declared per-image rate.
 *
 * A surface asking before the call cannot know which vendor the router will
 * pick — that depends on the environment, on which keys are set, and on whether
 * the first choice refuses. It must not learn any of those from us either. So
 * the answer is the ceiling over the priced per-image rows, which errs HIGH,
 * and erring high is the right direction for a warning about money.
 *
 * Unpriced when no per-image row carries a figure. That is a real outcome and
 * not a placeholder: a surface that gets it must say it does not know the
 * price, never $0.00.
 */
export function estimatePerImage(): PriceQuote {
  const priced = PRICES.filter(
    (p): p is ModelPrice & { usdPerImage: number } =>
      p.bills === "per-image" && p.usdPerImage !== undefined,
  );
  if (!priced.length)
    return {
      basis: "unpriced",
      note:
        "No per-image rate is declared in lib/imaging/pricing.ts, so there is no estimate to show " +
        "before the call. The vendor's own figure, when it sends one, still arrives with the result.",
    };

  const dearest = priced.reduce((a, b) => (b.usdPerImage > a.usdPerImage ? b : a));
  return {
    usd: dearest.usdPerImage,
    basis: "estimated",
    note:
      `Estimated at the dearest declared per-image rate: $${dearest.usdPerImage} on ` +
      `${dearest.provider}/${dearest.model}` +
      (dearest.atSize ? ` at image_size ${dearest.atSize}` : "") +
      `, checked ${dearest.checked}. Which vendor answers is decided per call, so this errs high on ` +
      "purpose. Whatever the render reports afterwards replaces it.",
  };
}

/** The whole public table, and the one estimate most callers actually want. */
export function priceTable(): PriceTable {
  return {
    perImage: estimatePerImage(),
    prices: PRICES.map((p) => ({
      provider: p.provider,
      model: p.model,
      bills: p.bills,
      usdPerImage: p.usdPerImage,
      atSize: p.atSize,
      source: p.source,
      checked: p.checked,
    })),
  };
}
