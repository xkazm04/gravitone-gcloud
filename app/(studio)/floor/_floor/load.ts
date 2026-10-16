import "server-only";

import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import type { ApplyStatus } from "@gt/domain/board";
import type { MediaLane } from "@gt/domain/lane";
import { listPacketSummaries } from "@gt/kernel/decision/view";
import { queryEvents } from "@gt/kernel/events-query";

import { reconcileApplies } from "../../../../lib/decision/v1/applier.ts";
import { FIXTURE_MODE } from "../../../../lib/fixtures/mode.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import type { LiveJob, WeirItem } from "../../../../lib/ledger/v1/types.ts";
import { freshLedger } from "../../../../lib/ledger/v1/sync.ts";
import { liveRead } from "../../_shell/live.ts";
import { SIDE, serverProduce } from "../../projects/_port/port.ts";
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
// 30 s), so a Floor left open keeps the ledger current, as Runs does - and, the same way, for
// v1 to be caught up with the kernel's committed decisions (lib/decision/v1/applier.ts
// reconcileApplies). A decided packet whose outcome v1 has not taken yet is read from the
// kernel and drawn on its lane (`unapplied`): a stuck one with v1's sentence, verbatim.
//
// Phase 4 (L28): the runs the Floor composers launched come from the produce port
// (../../projects/_port/port.ts) and join v1's live work in their lane's Foundry column, each a
// door to its job in Runs. While the port answers from its fixture side they are fixture runs,
// and the page says so (`produce`).

export const PUBLISHED_CAP = 40;

export type FloorData = {
  readonly now: number;
  readonly head: number;
  readonly universe: "real" | "fixture";
  readonly jobs: readonly LiveJob[];
  /** Which side the produce port answers from (its runs are among `jobs`, source `produce`). */
  readonly produce: "fixture" | "real";
  readonly weir: readonly WeirItem[];
  readonly slots: readonly RailSlot[];
  readonly shelf: Shelf;
  /** Decided packets whose v1 apply has not landed (pending after a failure, or stuck). */
  readonly unapplied: readonly Unapplied[];
  /** What could not be read, by source, in its own words: drawn as gaps, never as "nothing". */
  readonly problems: readonly { readonly source: string; readonly error: string }[];
};

export type Unapplied = { readonly packetId: string; readonly lane: MediaLane; readonly title: string; readonly apply: ApplyStatus };

/** How many decided packets are looked at for an unapplied outcome (bounded-enumeration). */
const UNAPPLIED_SCAN = 100;

export async function loadFloor(now: number = Date.now()): Promise<FloorData> {
  const problems: { source: string; error: string }[] = [];
  const sync = freshLedger();
  if (!sync.ok) problems.push({ source: "ledger-sync", error: sync.error.message });

  const [live, shelf] = await Promise.all([liveRead(), readShelf()]);
  problems.push(...live.failures);

  const slots: RailSlot[] = live.slots.map(railSlot);
  let head = 0;
  const unapplied: Unapplied[] = [];
  const k = kernel();
  if (!k.ok) problems.push({ source: "kernel", error: k.error.message });
  else {
    const swept = reconcileApplies(k.value.store);
    if (!swept.ok) problems.push({ source: "decision-apply", error: swept.error.message });
    for (const state of ["committed", "returned"] as const) {
      const decided = k.value.store.read((r) => listPacketSummaries(r, { state, limit: UNAPPLIED_SCAN }));
      if (!decided.ok) problems.push({ source: "kernel", error: decided.error.message });
      else for (const p of decided.value.packets) if (p.apply !== undefined && (p.apply.state === "stuck" || p.apply.lastError !== undefined)) unapplied.push({ packetId: p.id, lane: p.lane, title: p.title ?? p.id, apply: p.apply });
    }
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

  const runs = serverProduce().listJobs();
  if (!runs.ok) problems.push({ source: "produce", error: runs.error.message });
  const produced: LiveJob[] = runs.ok
    ? runs.value.flatMap((j) =>
        j.media === undefined || j.projectId !== undefined || j.state === "done" || j.state === "cancelled"
          ? []
          : [{ source: "produce", id: j.id, title: j.title, lane: j.lane, media: j.media, state: j.state, ...(j.state === "running" ? { startedAt: new Date(j.s).toISOString() } : {}), attempt: j.attempt, ...(j.error === undefined ? {} : { error: j.error }), href: `/projects/runs?job=${encodeURIComponent(`kernel:${j.id}`)}` }],
      )
    : [];

  return { now, head, universe: FIXTURE_MODE ? "fixture" : "real", produce: SIDE, jobs: [...live.jobs, ...produced], weir: live.weir, slots, shelf, unapplied, problems };
}
