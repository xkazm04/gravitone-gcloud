import "server-only";

import { cache } from "react";

import type { Event } from "@gt/domain/event";
import type { Spend } from "@gt/ui/components/header/header.ts";
import { queryEvents, type TimeCursor } from "@gt/kernel/events-query";

import { kernel } from "../../../lib/kernelStore.ts";
import { nextScoutPile, SCOUT_PILE_SOURCES, spendOf } from "./facts.ts";
import { liveRead } from "./live.ts";
import { packetIdOf } from "./links.ts";

// THE HEADERS' FACTS, read on the server (prototype shell.js `header({next, spend})`):
//
//   spend  every priced ledger act in the last 24 hours, drawn by the studio header on every
//          (studio) page AND by the Scout header. Only the spend projection prices acts
//          (lib/ledger/v1/sources/spend.ts books a `cost`), so the read is that source's acts
//          in the window, paged by time; past SPEND_PAGES pages the sum is reported as a floor.
//          React's request cache makes the second header in one render take the first's read.
//   next   the Scout header's NEXT (spark scout-storyboards WP2): the oldest scout or seeds pile
//          waiting on the operator (./facts.ts nextScoutPile) and the packet it opens as; the
//          Scout header links it to that packet on its Runs tab (ScoutHead.tsx runFor). Until 2026-10-24 the studio header carried a NEXT over every source and a
//          ledger +N; the operator moved the one into the Scout header and dropped the other
//          (the Ledger is in the nav). So the studio header no longer walks v1 (liveRead) at
//          all - only the Scout header and the Floor do.
//
// A store that cannot be read gives null for what it would have said - the chip shows the
// failure, never a $0 that reads as "nothing was spent", and never an absent NEXT that reads as
// "nothing is waiting" when the scout's own stores could not be read.

const DAY_MS = 86_400_000;
const PAGE = 1000;
export const SPEND_PAGES = 5;

export type SpendFacts = {
  readonly spend: Spend | null;
  /** What could not be read, in the store's own words. */
  readonly problems: readonly string[];
};

/** A pile the Scout header names: what HeaderChips' NextButton draws, with the packet in place of the address. */
export type ScoutNext = { readonly title: string; readonly count: number; readonly packetId: string };

export type ScoutHeaderFacts = SpendFacts & {
  readonly next: ScoutNext | null;
  /** The scout's own pile sources that could not be read: a null `next` is then unknown, not clear. */
  readonly nextProblems: readonly string[];
};

/** The last 24 hours' priced acts, as of `now`. */
export function readSpend(now: number): SpendFacts {
  const k = kernel();
  if (!k.ok) return { spend: null, problems: [`kernel: ${k.error.message}`] };
  const store = k.value.store;
  const events: Event[] = [];
  let cursor: TimeCursor | undefined;
  let capped = false;
  for (let i = 0; i < SPEND_PAGES; i++) {
    const page = queryEvents(store, { source: ["spend"], since: new Date(now - DAY_MS).toISOString(), by: "time", order: "desc", limit: PAGE, ...(cursor === undefined ? {} : { cursor }) });
    if (!page.ok) return { spend: null, problems: [`ledger: ${page.error.message}`] };
    events.push(...page.value.events);
    cursor = page.value.cursor;
    capped = page.value.capped;
    if (!capped || cursor === undefined) break;
  }
  return { spend: spendOf(events, capped), problems: [] };
}

/** The studio header's facts: the spend, read once per request. */
export const headerFacts: () => Promise<SpendFacts> = cache(async () => readSpend(Date.now()));

/** The Scout header's facts: the same spend, and the next scout pile. */
export async function scoutHeaderFacts(): Promise<ScoutHeaderFacts> {
  const [spend, read] = await Promise.all([headerFacts(), liveRead()]);
  const n = nextScoutPile(read.weir);
  const next = n === null ? null : { title: n.title, count: n.pending, packetId: n.packetId ?? packetIdOf(n.source, n.id) };
  const nextProblems = read.failures.filter((f) => SCOUT_PILE_SOURCES.has(f.source)).map((f) => `${f.source}: ${f.error}`);
  return { ...spend, next, nextProblems };
}
