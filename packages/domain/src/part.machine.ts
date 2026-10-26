// THE PART MACHINE, zod-free: the transition table and its state union, apart from
// the record schema in ./part.ts (which re-exports both, so every existing import path holds).
// A client draws states from this table (@gt/ui status vocabulary); importing the schema
// file for it would carry zod into the browser bundle, so the table lives where only
// ./transitions.ts follows it in. tests/next-gates/client-closure.test.ts holds that line.

import { defineMachine } from "./transitions.ts";

/**
 * The prototype's job words (projects.js STATUS_TO_STATE), which are the
 * design's: done -> ratified, planned -> draft, gate -> awaiting_gate.
 *
 * A part's state is derived, never written (./plan.ts `partStatesOf`), so this table is the
 * closure of that function; machines.test.ts walks the derivation and holds every move to it.
 * A work part's `awaiting_gate` is its job done and its pile at the Weir. A gate or slot part
 * (Phase 4: a gate is a part of its own) has no job: it waits `queued` until its upstream is
 * ratified and then stands at `awaiting_gate` straight away - the gate until its packet commits
 * (`ratified`) or rejects (`failed`), the slot until it is on the calendar. A placed slot that is
 * missed, failed or cancelled holds its item no more (kernel slots/read.ts `slottedIn`), so the
 * slot part goes back from `ratified` to `awaiting_gate`; that is the one way out of `ratified`.
 * `blocked` is "an upstream part failed or is paused" (the prototype's `blockedBy`), cleared by
 * that part moving again.
 */
export const partMachine = defineMachine({
  draft: ["queued"],
  queued: ["running", "awaiting_gate", "paused", "blocked"],
  running: ["awaiting_gate", "ratified", "failed", "paused"],
  paused: ["queued", "running"],
  awaiting_gate: ["ratified", "failed", "queued"],
  failed: ["queued"],
  blocked: ["queued"],
  ratified: ["awaiting_gate"],
});
export type PartState = (typeof partMachine.states)[number];
