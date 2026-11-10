// IS ANYTHING DRIVING THE QUEUE - pure: what the store's leases say about the job worker, decided
// from facts the read (./worker-pulse.ts) gathers in one read transaction.
//
// A launch only enqueues (projects/_port/real.ts); a job moves when a worker (workers/runner.mts,
// `npm run worker`) or a producer's CLI claims it. Nothing records "a worker is up" as such. What
// the store DOES record, every few seconds, is a lease heartbeat:
//
//   timers   the worker's roster holds a lease per timer (`timer:<name>`, workers/timers.ts) and
//            beats it every tick - the publish tick every 30 s - for as long as the process lives.
//   drives   a job being driven holds its lane slot's lease (`<lane>#<i>`, job-run.ts), beaten
//            every third of its TTL, whoever drives it.
//
// So the smallest true statement is: jobs are queued, no timer lease is held fresh, and no running
// job's slot lease is held fresh -> nothing that beats is up, and the queue will not move. A fresh
// beat of either kind -> something is up; the verdict is `alive` and the screens draw nothing.
//
// WHAT IT CANNOT TELL. A worker started with `--no-timers` that is idle holds no lease at all, so it
// reads as `none` - the stores cannot tell it from a dead worker. A worker whose `--lanes` leave out
// the queued job's lane, or that carries no producer for it (an orphan head), reads `alive` while
// that job waits forever. Both are said here and not on screen; the chip claims only what the
// leases hold: no beat since the last one recorded, with the oldest queued job's own time.

/** What one read of the store holds about the worker, as of `at` (the store's clock). */
export type WorkerPulse = {
  readonly at: string;
  /** Jobs in `queued`: what would move if a worker were up. */
  readonly queued: number;
  /** The newest instant the oldest queued job was put in line (enqueued, released, resumed, retried), or null when unknown. */
  readonly queuedSince: string | null;
  /** A timer lease held, its heartbeat within its TTL and its holder not provably gone. */
  readonly timerBeating: boolean;
  /** Running jobs whose slot lease is held fresh: drives in flight, by a worker or a CLI. */
  readonly driving: number;
  /** The newest heartbeat any timer or slot lease recorded (held or since let go), or null if none ever did. */
  readonly lastBeat: string | null;
};

export type WorkerVerdict =
  /** Nothing is queued: whether a worker is up changes nothing the operator should do. */
  | { readonly kind: "quiet" }
  /** Something beats: a worker's timers, or a drive in flight. */
  | { readonly kind: "alive" }
  /** Queued work and no beat: the queue does not move until a worker starts. */
  | { readonly kind: "none"; readonly queued: number; readonly queuedSince: string | null; readonly lastBeat: string | null };

export function workerVerdict(p: WorkerPulse): WorkerVerdict {
  if (p.queued === 0) return { kind: "quiet" };
  if (p.timerBeating || p.driving > 0) return { kind: "alive" };
  return { kind: "none", queued: p.queued, queuedSince: p.queuedSince, lastBeat: p.lastBeat };
}

/** The job events that put a job (back) in `queued`: its queued-since is the newest of them. */
export const INTO_QUEUE = ["job.enqueued", "job.released", "job.resumed", "job.retried", "job.auto-resumed", "job.yielded", "job.rerouted"] as const;
