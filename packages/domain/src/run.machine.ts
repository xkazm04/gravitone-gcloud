// THE RUN MACHINE, zod-free: the transition table and its state union, apart from
// the record schema in ./run.ts (which re-exports both, so every existing import path holds).
// A client draws states from this table (@gt/ui status vocabulary); importing the schema
// file for it would carry zod into the browser bundle, so the table lives where only
// ./transitions.ts follows it in. tests/next-gates/client-closure.test.ts holds that line.

import { defineMachine } from "./transitions.ts";

/**
 * The prototype's five words plus two it implied but never drew:
 *   queued     — it carries `queuePos` (the composer's "queue #2"), so waiting
 *                for a lane is a state, not a running run at 0%.
 *   cancelled  — every v1 queue has it (lib/turns/ledger.ts, lib/sound/mv,
 *                lib/suno), and a draft the operator discards must end somewhere.
 * `blocked` is the prototype's word for "needs the operator": the job failed,
 * stopped for money, was interrupted by a crash, or the Weir rejected the pile.
 * The reason lives on the Job and the Decision, not in more Run states.
 * `awaiting_gate -> running` is a packet sent back for another turn (v1's
 * article `awaiting-approval -> drafting`, lib/articles/types.ts TRANSITIONS).
 * A Run's state is derived from its job (plan.ts runStateOf), so the table holds every move the
 * job's own table makes it take: `running -> queued` is the job's Stop-between-steps
 * (`running -> paused`, which a run reads as waiting), `running -> cancelled` a turn aborted
 * mid-flight. test/machines.test.ts walks every job edge through the derivation.
 */
export const runMachine = defineMachine({
  draft: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["awaiting_gate", "blocked", "queued", "cancelled"],
  awaiting_gate: ["ratified", "blocked", "running"],
  blocked: ["queued", "cancelled"],
  ratified: [],
  cancelled: [],
});
export type RunState = (typeof runMachine.states)[number];
