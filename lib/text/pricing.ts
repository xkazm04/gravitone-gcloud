// PRICING — the one place a price for a reasoning turn lives.
//
// THE RULE THIS FILE INHERITS, VERBATIM, FROM lib/imaging/pricing.ts: never
// invent a price. Every row below either carries a figure WITH the source it
// came from and the date that source was checked, or carries no figure and the
// reason there is none. `undefined` is a decision, not an omission — read the
// `source` line.
//
// WHY THIS ENGINE IS MOSTLY UNPRICED TODAY, AND WHY THAT IS THE CORRECT STATE:
//
//   · `claude-cli` is the easy one and it is the opposite of a problem. The CLI
//     reports `total_cost_usd` in its own result envelope, so every local turn
//     carries a VENDOR-REPORTED figure and needs no table row at all. This file
//     exists for the other side.
//   · `google` bills per token, and nobody on this tree has measured a rate for
//     the text models. Writing a plausible-looking number here would be worse
//     than writing none: /api/recalibrate returns its cost to the client, which
//     stages it onto the version it creates, so a guessed figure would be
//     PERSISTED beside a creator's work as though it were fact.
//
// So the cloud rows are deliberately unpriced and say so out loud, on the wire
// (`costBasis: "unpriced"`) and in the log (`cost=unpriced`, never `cost=$0`).
// An unpriced call is UNPRICED, not free. Filling these in is a one-line edit
// per row plus a `checked` date — which is the whole reason the shape is here
// before the numbers are.
//
// SERVER ONLY, like everything under lib/text/. Not because it holds a secret —
// it holds none, reads no process.env, and imports nothing that does — but
// because the directory is the seam that keeps credentials out of the browser
// bundle. Keep it that way: a `keyFor()` in here would put the seam's whole
// purpose behind one convenience.

import type { CostBasis, TextProviderId } from "./types";

export interface TextPriceQuote {
  /** USD for the whole turn. `undefined` iff `basis` is "unpriced". */
  usd?: number;
  basis: CostBasis;
  /** Where the figure came from, or why there is none. Safe to log or show. */
  note: string;
}

interface TextModelPrice {
  provider: TextProviderId;
  /** Exact model id as it goes on the wire, and as it lands in Provenance. */
  model: string;
  /** USD per million INPUT tokens. Absent = deliberately unpriced. */
  usdPerMInput?: number;
  /** USD per million OUTPUT tokens. Absent = deliberately unpriced. */
  usdPerMOutput?: number;
  /** How we know, or why we do not. Required on every row. */
  source: string;
  /** ISO date the `source` was last checked. */
  checked: string;
}

/**
 * The table. One row per model this app can actually reach.
 *
 * Every row is currently unpriced, and each says why in its own words rather
 * than sharing one apologetic footnote — because the reasons differ, and the
 * work needed to fix each one differs with them.
 */
const PRICES: TextModelPrice[] = [
  {
    provider: "claude-cli",
    model: "claude-opus-5",
    source:
      "No table row is used for this model: the CLI reports `total_cost_usd` per run in its own " +
      "result envelope, so every local turn carries a vendor-reported figure straight from the " +
      "transport. This row exists so a reader looking for the model here finds the explanation " +
      "rather than an absence. If the envelope ever stops carrying the field, THIS is the row to fill.",
    checked: "2026-08-27",
  },
  {
    provider: "google",
    model: "gemini-3.6-flash",
    source:
      "REACHABLE, UNPRICED. Called live on 2026-08-27 with this repo's key: HTTP 200, 4.7s, " +
      "native responseSchema honoured, usage reported as in=20 out=27 thoughts=345. So the " +
      "TOKEN COUNTS are real and arrive on every call — what is missing is only the RATE. " +
      "Nobody here has read the published per-token price, and /api/recalibrate persists its " +
      "cost figure onto a creator's version, so a guess would be filed beside their work as " +
      "fact. Fill in usdPerMInput/usdPerMOutput from ai.google.dev/pricing and set `checked`; " +
      "the moment both are set this row starts pricing every turn with no other change.",
    checked: "2026-08-27",
  },
  {
    provider: "google",
    model: "gemini-3.1-pro-preview",
    source:
      "REACHABLE, UNPRICED — same state and same remedy as the flash row above. Called live on " +
      "2026-08-27: HTTP 200, 15.5s, native responseSchema honoured, in=20 out=27 thoughts=679. " +
      "Named separately because it serves the `edit-plan` turn (providers/google.ts's " +
      "MODEL_FOR_TURN) and bills at a different rate, so one row cannot stand in for both. " +
      "NOTE its thinking ratio: 25x the visible answer, which is why the adapter adds " +
      "thoughtsTokenCount into `outputTokens` before calling this function.",
    checked: "2026-08-27",
  },
  {
    provider: "google",
    model: "gemini-3.7-flash",
    source:
      "NOT IN SERVICE HERE. Present on the roster and NOT used by MODEL_FOR_TURN: the " +
      "2026-08-27 pass got HTTP 503 'currently experiencing high demand' after 9.8s. A row is " +
      "kept so that promoting it later is an edit to a table that already knows about it, and " +
      "so the 503 is recorded rather than rediscovered.",
    checked: "2026-08-27",
  },
];

/**
 * Price one turn.
 *
 * Token counts are OPTIONAL because not every transport reports them and this
 * function must be callable either way. With no counts, or with no rate on the
 * row, the answer is `unpriced` with the row's own `source` as the note — which
 * is what reaches the log and the client, so the reason a number is missing
 * travels with its absence.
 */
export function priceTurn(args: {
  provider: TextProviderId;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}): TextPriceQuote {
  const row = PRICES.find((p) => p.provider === args.provider && p.model === args.model);
  if (!row)
    return {
      basis: "unpriced",
      note:
        `No price row for ${args.provider}/${args.model}. A model this app can reach but cannot ` +
        `price is a gap in lib/text/pricing.ts, not a free call.`,
    };

  const { usdPerMInput: inRate, usdPerMOutput: outRate } = row;
  if (inRate === undefined || outRate === undefined || args.inputTokens === undefined)
    return { basis: "unpriced", note: row.source };

  const usd =
    (args.inputTokens / 1_000_000) * inRate + ((args.outputTokens ?? 0) / 1_000_000) * outRate;
  return {
    usd,
    basis: "estimated",
    note: `${row.source} (checked ${row.checked})`,
  };
}

/** The table, for a diagnostics surface that wants to show what is and is not
 *  priced. Returned as data rather than rendered here — same reason imaging's
 *  `priceTable()` exists. */
export function textPriceTable(): readonly TextModelPrice[] {
  return PRICES;
}
