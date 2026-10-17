import "server-only";

// THE SEAM: which side the Calendar answers from. ONE switch, `SIDE`, the produce ports'
// (../../projects/_port/port.ts): GRAVITONE_PRODUCE_SIDE=fixture moves the whole studio into
// its fixture universe at once, so the Floor never draws fixture lanes beside real slots.
//
// Wave A (L58) built the slot level against the fixture (./fixture.ts: the domain's records and
// machine over an in-memory table). Wave B (L63) answers the real side from the kernel's slot
// store (./real.ts): the rail, the month, a slot's record, its verbs and the schedule form. The
// page, the actions and the Floor reach a side only through `serverCalendar()`.

import type { Result } from "@gt/domain/errors";
import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import type { ScheduleDraft, ScheduleItem } from "@gt/ui/components/floor/schedule.ts";
import type { SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";

import { SIDE } from "../../projects/_port/port.ts";
import type { CalendarFacts, Problem } from "./contract.ts";
import { applyCancel, applyMove, applyPublishNow, fixtureAct, fixtureDetail, fixtureFacts, fixtureItems, fixtureSchedule, fixtureSlots } from "./fixture.ts";
import { realCancel, realDetail, realItems, realMove, realPublishNow, realSchedule, realSlots, type Who } from "./real.ts";

/** One act's context: the instant (read once, by the action), who, and the revision seen. */
export type Act = { readonly nowMs: number; readonly who: Who; readonly baseRev?: number };

export type ServerCalendar = {
  /** The calendar and what the month draws beside it; a side that cannot read says so in `problems`. */
  readonly slots: (nowMs: number) => Promise<{ readonly slots: readonly RailSlot[]; readonly problems: readonly Problem[]; readonly facts?: CalendarFacts }>;
  readonly detail: (id: string, nowMs: number) => Result<SlotView>;
  readonly move: (id: string, at: string, act: Act) => Result<SlotView>;
  readonly cancel: (id: string, act: Act) => Result<SlotView>;
  readonly publishNow: (id: string, act: Act) => Result<SlotView>;
  readonly schedule: (draft: ScheduleDraft, act: Act) => Result<SlotView>;
  readonly items: () => Result<readonly ScheduleItem[]>;
};

const fixture: ServerCalendar = {
  slots: async (nowMs) => {
    const s = fixtureSlots(nowMs);
    const f = fixtureFacts(nowMs);
    const problems = [...(s.ok ? [] : [{ source: "calendar", error: s.error.message }]), ...(f.ok ? [] : [{ source: "calendar", error: f.error.message }])];
    return { slots: s.ok ? s.value : [], problems, ...(f.ok ? { facts: f.value } : {}) };
  },
  detail: fixtureDetail,
  move: (id, at, a) => fixtureAct(id, a.nowMs, (row) => applyMove(row, at, a.nowMs), a.baseRev),
  cancel: (id, a) => fixtureAct(id, a.nowMs, applyCancel, a.baseRev),
  publishNow: (id, a) => fixtureAct(id, a.nowMs, (row) => applyPublishNow(row, a.nowMs), a.baseRev),
  schedule: (d, a) => fixtureSchedule(d, a.nowMs),
  items: () => ({ ok: true, value: fixtureItems() }),
};

const base = (id: string, a: Act) => ({ id, nowMs: a.nowMs, who: a.who, ...(a.baseRev === undefined ? {} : { baseRev: a.baseRev }) });

const real: ServerCalendar = {
  slots: () => realSlots(),
  detail: (id) => realDetail(id),
  move: (id, at, a) => realMove({ ...base(id, a), at }),
  cancel: (id, a) => realCancel(base(id, a)),
  publishNow: (id, a) => realPublishNow(base(id, a)),
  schedule: (d, a) => realSchedule(d, a.who),
  items: realItems,
};

export function serverCalendar(): ServerCalendar {
  return SIDE === "fixture" ? fixture : real;
}
