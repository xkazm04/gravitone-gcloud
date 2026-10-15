// THE HEADER'S NUMBERS, as pure functions over what the server read: which pile is NEXT, and
// what the last 24 hours cost. The Floor uses the same NEXT, so the header's button and the
// Floor's amber ring can never name two different piles.
//
// NEXT is the oldest pile still waiting on the operator (a pile with something pending), by
// the instant v1 recorded it became ready. A pile v1 gave no instant to is drawn after every
// dated one - its age is unknown, and "unknown" is not "oldest". Ties fall to the Floor's lane
// order, then source and id, so two renders of the same piles always name the same NEXT.
//
// Client-safe: types only from lib/ (erased) and @gt/domain.

import type { Cost, Event } from "@gt/domain/event";
import type { MediaLane } from "@gt/domain/lane";
import type { Spend } from "@gt/ui/components/header/header.ts";

import type { WeirItem } from "../../../lib/ledger/v1/types.ts";

const LANE_RANK: { readonly [L in MediaLane]: number } = { image: 0, article: 1, audio: 2, video: 3 };

const sinceMs = (w: Pick<WeirItem, "since">): number => {
  const t = w.since === undefined ? Number.NaN : Date.parse(w.since);
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
};

/** The order piles are drawn and chosen in: oldest first, undated last, then lane, source, id. */
export function pileOrder(a: WeirItem, b: WeirItem): number {
  const ta = sinceMs(a);
  const tb = sinceMs(b);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return LANE_RANK[a.media] - LANE_RANK[b.media] || a.source.localeCompare(b.source) || a.id.localeCompare(b.id);
}

/** The oldest pile with anything pending, or null when the weir is clear. */
export function nextPile(weir: readonly WeirItem[]): WeirItem | null {
  return [...weir].filter((w) => w.pending > 0).sort(pileOrder)[0] ?? null;
}

/** The priced acts' sum, split by where each figure came from. */
export function spendOf(events: readonly Pick<Event, "cost">[], capped: boolean): Spend {
  let total = 0;
  let priced = 0;
  const bySrc: Partial<Record<Cost["src"], number>> = {};
  for (const e of events) {
    if (e.cost === undefined) continue;
    total += e.cost.usd;
    priced++;
    bySrc[e.cost.src] = (bySrc[e.cost.src] ?? 0) + e.cost.usd;
  }
  return { total, bySrc, priced, capped };
}
