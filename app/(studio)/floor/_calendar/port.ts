import "server-only";

// THE SEAM: which side the Calendar answers from. ONE switch, `SIDE`, the produce ports'
// (../../projects/_port/port.ts): GRAVITONE_PRODUCE_SIDE=fixture moves the whole studio into
// its fixture universe at once, so the Floor never draws fixture lanes beside real slots.
//
// Wave A (L58) built the slot level against the fixture (./fixture.ts: the domain's records and
// machine over an in-memory table). The real side (./real.ts) reads the rail as the Floor
// always has and refuses a slot's record and its verbs until the kernel's slot store lands
// (wave B); nothing else here moves then - the page, the actions and the Floor reach a side
// only through `serverCalendar()`.

import type { Result } from "@gt/domain/errors";
import type { RailSlot } from "@gt/ui/components/floor/calendar.ts";
import type { SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";

import { SIDE } from "../../projects/_port/port.ts";
import type { Problem } from "./contract.ts";
import { applyCancel, applyMove, applyPublishNow, fixtureAct, fixtureDetail, fixtureSlots } from "./fixture.ts";
import { realAct, realDetail, realSlots } from "./real.ts";

export type ServerCalendar = {
  readonly slots: (nowMs: number) => Promise<{ readonly slots: readonly RailSlot[]; readonly problems: readonly Problem[] }>;
  readonly detail: (id: string, nowMs: number) => Result<SlotView>;
  readonly move: (id: string, at: string, nowMs: number) => Result<SlotView>;
  readonly cancel: (id: string, nowMs: number) => Result<SlotView>;
  readonly publishNow: (id: string, nowMs: number) => Result<SlotView>;
};

const fixture: ServerCalendar = {
  slots: async (nowMs) => {
    const s = fixtureSlots(nowMs);
    return s.ok ? { slots: s.value, problems: [] } : { slots: [], problems: [{ source: "calendar", error: s.error.message }] };
  },
  detail: fixtureDetail,
  move: (id, at, nowMs) => fixtureAct(id, nowMs, (row) => applyMove(row, at, nowMs)),
  cancel: (id, nowMs) => fixtureAct(id, nowMs, applyCancel),
  publishNow: (id, nowMs) => fixtureAct(id, nowMs, (row) => applyPublishNow(row, nowMs)),
};

const real: ServerCalendar = {
  slots: () => realSlots(),
  detail: (id) => realDetail(id),
  move: (id) => realAct(id, "move"),
  cancel: (id) => realAct(id, "cancel"),
  publishNow: (id) => realAct(id, "publish"),
};

export function serverCalendar(): ServerCalendar {
  return SIDE === "fixture" ? fixture : real;
}
