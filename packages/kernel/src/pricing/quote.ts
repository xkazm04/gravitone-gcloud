import { parseAt } from "@gt/domain/door";
import { estimateSchema, type Estimate } from "@gt/domain/estimate";
import type { Result } from "@gt/domain/errors";
import { findRow, PRICE_TABLE, type PriceRow, type PriceUnit } from "./table.ts";

// QUOTING - what a call cost, or will cost, and how anyone knows.
//
// The pure half of v1's priceCall (lib/imaging/pricing.ts) and priceTurn
// (lib/text/pricing.ts), one function over the merged table. Their rules, kept:
//   - A VENDOR'S OWN FIGURE WINS. A rate that drifted out of date here can never
//     overwrite a receipt. Upgraded from lib/imaging/video/pricing.ts: a zero or
//     negative vendor figure is a MISSING figure, never a free call (imaging
//     accepted any finite number, so a vendor that answered `cost: 0` read free).
//   - A ROW MEASURED AT ONE SIZE PRICES ONLY THAT SIZE. Nano Banana roughly
//     doubles per size step; carrying a 1K figure to a 2K render is a fiction.
//   - EVERY UNIT THE CALL BILLS MUST BE PRICED, or the whole call is unpriced.
//     A text turn with a priced input rate and an unread output rate is not
//     "partly priced"; half a bill presented as a bill is an invented price.
//   - THE BASIS TRAVELS WITH THE NUMBER: vendor-reported is a receipt,
//     estimated is our arithmetic, unpriced carries its reason. An estimate
//     shown as a receipt is the error the basis exists to make impossible.
// New: the quote takes the DAY it prices for, so a dated rate (validUntil)
// stops pricing on its own instead of waiting for someone to read a footnote.

/** How many of each unit a call bills. Absent units are not billed. */
export type Usage = Partial<Record<PriceUnit, number>>;

export type CostBasis = "vendor-reported" | "estimated" | "unpriced";

export type Quote =
  | { readonly usd: number; readonly basis: "vendor-reported" | "estimated"; readonly note: string }
  | { readonly usd: null; readonly basis: "unpriced"; readonly note: string };

export type QuoteInput = {
  readonly provider: string;
  readonly model: string;
  readonly usage: Usage;
  /** ISO date (or instant) the quote prices for. Time is a parameter here. */
  readonly on: string;
  /** The request's pinned size, when it pinned one. */
  readonly size?: string;
  /** What the vendor itself said the call cost, in USD. */
  readonly vendorUsd?: number;
};

const unpriced = (note: string): Quote => ({ usd: null, basis: "unpriced", note });

function billed(usage: Usage): [PriceUnit, number][] {
  const out: [PriceUnit, number][] = [];
  for (const [unit, n] of Object.entries(usage) as [PriceUnit, number | undefined][]) {
    if (n !== undefined) out.push([unit, n]);
  }
  return out;
}

/** Why one row cannot price this call, or undefined when it can. */
function rowGap(row: PriceRow, size: string | undefined, day: string): string | undefined {
  if (row.usd === undefined) return row.source;
  if (row.atSize !== undefined && size !== row.atSize) {
    return `the ${row.provider}/${row.model} figure is measured at size ${row.atSize}; this call ${size === undefined ? "pins no size, so the vendor's default applies" : `asks for ${size}`} and the price does not carry over`;
  }
  if (row.validUntil !== undefined && day > row.validUntil) {
    return `the ${row.provider}/${row.model} ${row.unit} rate held until ${row.validUntil}; re-check it (${row.source})`;
  }
  return undefined;
}

export function quote(q: QuoteInput, table: readonly PriceRow[] = PRICE_TABLE): Quote {
  if (q.vendorUsd !== undefined && Number.isFinite(q.vendorUsd) && q.vendorUsd > 0) {
    return { usd: q.vendorUsd, basis: "vendor-reported", note: `${q.provider} reported this cost on the call itself` };
  }
  const units = billed(q.usage);
  if (units.length === 0) return unpriced(`no usage is known for ${q.provider}/${q.model} before the call, so there is nothing to multiply`);
  const day = q.on.slice(0, 10);
  let usd = 0;
  const parts: string[] = [];
  for (const [unit, n] of units) {
    if (!Number.isFinite(n) || n < 0) return unpriced(`usage ${unit}=${n} is not a count`);
    const row = findRow(table, q.provider, q.model, unit);
    if (row === undefined) {
      return unpriced(`no ${unit} price is declared for ${q.provider}/${q.model}; add a row with its source to the kernel price table, never a guess at the call site`);
    }
    const gap = rowGap(row, q.size, day);
    if (gap !== undefined || row.usd === undefined) return unpriced(gap ?? row.source);
    usd += (n / row.per) * row.usd;
    parts.push(`${n} ${unit} at $${row.usd}/${row.per === 1 ? "" : row.per.toLocaleString("en-US") + " "}${unit} (checked ${row.checked})`);
  }
  return { usd, basis: "estimated", note: `estimated: ${parts.join(" + ")}` };
}

/** A quote and a duration as the record model's Estimate (through its door). */
export function toEstimate(q: Quote, seconds: number): Result<Estimate> {
  const e = q.usd === null ? { seconds, usd: null, unpricedReason: q.note } : { seconds, usd: q.usd };
  return parseAt("estimate", estimateSchema, e);
}

/**
 * The dearest priced rate for one unit across the table: the PRE-CALL GATE's
 * figure (v1 estimatePerImage). A caller asking before the call cannot know
 * which vendor will answer, so the gate errs high on purpose - a guard may
 * guess, a ledger may not. Undefined when no row of that unit has a figure.
 */
export function dearestRate(unit: PriceUnit, on: string, table: readonly PriceRow[] = PRICE_TABLE): { row: PriceRow; usdPerUnit: number } | undefined {
  const day = on.slice(0, 10);
  let best: { row: PriceRow; usdPerUnit: number } | undefined;
  for (const row of table) {
    if (row.unit !== unit || row.usd === undefined) continue;
    if (row.validUntil !== undefined && day > row.validUntil) continue;
    const perUnit = row.usd / row.per;
    if (best === undefined || perUnit > best.usdPerUnit) best = { row, usdPerUnit: perUnit };
  }
  return best;
}
