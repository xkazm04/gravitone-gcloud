// THE SLOT MACHINE, zod-free: the transition table and its state union, apart from
// the record schema in ./slot.ts (which re-exports both, so every existing import path holds).
// A client draws states from this table (@gt/ui status vocabulary); importing the schema
// file for it would carry zod into the browser bundle, so the table lives where only
// ./transitions.ts follows it in. tests/next-gates/client-closure.test.ts holds that line.

import { defineMachine } from "./transitions.ts";

/**
 * v1's table, verbatim:
 *   scheduled  -> publishing (a tick CLAIMS it) | missed | cancelled | scheduled (reschedule)
 *   publishing -> published | failed
 *   missed     -> scheduled | cancelled
 *   failed     -> scheduled | cancelled
 *
 * AT-MOST-ONCE lives in what is ABSENT: there is no `publishing -> scheduled`.
 * A slot is claimed before anything is uploaded, and a holder that dies
 * mid-publish leaves it `publishing`; the next sweep marks it `failed`
 * ("interrupted"), visibly, and a person reschedules it. Nothing re-fires it.
 * MISSED: overdue past the window is never published late — a stale upload
 * after downtime is worse than none.
 */
export const slotMachine = defineMachine({
  scheduled: ["publishing", "missed", "cancelled", "scheduled"],
  publishing: ["published", "failed"],
  missed: ["scheduled", "cancelled"],
  failed: ["scheduled", "cancelled"],
  published: [],
  cancelled: [],
});
export type SlotState = (typeof slotMachine.states)[number];

/**
 * The states that HOLD an item on a channel (v1 schedule.ts `ACTIVE`): one such slot per
 * item x channel, so the same export never goes up twice on one channel. A published slot
 * still holds it; a missed, failed or cancelled one does not - the item can be slotted
 * again, and the stale slot reschedules only if nothing else took its place.
 */
export const SLOT_HOLDS: readonly SlotState[] = ["scheduled", "publishing", "published"];
/** What a person may move or publish now (v1 RESCHEDULABLE), and cancel (v1 CANCELLABLE). */
export const SLOT_MOVABLE: readonly SlotState[] = ["scheduled", "missed", "failed"];
