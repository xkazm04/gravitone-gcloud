import "server-only";

import type { Event } from "@gt/domain/event";
import type { Spend } from "@gt/ui/components/header/header.ts";
import type { NextPile } from "@gt/ui/components/header/HeaderChips.tsx";
import { queryEvents, type TimeCursor } from "@gt/kernel/events-query";

import { kernel } from "../../../lib/kernelStore.ts";
import { nextPile, spendOf } from "./facts.ts";
import { liveRead } from "./live.ts";
import { boardFor, packetIdOf } from "./links.ts";

// THE HEADER'S FACTS, read on the server for every (studio) page (prototype shell.js
// `header({next, spend})`; the Ghosts of Phase 1 held their shape):
//
//   next   the oldest pile waiting on the operator (./facts.ts nextPile), linked to its packet's
//          Board through the one packet-id rule (./links.ts packetIdOf).
//   spend  every priced ledger act in the last 24 hours. Only the spend projection prices acts
//          (lib/ledger/v1/sources/spend.ts books a `cost`), so the read is that source's acts
//          in the window, paged by time; past SPEND_PAGES pages the sum is reported as a floor.
//   head   the ledger's newest seq: the client counts `ledger +N` against the operator's mark.
//
// A store that cannot be read gives null for what it would have said - the chip shows the
// failure, never a $0 that reads as "nothing was spent".

const DAY_MS = 86_400_000;
const PAGE = 1000;
export const SPEND_PAGES = 5;

export type HeaderFacts = {
  readonly next: NextPile | null;
  readonly spend: Spend | null;
  readonly head: number;
  /** What could not be read, in the store's own words. */
  readonly problems: readonly string[];
};

export async function headerFacts(now: number = Date.now()): Promise<HeaderFacts> {
  const problems: string[] = [];
  const read = await liveRead();
  for (const f of read.failures) problems.push(`${f.source}: ${f.error}`);
  const n = nextPile(read.weir);
  const next = n === null ? null : { title: n.title, count: n.pending, href: boardFor(packetIdOf(n.source, n.id)) };

  const k = kernel();
  if (!k.ok) return { next, spend: null, head: 0, problems: [...problems, `kernel: ${k.error.message}`] };
  const store = k.value.store;
  const events: Event[] = [];
  let head = 0;
  let cursor: TimeCursor | undefined;
  let capped = false;
  for (let i = 0; i < SPEND_PAGES; i++) {
    const page = queryEvents(store, { source: ["spend"], since: new Date(now - DAY_MS).toISOString(), by: "time", order: "desc", limit: PAGE, ...(cursor === undefined ? {} : { cursor }) });
    if (!page.ok) return { next, spend: null, head, problems: [...problems, `ledger: ${page.error.message}`] };
    head = page.value.head;
    events.push(...page.value.events);
    cursor = page.value.cursor;
    capped = page.value.capped;
    if (!capped || cursor === undefined) break;
  }
  return { next, spend: spendOf(events, capped), head, problems };
}
