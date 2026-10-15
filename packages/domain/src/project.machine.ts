// THE PROJECT MACHINE, zod-free: the transition table and its state union, apart from
// the record schema in ./project.ts (which re-exports both, so every existing import path holds).
// A client draws states from this table (@gt/ui status vocabulary); importing the schema
// file for it would carry zod into the browser bundle, so the table lives where only
// ./transitions.ts follows it in. tests/next-gates/client-closure.test.ts holds that line.

import { defineMachine } from "./transitions.ts";

/**
 * The prototype's project words (studio.js `projectTotals().state`). A
 * project's state is a function of its parts (`projectStateOf`), so this
 * machine is the closure of that function: every live state can become any
 * other as parts move, and `ratified` (shipped) is the end. `draft` is a plan
 * not yet launched; launching queues its parts.
 */
export const projectMachine = defineMachine({
  draft: ["queued"],
  queued: ["running", "awaiting_gate", "blocked", "ratified"],
  running: ["queued", "awaiting_gate", "blocked", "ratified"],
  awaiting_gate: ["queued", "running", "blocked", "ratified"],
  blocked: ["queued", "running", "awaiting_gate", "ratified"],
  ratified: [],
});
export type ProjectState = (typeof projectMachine.states)[number];
