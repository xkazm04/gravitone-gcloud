import path from "node:path";
import { parseArgs } from "node:util";
import { AppError, errorMessage, type Result } from "@gt/domain/errors";
import { resourceLaneSchema, RESOURCE_LANES, type ResourceLane } from "@gt/domain/lane";
import { blobStore } from "@gt/kernel/blob";
import { dryOnlyFrom } from "@gt/kernel/dryrun";
import { liveEffects, type Effects } from "@gt/kernel/effects";
import type { Producer } from "@gt/kernel/job-core";
import { laneHold, nextClaimable } from "@gt/kernel/job-queue";
import { producerKey, type Pick, type ProducerKey } from "@gt/kernel/job-queue-core";
import type { RunReport } from "@gt/kernel/job-run";
import { workLoop } from "@gt/kernel/job-worker";
import { pidAlive, processHolder } from "@gt/kernel/lease";
import { closeProcessKernel, processKernel, storeLocation } from "@gt/kernel/process";
import { JOB_USD } from "@gt/kernel/spend/meter";
import type { Store } from "@gt/kernel/store";

import { OUT_DIRNAME } from "../lib/fixtures/mode.ts";
import { isFailing } from "./timers-core.ts";
import { timerRoster, type TimerEntry, type TimerLine } from "./timers.ts";

// THE WORKER - the process that drives queued jobs (Phase 4, plan §4). Kernel
// `workLoop` is the loop; this is its host: it opens the app's store (the same
// file, by the same rule, as the server and the CLIs - @gt/kernel/process bound
// to v1's universe), hands the loop the producers the caller bound, and turns
// the loop's reports into the CLI contract (§5.1): `--json` one line per job
// outcome, exit 0 ok / 1 a job failed or the loop did / 2 usage.
//
// v1 had one host per producer (MV's queue worker inside the server, extract's
// `--loop`, the Suno queue), each with its own idea of shutdown - none of them
// parked: a stop was a kill, and the next start found `running` records and a
// guess. Kept from them: RECOVERY FIRST (the loop's own startup sweep). Upgraded:
// SIGINT and SIGTERM ABORT THE LOOP, which admits no new job and lets every
// drive in flight reach its next step boundary and yield - the step finishes and
// is booked, the job goes back to its line (background-jobs: loop-supervision,
// drain-and-shutdown). A SECOND signal is the operator insisting: the process
// exits at once and the in-flight steps are left for the next start's recovery,
// which names them interrupted - never silently resumed.
//
// `--once` DRAINS AND EXITS (tests, cron): the loop runs until no lane holds a
// head this worker can start. A head whose last drive came back busy, held or
// unhealthy is waiting on something outside this process (another holder, an
// operator's look, a vendor) and does not keep a drain alive; it is reported.
//
// THE TIMERS (Phase 6, L62; COMMON decision 3): beside the job loop the worker runs a roster of
// recurring work (./timers.ts) - the publish tick and the metrics refresh - registered through
// `io.timers`, each held as a lease on the store so two workers run each once. `--once` runs
// every timer ONE tick before the drain (its line on stderr; a failing tick makes the exit 1);
// `--no-timers` leaves them to another worker. A stop
// parks the job loop AND stops the roster (bounded grace, the abandoned named, leases released).
//
// `--migrate` opens the store and exits: the one door a Python worker uses to
// bring a store up to date (packages/kernel/py/kernel_store.py), because Python never
// carries a second copy of the schema.

export const USAGE = "usage: node workers/runner.mts [--lanes gpu.local,seat.text] [--once] [--json] [--idle-ms N] [--no-timers] | --migrate [--json]";

export type WorkerIo = {
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Install the stop signals; returns their removal. */
  readonly onSignal?: (stop: (hard: boolean) => void) => () => void;
  /** The recurring work this worker hosts, built over its store (workers/runner.mts binds publish's). */
  readonly timers?: (store: Store) => Result<readonly TimerEntry[]>;
};

/** How long a stop waits for a tick in flight before naming it abandoned. */
const TIMER_GRACE_MS = 15_000;

type Args = { readonly lanes: readonly ResourceLane[]; readonly once: boolean; readonly json: boolean; readonly migrate: boolean; readonly idleMs: number; readonly timers: boolean };

