import "server-only";

import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import { queryEvents } from "@gt/kernel/events-query";

import { FIXTURE_MODE } from "../../../../lib/fixtures/mode.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import type { LiveJob, WeirItem } from "../../../../lib/ledger/v1/types.ts";
import { freshLedger } from "../../../../lib/ledger/v1/sync.ts";
import { liveRead } from "../../_shell/live.ts";
import { publishedSlots, railSlot } from "./model.ts";
import { readShelf, type Shelf } from "./shelf.ts";

// THE FLOOR'S ONE READ, at render time and server-side only (plan §9.2), each part bounded:
//
//   live work   the request's one liveNow() (../../_shell/live.ts, shared with the header):
//               v1's running jobs (the Foundry column), its Weir piles, its unsettled slots;
//   ratified    the Library/Projects column through v1's readers (./shelf.ts);
//   published   the ledger's newest PUBLISHED_CAP `publish` acts and their slots' `slot.create`
//               (one query each), because v1's live read drops a slot once it is history;
//   head        the ledger's newest seq, where the live feed continues from.
//
// It also asks for a fresh ledger (freshLedger: non-blocking, claim-guarded, at most every
// 30 s), so a Floor left open keeps the ledger current, as Runs does.

export const PUBLISHED_CAP = 40;

export type FloorData = {
  readonly now: number;
  readonly head: number;
  readonly universe: "real" | "fixture";
  readonly jobs: readonly LiveJob[];
  readonly weir: readonly WeirItem[];
  readonly slots: readonly RailSlot[];
  readonly shelf: Shelf;
  /** What could not be read, by source, in its own words: drawn as gaps, never as "nothing". */
  readonly problems: readonly { readonly source: string; readonly error: string }[];
};

export async function loadFloor(now: number = Date.now()): Promise<FloorData> {
  const problems: { source: string; error: string }[] = [];
  const sync = freshLedger();
  if (!sync.ok) problems.push({ source: "ledger-sync", error: sync.error.message });

  const [live, shelf] = await Promise.all([liveRead(), readShelf()]);
  problems.push(...live.failures);

  const slots: RailSlot[] = live.slots.map(railSlot);
  let head = 0;
  const k = kernel();
  if (!k.ok) problems.push({ source: "kernel", error: k.error.message });
  else {
    const pubs = queryEvents(k.value.store, { type: ["publish"], by: "time", order: "desc", limit: PUBLISHED_CAP });
    if (!pubs.ok) problems.push({ source: "ledger", error: pubs.error.message });
    else {
      head = pubs.value.head;
      const ids = [...new Set(pubs.value.events.map((e) => (typeof e.data["slotId"] === "string" ? e.data["slotId"] : e.subject.id)))];
      const creates = ids.length === 0 ? null : queryEvents(k.value.store, { type: ["slot.create"], subject: { ids }, limit: PUBLISHED_CAP });
      if (creates !== null && !creates.ok) problems.push({ source: "ledger", error: creates.error.message });
      slots.push(...publishedSlots(pubs.value.events, creates?.ok === true ? creates.value.events : []));
    }
  }

  return { now, head, universe: FIXTURE_MODE ? "fixture" : "real", jobs: live.jobs, weir: live.weir, slots, shelf, problems };
}
