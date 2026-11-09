import "server-only";

import { pidAlive, processHolder } from "@gt/kernel/lease";
import { workerVerdict } from "@gt/kernel/worker-pulse-core";
import { workerPulseIn } from "@gt/kernel/worker-pulse";
import { TIMER_NAMES, timerResource } from "@gt/producers/publish/timers";

import { kernel } from "../../../../lib/kernelStore.ts";
import type { WorkerRead } from "./WorkerChip.tsx";

// IS A WORKER UP, read on the server for the Plan and Runs (./WorkerChip.tsx draws it). A launch
// only enqueues (../_port/real.ts); the jobs move when `npm run worker` (workers/runner.mts) - or a
// producer's own CLI - claims them, and nothing on screen said whether one was running, so
// "launched · N jobs" followed by nothing read the same as slow. The rule, and what it cannot
// tell (an idle `--no-timers` worker; a worker whose `--lanes` leave a job's lane out), are
// @gt/kernel/worker-pulse-core's.
//
// It reads the kernel store whatever side the produce port answers from: on the fixture side the
// fixture's queued jobs are not the kernel's, nothing could drive them, and the read answers for
// the kernel's own queue (empty in a fresh store: quiet, nothing drawn).

export function readWorker(): WorkerRead {
  const k = kernel();
  if (!k.ok) return { problem: `kernel: ${k.error.message}` };
  const timers = TIMER_NAMES.map(timerResource);
  const r = k.value.store.read((rd) => workerVerdict(workerPulseIn(rd, timers, processHolder(), pidAlive)));
  return r.ok ? { verdict: r.value } : { problem: `worker: ${r.error.message}` };
}
