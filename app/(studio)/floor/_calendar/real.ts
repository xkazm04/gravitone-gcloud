import "server-only";

// THE CALENDAR'S REAL SIDE, until the slot store is the kernel's (Phase 6 wave B, L57's
// `slots` module and its importer). What it can answer today it answers the way the Floor
// always has: the rail's slots are v1's live read (lib/publish through the ledger sync's
// `liveNow`, request-cached in ../../_shell/live.ts) plus the ledger's `publish` acts, because
// v1's live read drops a slot once it is history. A v1 drift arrives as one of
// lib/publish/schedule.ts DRIFT_TEXT's two sentences in `error`; it is read back into the
// slot's own `drift` field here, at the edge, so nothing downstream parses an error string.
//
// What it cannot answer it REFUSES, in words: a slot's record and the three verbs need the
// slot table (one tx per write, a `slot.*` event beside it), and answering them from v1's JSON
// would be a second writer the cutover then has to retire - v1's two-writer lock is the
// defect the kernel store ends. Wave B replaces the refusals; the contract does not move.

import { err, type Result } from "@gt/domain/errors";
import { queryEvents } from "@gt/kernel/events-query";
import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import type { SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";

import { DRIFT_TEXT, type SlotDrift } from "../../../../lib/publish/schedule.ts";
import { kernel } from "../../../../lib/kernelStore.ts";
import { liveRead } from "../../_shell/live.ts";
import { publishedSlots, railSlot } from "../_floor/model.ts";
import type { Problem } from "./contract.ts";

/** How many publications the rail reads back from the ledger (bounded-enumeration). */
export const PUBLISHED_CAP = 40;

const DRIFTS: readonly { readonly drift: SlotDrift; readonly text: string }[] = [
  { drift: "export_missing", text: DRIFT_TEXT.export_missing },
  { drift: "channel_not_wired", text: DRIFT_TEXT.channel_not_wired },
];

/** v1's drift sentence as the field it stands for; any other error is kept verbatim. */
export function driftOf(s: RailSlot): RailSlot {
  const hit = s.error === undefined ? undefined : DRIFTS.find((d) => d.text === s.error);
  if (hit === undefined) return s;
  const { error: _e, ...rest } = s;
  return { ...rest, drift: hit.drift };
}

export async function realSlots(): Promise<{ readonly slots: readonly RailSlot[]; readonly problems: readonly Problem[] }> {
  const problems: Problem[] = [];
  const live = await liveRead();
  const slots: RailSlot[] = live.slots.map((s) => driftOf(railSlot(s)));
  const k = kernel();
  if (!k.ok) return { slots, problems: [{ source: "calendar", error: k.error.message }] };
  const pubs = queryEvents(k.value.store, { type: ["publish"], by: "time", order: "desc", limit: PUBLISHED_CAP });
  if (!pubs.ok) return { slots, problems: [{ source: "ledger", error: pubs.error.message }] };
  const ids = [...new Set(pubs.value.events.map((e) => (typeof e.data["slotId"] === "string" ? e.data["slotId"] : e.subject.id)))];
  const creates = ids.length === 0 ? null : queryEvents(k.value.store, { type: ["slot.create"], subject: { ids }, limit: PUBLISHED_CAP });
  if (creates !== null && !creates.ok) problems.push({ source: "ledger", error: creates.error.message });
  slots.push(...publishedSlots(pubs.value.events, creates?.ok === true ? creates.value.events : []));
  return { slots, problems };
}

export const NOT_YET = "the slot store is not the kernel's yet (Phase 6 wave B): this slot's record and its verbs answer on the fixture side only";

export const realDetail = (id: string): Result<SlotView> => err("unavailable", `slot ${id}: ${NOT_YET}`);
export const realAct = (id: string, verb: string): Result<SlotView> => err("unavailable", `${verb} ${id}: ${NOT_YET}`);
