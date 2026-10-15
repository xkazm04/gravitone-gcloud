// THE JOB MACHINE, zod-free: the transition table and its state union, apart from
// the record schema in ./job.ts (which re-exports both, so every existing import path holds).
// A client draws states from this table (@gt/ui status vocabulary); importing the schema
// file for it would carry zod into the browser bundle, so the table lives where only
// ./transitions.ts follows it in. tests/next-gates/client-closure.test.ts holds that line.

import { defineMachine } from "./transitions.ts";

/**
 * `interrupted` is v1's `orphaned` (turns) and `queue.interrupted` (MV, Suno)
 * made one state. It is deliberately NOT `failed`: a failure is a known
 * outcome with a reason, and a retry takes it again; an interruption is an
 * UNKNOWN outcome — the vendor may have been paid — and the only honest next
 * act is an operator's look. v1 expressed that by switching the whole queue
 * off; here the job itself carries it, so one crashed job does not stop its
 * lane's neighbours. Its exits are the same as `failed`'s; what differs is who
 * may take them, which the kernel's driver enforces (an automatic resume never
 * leaves `interrupted`), and what the Runs view says.
 *
 * A money stop is `failed` with a `stop` record and `error.code: "budget"`, as
 * v1 extract had it (`status: "failed"` plus `stopped`): one failed state, the
 * reason as data, and the breaker (`failStreak`) never counts it.
 *
 * `running -> paused` is v1's Stop-between-steps (MV): the step in flight
 * finishes and the job holds every file it has. `running -> cancelled` exists
 * because a text turn can be aborted mid-flight (lib/turns); a producer whose
 * step cannot be called back refuses that edge in its own driver, as v1 MV did.
 * There is no `interrupted -> running`: nothing resumes a crashed job without
 * passing back through the queue.
 */
export const jobMachine = defineMachine({
  planned: ["queued", "cancelled"],
  queued: ["running", "paused", "cancelled"],
  running: ["done", "failed", "interrupted", "paused", "cancelled"],
  paused: ["queued", "cancelled"],
  failed: ["queued", "cancelled"],
  interrupted: ["queued", "cancelled"],
  done: [],
  cancelled: [],
});
export type JobState = (typeof jobMachine.states)[number];
