import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { LoadSample } from "@gt/domain/load";
import { pruneLoadSamplesIn, recordLoadSampleIn, RETENTION_MS, waitingJobsIn } from "@gt/kernel/resources/load";
import type { Store } from "@gt/kernel/store";
import { LOAD_SAMPLE } from "@gt/producers/publish/timers";

import type { TimerEntry, Worked } from "../../workers/timers.ts";
import { machineProbe, type MachineReading } from "../resources/probe.ts";

// THE LOAD SAMPLER, BOUND TO THIS BOX (spark night-load-band): the worker's `load-sample` timer. Once a
// minute it takes one reading of the machine - the same probe admission reads (../resources/probe.ts),
// UNCACHED, because a two-second cache would hand a sample the reading admission took for another
// purpose - adds the totals the operator reads beside it, names the jobs admission is holding, and
// appends the lot as one row of kernel module "load". A /scout night reads its window of rows back and
// summarises it against the operator's 60-80 percent band (@gt/domain/load).
//
// WHO IS WAITING is read from the store, not from the worker's own admission state. That state (the
// `held` set in workers/worker.ts) is local to the job loop and built after the timers are, so a timer
// cannot reach it without reshaping the host; the store says the same thing durably - a queued job whose
// latest `job.waiting` is not yet answered by a `job.claimed` (@gt/kernel/resources/load waitingJobsIn) -
// and says it for every worker on the store, not only this one.
//
// A PROBE THAT THROWS writes no row: the tick returns its error, which the roster records as a failure
// (a `timer.fail` on the first, a recovery when it reads again) and the worker carries on. A reading the
// probe could not take is not a throw: its fields are absent in the row and the summary counts them
// unread. Once an hour the same transaction lets go of rows older than the thirty-day retention.

const PRUNE_EVERY_MS = 60 * 60_000;
const round2 = (x: number): number => Math.round(x * 100) / 100;

export type LoadSampleOptions = {
  readonly store: Store;
  /** One reading of the box; a test hands a fake. Default: the probe, uncached. */
  readonly read?: () => Promise<MachineReading>;
};

/** A reading and its instant, as the row stores it. Absent stays absent. */
export function sampleOf(atMs: number, r: MachineReading, waiting: LoadSample["waiting"]): LoadSample {
  const { ramTotalGb, ramFreeGb, commitLimitGb } = r.totals;
  return {
    atMs,
    load: r.load,
    ...(ramTotalGb === undefined || ramFreeGb === undefined ? {} : { ramUsedGb: round2(Math.max(0, ramTotalGb - ramFreeGb)) }),
    ...(ramTotalGb === undefined ? {} : { ramTotalGb }),
    ...(commitLimitGb === undefined ? {} : { commitLimitGb }),
    ...(waiting === undefined || waiting.length === 0 ? {} : { waiting }),
  };
}

export function loadSampleTimer(o: LoadSampleOptions): TimerEntry {
  const read = o.read ?? machineProbe(undefined, { cacheMs: 0 }).read;
  let prunedAt: number | undefined;
  return {
    spec: LOAD_SAMPLE,
    async tick(ctx): Promise<Result<Worked>> {
      let reading: MachineReading;
      try {
        reading = await read();
      } catch (e) {
        return err("unavailable", `the machine probe failed: ${errorMessage(e)}`);
      }
      if (ctx.signal.aborted) return err("refused","the tick was stopped before its sample was written");
      const atMs = ctx.now.getTime();
      const prune = prunedAt === undefined || atMs - prunedAt >= PRUNE_EVERY_MS;
      const wrote = o.store.tx((t) => {
        const sample = sampleOf(atMs, reading, waitingJobsIn(t));
        recordLoadSampleIn(t, sample);
        return { waiting: sample.waiting?.length ?? 0, pruned: prune ? pruneLoadSamplesIn(t, atMs - RETENTION_MS) : 0 };
      });
      if (!wrote.ok) return wrote;
      if (prune) prunedAt = atMs;
      return ok({ count: 1, what: "load sample(s) recorded", detail: { waiting: wrote.value.waiting, pruned: wrote.value.pruned } });
    },
  };
}
