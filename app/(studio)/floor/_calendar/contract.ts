// THE CALENDAR PORT AS THE SCREEN HOLDS IT - client-safe (types only): the Server Actions the
// Floor's slot level calls, and the shapes it draws. A slot is drawn on the rail and the month
// as a RailSlot (@gt/ui floor/calendar.ts) and opened as a SlotView (@gt/ui floor/SlotDetail);
// both sides of ./port.ts answer in those shapes, so the screen cannot tell them apart.
//
// Every verb answers the action core's envelope (app/_server/actionCore.ts) - `{ok, value}` or
// `{ok, error}`, never a throw - and returns the slot as it now is, so the level redraws from
// the answer rather than from a guess about what the verb did.

import type { SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";

import type { ActionResult } from "../../../_server/actionCore.ts";

/** What could not be read, by source, in its own words: drawn as a gap, never as "nothing". */
export type Problem = { readonly source: string; readonly error: string };

export type CalendarPort = {
  readonly detail: (input: { readonly id: string }) => Promise<ActionResult<SlotView>>;
  /** To `at` (an ISO instant): scheduled stays scheduled, missed and failed are scheduled again. */
  readonly move: (input: { readonly id: string; readonly at: string }) => Promise<ActionResult<SlotView>>;
  /** Soft: the slot stays in the calendar, struck; a failure keeps its sentence. */
  readonly cancel: (input: { readonly id: string }) => Promise<ActionResult<SlotView>>;
  /** Overrides the missed window; never a claim left behind. */
  readonly publishNow: (input: { readonly id: string }) => Promise<ActionResult<SlotView>>;
};
