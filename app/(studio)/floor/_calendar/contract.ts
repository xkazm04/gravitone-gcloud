// THE CALENDAR PORT AS THE SCREEN HOLDS IT - client-safe (types only): the Server Actions the
// Floor's slot level and schedule sheet call, and the shapes they draw. A slot is drawn on the
// rail and the month as a RailSlot (@gt/ui floor/calendar.ts) and opened as a SlotView
// (@gt/ui floor/SlotDetail); both sides of ./port.ts answer in those shapes, so the screen
// cannot tell them apart.
//
// Every verb answers the action core's envelope (app/_server/actionCore.ts) - `{ok, value}` or
// `{ok, error}`, never a throw - and returns the slot as it now is, so a level redraws from the
// answer rather than from a guess about what the verb did. A verb carries the revision the
// operator saw (`baseRev`, SlotView.rev): a slot that moved since - the tick claimed it, another
// tab moved it - is refused with `conflict`, in the work's words, and nothing is overwritten.

import type { ChannelReady, PublishTick, ScheduleDraft, ScheduleItem } from "@gt/ui/components/floor/schedule.ts";
import type { SlotView } from "@gt/ui/components/floor/SlotDetail.tsx";

import type { ActionResult } from "../../../_server/actionCore.ts";

/** What could not be read, by source, in its own words: drawn as a gap, never as "nothing". */
export type Problem = { readonly source: string; readonly error: string };

type Verb = { readonly id: string; readonly baseRev?: number };

export type CalendarPort = {
  readonly detail: (input: { readonly id: string }) => Promise<ActionResult<SlotView>>;
  /** To `at` (an ISO instant): scheduled stays scheduled, missed and failed are scheduled again. */
  readonly move: (input: Verb & { readonly at: string }) => Promise<ActionResult<SlotView>>;
  /** Soft: the slot stays in the calendar, struck; a failure keeps its sentence. */
  readonly cancel: (input: Verb) => Promise<ActionResult<SlotView>>;
  /** Overrides the missed window; never a claim left behind. */
  readonly publishNow: (input: Verb) => Promise<ActionResult<SlotView>>;
  /** Put a Library item on a channel at an instant (the schedule sheet). */
  readonly schedule: (input: ScheduleDraft) => Promise<ActionResult<SlotView>>;
  /** What there is to schedule: the Library's exports, newest first. */
  readonly items: () => Promise<ActionResult<readonly ScheduleItem[]>>;
};

/**
 * What the month draws beside the slots, read with the page: each channel's readiness and
 * standing, how a publish goes out here, the channel the calendar last scheduled on (the form's
 * default), and the worker's publish timer (L62's lease heartbeat; absent where no store says).
 */
export type CalendarFacts = {
  readonly channels: readonly ChannelReady[];
  readonly mode: "dry" | "live";
  readonly lastChannel: string | null;
  readonly tick?: PublishTick;
};
