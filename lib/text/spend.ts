// TEXT SPEND — what the text turns cost, counted and never refused.
//
// Card IMG-A stage 3b, carrying out the operator's 2026-10-07 answer "Count
// only, refuse nothing". The `text-usd` class (lib/spend/classes.ts) has no
// ceiling, so nothing here can refuse a turn: this file books and reads, and no
// code under lib/text calls reserve(). The tests pin both.
//
// WHAT IS BOOKED. Only a figure the vendor reported for the turn
// (`costBasis: "vendor-reported"`, which today is the claude CLI's own
// `total_cost_usd`). An unpriced or merely estimated turn books NO row and bumps
// `counters.unpriced`, so a total reads as the lower bound it is — never a $0 row,
// never an invented number. A failed turn is booked only when its error carries
// a vendor-reported cost (`detail.costUsd`): today that is a served answer the
// router's schema check refused (router.ts::checkServed) - the engine ran and
// billed, and the answer was unusable. A failed turn that REACHED an engine
// (`TextError.dispatched`: a vendor status, a timeout in flight, a process that
// ran) and reports no cost books an unpriced entry, which bumps
// `counters.unpriced` like an unpriced served turn: "every call that reached the
// provider gets a row" (cost-metering, failures are spend), and a failure that
// never left the machine (no key, no binary, DNS) is not one.
//
// BOOKING NEVER REACHES THE TURN. It runs at the settle point beside logTurn and
// swallows its own failure: what reason() and retrieve() return or throw is
// decided before this runs. The booking functions return a promise (card IMG-A
// stage 3a: the store may be a file behind an async lock) that never rejects; a
// booking that misses the lock is kept and applied late by the kernel, never
// dropped (lib/spend/meter.ts).

import { errorMessage } from "@gt/domain/errors";

import { SPEND_CLASSES } from "../spend/classes";
import { createMeter, type CountStats, type MeterAxes, type MeterRow } from "../spend/meter";
import { spendStoreFor } from "../spend/select";
import type { SpendStore } from "../spend/store";
import { TextError } from "./errors";
import type { TextProvenance } from "./types";

const CLASS = SPEND_CLASSES["text-usd"];

export const TEXT_SPEND_WINDOW_VAR = CLASS.windowVar;

export type TextSpendBasis = "vendor" | "unpriced";

export interface TextSpendEntry {
  usd: number | undefined;
  turn: string;
  provider: string;
  model: string;
  outcome: "served" | "failed";
  basis: TextSpendBasis;
  at?: number;
}

type TextAxes = { turn: string; provider: string; model: string };
export type TextSpendRow = MeterRow<TextAxes, TextSpendBasis>;

const hooks = {
  entry: (e: TextSpendEntry) => ({
    amount: e.usd,
    outcome: e.outcome,
    basis: e.basis,
    axes: { turn: e.turn, provider: e.provider, model: e.model },
    at: e.at,
  }),
};

// On the store lib/spend/select.ts picks for this class: the machine's file
// store, or memory where pinned or managed.
let meter = createMeter<TextSpendEntry, TextAxes, TextSpendBasis>(CLASS, hooks, spendStoreFor(CLASS.id));

/** Test hook: put the ledger on another store (one that throws, say); null
 *  puts it back on the selected one. */
export function __setTextSpendStore(store: SpendStore<TextSpendRow> | null): void {
  meter = createMeter<TextSpendEntry, TextAxes, TextSpendBasis>(CLASS, hooks, store ?? spendStoreFor(CLASS.id));
}

export function __resetTextSpend(): void {
  meter.reset();
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** A vendor-reported cost an error carries, or undefined. Never a guess. */
function errorCostUsd(err: unknown): number | undefined {
  if (!(err instanceof TextError)) return undefined;
  const d = err.detail as { costUsd?: unknown; costBasis?: unknown } | undefined;
  if (d && d.costBasis === "vendor-reported" && finite(d.costUsd)) return d.costUsd;
  return undefined;
}

/** Book one served turn from its provenance. Never throws. */
export async function bookServedTurn(
  p: Pick<TextProvenance, "turn" | "provider" | "model" | "costUsd" | "costBasis">,
): Promise<void> {
  try {
    const vendor = p.costBasis === "vendor-reported" && finite(p.costUsd);
    await meter.book({
      usd: vendor ? p.costUsd : undefined,
      turn: p.turn,
      provider: p.provider,
      model: p.model,
      outcome: "served",
      basis: vendor ? "vendor" : "unpriced",
    });
  } catch (e) {
    console.log(`[text] spend booking failed (turn unaffected): ${errorMessage(e)}`);
  }
}

/** Book a failed turn: its vendor-reported cost, or - when it reached an engine
 *  and reports none - an unpriced entry. Never throws. */
export async function bookFailedTurn(turn: string, err: unknown): Promise<void> {
  try {
    const usd = errorCostUsd(err);
    if (usd === undefined && !(err instanceof TextError && err.dispatched)) return;
    const model = err instanceof TextError ? (err.detail as { model?: unknown } | undefined)?.model : undefined;
    await meter.book({
      usd,
      turn,
      provider: err instanceof TextError ? (err.provider ?? "unknown") : "unknown",
      model: typeof model === "string" && model ? model : "unknown",
      outcome: "failed",
      basis: usd === undefined ? "unpriced" : "vendor",
    });
  } catch (e) {
    console.log(`[text] spend booking failed (turn unaffected): ${errorMessage(e)}`);
  }
}

/** The window's totals and counters. Count-only: no ceiling, no remaining. */
export function textSpendStats(now?: number): Promise<CountStats> {
  return meter.stats(now);
}

/** The window's spend by turn, provider and model, and by outcome. */
export function textSpendByAxis(now?: number): Promise<MeterAxes> {
  return meter.byAxis(now);
}

export function textSpendRows(now?: number): Promise<TextSpendRow[]> {
  return meter.rows(now);
}
