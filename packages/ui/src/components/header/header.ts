// The header's three numbers as pure functions (prototype shell.js `header()`): what each
// counts, so the chips and the tests read one definition (app-shell badge-and-attention: a
// count carries its predicate).

import type { CostSource } from "@gt/domain/event";

export type Spend = {
  /** Every priced act's usd in the window, summed. */
  readonly total: number;
  /** The same sum by where each figure came from; absent sources had no priced act. */
  readonly bySrc: Readonly<Partial<Record<CostSource, number>>>;
  /** Priced acts counted. */
  readonly priced: number;
  /** The window held more priced acts than were read: the sum is a floor, not the total. */
  readonly capped: boolean;
};

const ORDER: readonly CostSource[] = ["real", "model", "illustrative"];

/** The parts drawn after the total: every source but `real`, which the total already is when alone. */
export function spendParts(s: Pick<Spend, "bySrc">): readonly { readonly src: CostSource; readonly usd: number }[] {
  const present = ORDER.filter((k) => s.bySrc[k] !== undefined);
  if (present.length === 1 && present[0] === "real") return [];
  return present.map((src) => ({ src, usd: s.bySrc[src] ?? 0 }));
}

/**
 * Ledger acts since the operator last looked (a newness badge: it clears when the Ledger is
 * visited, which stores the mark). The ledger's seq is gap-free by construction (the hash chain
 * refuses a missing seq, @gt/kernel/events verify), so the count is the difference. A mark
 * above the head is a different ledger (a reset store, the other data universe): everything
 * in this one is new.
 */
export function ledgerDelta(head: number, seen: number | undefined): number {
  if (seen === undefined) return 0;
  return seen > head ? head : head - seen;
}