function parse(argv: readonly string[]): Result<Args> {
  let v;
  try {
    v = parseArgs({
      args: [...argv],
      options: { lanes: { type: "string" }, once: { type: "boolean" }, json: { type: "boolean" }, migrate: { type: "boolean" }, "idle-ms": { type: "string" }, "no-timers": { type: "boolean" } },
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (e) {
    return { ok: false, error: new AppError("invalid", errorMessage(e)) };
  }
  const lanes: ResourceLane[] = [];
  for (const raw of (v.lanes ?? RESOURCE_LANES.join(",")).split(",").map((s) => s.trim()).filter((s) => s !== "")) {
    const lane = resourceLaneSchema.safeParse(raw);
    if (!lane.success) return { ok: false, error: new AppError("invalid", `--lanes: "${raw}" is not a resource lane (${RESOURCE_LANES.join(", ")})`) };
    lanes.push(lane.data);
  }
  if (lanes.length === 0) return { ok: false, error: new AppError("invalid", "--lanes names no lane") };
  const idleMs = v["idle-ms"] === undefined ? 1000 : Number(v["idle-ms"]);
  if (!Number.isInteger(idleMs) || idleMs < 10) return { ok: false, error: new AppError("invalid", `--idle-ms ${String(v["idle-ms"])} is not a whole number of ms >= 10`) };
  return { ok: true, value: { lanes, once: v.once === true, json: v.json === true, migrate: v.migrate === true, idleMs, timers: v["no-timers"] !== true } };
}

/** The outcomes a --once drain stops waiting on: the head waits on something this process cannot change. */
const WAITING: ReadonlySet<RunReport["outcome"]> = new Set(["busy", "held", "unhealthy"]);

type Carries = (name: string, lane: ResourceLane) => boolean;

/** Whether any lane still has a head this worker could start now. */
function drainable(store: Store, lanes: readonly ResourceLane[], carries: Carries, waiting: ReadonlySet<string>): boolean {
  const r = store.read((rd) => lanes.some((lane) => {
    const head = nextClaimable(rd, lane);
    return head !== undefined && carries(head.producer, lane) && !waiting.has(head.id);
  }));
  // A read that failed is not proof the line is empty: keep draining, the loop reports the store's fault.
  return r.ok ? r.value : true;
}

/**
 * The heads on this worker's lanes that it does not carry, as the store has them now. The loop
 * names the orphans it LOOKED at; a --once drain that found nothing it could start never looks
 * (it aborts before the first look), and an unbound head is then exactly the line an operator
 * needs to read - L35 measured `--once` printing nothing at all over a queued step whose lane
 * no binding reached. So the end of every run reads the lines again, whatever the loop saw.
 */
function unboundHeads(store: Store, lanes: readonly ResourceLane[], carries: Carries): Pick[] {
  const r = store.read((rd) =>
    lanes.flatMap((lane): Pick[] => {
      const head = nextClaimable(rd, lane);
      return head === undefined || carries(head.producer, lane) ? [] : [{ lane, jobId: head.id, producer: head.producer }];
    }),
  );
  return r.ok ? r.value : [];
}

/** A held lane as the end of a run names it: the hold, and the head that waits behind it. */
type HeldLane = { readonly lane: ResourceLane; readonly jobId: string; readonly stage?: string; readonly behind?: string };

/**
 * The lanes of this worker that HOLD (decision 6: an interrupted paid job holds its lane until the
 * operator acknowledges it), each with the job that holds it and the head waiting behind. Read at
 * the end of every run for the reason `unboundHeads` is: a --once drain that found nothing to start
 * never looks, and L44 measured it exiting 0 over a held lane with a queued job and saying nothing.
 */
function heldLanes(store: Store, lanes: readonly ResourceLane[]): HeldLane[] {
  const r = store.read((rd) =>
    lanes.flatMap((lane): HeldLane[] => {
      const hold = laneHold(rd, lane);
      if (hold === undefined) return [];
      // Not `nextClaimable`: a held lane has no claimable head by definition; this is the line's head.
      const head = rd.get("SELECT id FROM jobs WHERE lane = ? AND state = 'queued' ORDER BY ord, n LIMIT 1", lane)?.["id"];
      return [{ lane, jobId: hold.jobId, ...(hold.stage === undefined ? {} : { stage: hold.stage }), ...(typeof head === "string" ? { behind: head } : {}) }];
    }),
  );
  return r.ok ? r.value : [];
}

/** A job's outcome as one line: what a cron, a skill or a test reads. */
function line(pick: Pick, report: Result<RunReport>): Record<string, unknown> {
  const base = { jobId: pick.jobId, lane: pick.lane, producer: pick.producer };
  if (!report.ok) return { ...base, outcome: "error", code: report.error.code, error: report.error.message };
  const r = report.value;
  return {
    ...base,
    outcome: r.outcome,
    ...(r.job === undefined ? {} : { state: r.job.state, attempt: r.job.attempt, spendUsd: r.job.spend.usd }),
    ...(r.job?.error === undefined ? {} : { error: r.job.error.message }),
    ...(r.reason === undefined ? {} : { reason: r.reason }),
    ...(r.wouldCalls === undefined ? {} : { wouldCalls: r.wouldCalls.length }),
  };
}

const failedOutcome = (report: Result<RunReport>): boolean => !report.ok || report.value.outcome === "failed";

/** Run the worker over `bound`; resolves to the process exit code. */
export async function runWorker(argv: readonly string[], bound: Result<ReadonlyMap<ProducerKey, Producer>>, io: WorkerIo): Promise<0 | 1 | 2> {
  const args = parse(argv);
  if (!args.ok) {
    io.err(`[worker] ${args.error.message}\n${USAGE}`);
    return 2;
  }
  const { lanes, once, json, migrate, idleMs, timers } = args.value;
  const say = (human: string, doc: Record<string, unknown>): void => (json ? io.out(JSON.stringify(doc)) : io.out(human));

  const location = storeLocation(OUT_DIRNAME, io.env["GRAVITONE_STORE_PATH"]);
  const opened = processKernel(location);
  if (!opened.ok) {
    io.err(`[worker] the store at ${location} did not open: ${opened.error.message}`);
    return 1;
  }
  try {
    const store = opened.value.store;
    if (migrate) {
      say(`migrated ${location} (${opened.value.migrated.applied.length} step(s) applied)`, { ok: true, store: location, applied: opened.value.migrated.applied.length });
      return 0;
    }
    if (!bound.ok) {
      io.err(`[worker] the producer set is refused: ${bound.error.message}`);
      return 2;
    }
    const entries = timers && io.timers !== undefined ? io.timers(store) : { ok: true as const, value: [] };
    if (!entries.ok) {
      io.err(`[worker] the timers are refused: ${entries.error.message}`);
      return 2;
    }
    let failures = 0;
    const roster = timerRoster(entries.value, {
      store,
      holder: processHolder(),
      alive: pidAlive,
      clock: () => new Date(),
      // Timer lines go to stderr in both modes: stdout's `--json` is one line per JOB outcome (§5.1),
      // and a reader of it must not meet a second shape. The store keeps the timers' own record.
      say: (l: TimerLine) => {
        if (isFailing(l.outcome)) failures++;
        const tail = l.error ?? l.what ?? "";
        io.err(`[worker] timer ${l.timer}: ${l.outcome}${tail === "" ? "" : ` - ${tail}`} (${l.ms} ms)`);
      },
    });
    if (once) await roster.once();
    else roster.start();
    // A producer serves only the lanes this worker was given: a head on any other lane is not ours to take.
    const mine = new Map([...bound.value].filter(([, p]) => lanes.includes(p.lane)));
    if (mine.size === 0) io.err(`[worker] no producer is bound for ${lanes.join(", ")}: nothing here can run (lib/producers/registry.ts BOUND)`);
    const fx: Effects = liveEffects(store, blobStore(location === ":memory:" ? path.resolve("foundry-out", "blobs") : path.join(path.dirname(location), "blobs")));

    const ac = new AbortController();
    const waiting = new Set<string>();
    const said = new Map<string, string>();
    // A DRIVE THAT FOUND ITS LANE TAKEN COOLS FOR ONE IDLE PERIOD. Kernel `workLoop`
    // re-picks a head the moment its drive returns, and a drive that comes back busy,
    // held or unhealthy returns at once - with a sync store and no real await between
    // them, that is a microtask spin: measured 2026-10-16, 8753 busy drives in five
    // seconds against four slots another box held, and no timer (the --once drain, a
    // heartbeat) ever ran. Until the loop itself backs off (reported to the Director),
    // the producer's health check is where the wait goes: its next drive first sleeps
    // `idleMs` on a real timer, cut short by a stop.
    const cooling = new Set<ProducerKey>();
    const pause = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          ac.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        ac.signal.addEventListener("abort", done, { once: true });
      });
    const cooled = new Map(
      [...mine].map(([key, p]): [ProducerKey, Producer] => [
        key,
        {
          ...p,
          health: async (job) => {
            if (cooling.delete(key)) await pause(idleMs);
            return p.health === undefined ? { ok: true as const } : p.health(job);
          },
        },
      ]),
    );
    const carries: Carries = (name, lane) => mine.has(producerKey(name, lane));
    const uninstall = io.onSignal?.((hard) => {
      if (hard) {
        io.err("[worker] stopping hard: steps in flight are left for the next start's recovery");
        closeProcessKernel();
        process.exit(1);
      }
      io.err("[worker] stopping: no new job; jobs in flight park at their next step boundary");
      ac.abort();
    });
    // Drives this process holds: a --once drain never exits under one (a read that fails counts as one).
    const running = (s: Store): number => {
      const me = processHolder();
      const r = s.read((rd) => rd.get("SELECT count(*) AS c FROM jobs WHERE state = 'running' AND json_extract(record, '$.lease.holder.pid') = ? AND json_extract(record, '$.lease.holder.bootId') = ?", me.pid, me.bootId)?.["c"]);
      return r.ok && typeof r.value === "number" ? r.value : 1;
    };
    const drain = once
      ? setInterval(() => {
          if (!drainable(store, lanes, carries, waiting) && running(store) === 0) ac.abort();
        }, idleMs)
      : undefined;
    if (once && !drainable(store, lanes, carries, waiting)) ac.abort();

    const summary = await workLoop(fx, cooled, {
      signal: ac.signal,
      idleMs,
      spendClasses: [JOB_USD],
      run: { dryOnly: dryOnlyFrom(io.env) },
      onReport: (pick, report) => {
        if (failedOutcome(report)) failures++;
        const stalled = report.ok && WAITING.has(report.value.outcome);
        if (stalled) {
          waiting.add(pick.jobId);
          cooling.add(producerKey(pick.producer, pick.lane));
        } else waiting.delete(pick.jobId);
        const doc = line(pick, report);
        // A head that stays busy is said once per change, not once per look.
        const outcome = String(doc["outcome"]);
        if (stalled && said.get(pick.jobId) === outcome) return;
        said.set(pick.jobId, outcome);
        say(`${pick.jobId} (${pick.producer} on ${pick.lane}): ${String(doc["outcome"])}${doc["error"] === undefined ? "" : ` - ${String(doc["error"])}`}`, doc);
      },
    });
    if (drain !== undefined) clearInterval(drain);
    const abandoned = await roster.stop(once ? 0 : TIMER_GRACE_MS);
    for (const name of abandoned) io.err(`[worker] timer ${name} was still running at the stop; its claims are left for the next sweep to judge`);
    uninstall?.();
    if (!summary.ok) {
      io.err(`[worker] the loop stopped on a store fault: ${summary.error.message}`);
      return 1;
    }
    const s = summary.value;
    // The loop looks at every lane; only this worker's lanes are its to report.
    const named = new Map<string, Pick>();
    for (const o of [...s.orphans.filter((o) => lanes.includes(o.lane)), ...unboundHeads(store, lanes, carries)]) named.set(o.jobId, o);
    for (const o of named.values()) io.err(`[worker] ${o.jobId} heads ${o.lane} for producer ${o.producer}, which this worker does not carry`);
    for (const h of heldLanes(store, lanes)) {
      const at = h.stage === undefined ? "" : ` at ${h.stage}`;
      const behind = h.behind === undefined ? "nothing waits behind it" : `${h.behind} waits behind it`;
      io.err(`[worker] ${h.lane} is held by job ${h.jobId}${at}: credits may be spent - look first, then acknowledge it; ${behind}`);
    }
    io.err(`[worker] ${s.started} drive(s), ${s.recovered} recovered as interrupted, ${failures} failed`);
    return failures > 0 ? 1 : 0;
  } finally {
    closeProcessKernel();
  }
}

/** SIGINT/SIGTERM for a real process: the first parks, the second exits. */
export function processSignals(stop: (hard: boolean) => void): () => void {
  let seen = 0;
  const handler = (): void => {
    seen++;
    stop(seen > 1);
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  return () => {
    process.off("SIGINT", handler);
    process.off("SIGTERM", handler);
  };
}
