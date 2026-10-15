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
 * In the prototype a gate was a PART of its own (`gate:frames`). Here it is a
 * property of the part it judges (`gate: "verdict"`), so `awaiting_gate` is a
 * state of that part: its job finished and its pile is at the Weir. A reject
 * at the Weir is `failed` (the prototype's quiet-tariff frames: "gate: 0 of 18
 * plates kept · re-run needs a new route"); a packet sent back for another
 * turn re-queues it. `blocked` is "an upstream part failed or is paused"
 * (the prototype's `blockedBy`), cleared by that part moving again.
 */
export const partMachine = defineMachine({
  draft: ["queued"],
  queued: ["running", "paused", "blocked"],
  running: ["awaiting_gate", "ratified", "failed", "paused"],
  paused: ["queued", "running"],
  awaiting_gate: ["ratified", "failed", "queued"],
  failed: ["queued"],
  blocked: ["queued"],
  ratified: [],
});
export type PartState = (typeof partMachine.states)[number];
