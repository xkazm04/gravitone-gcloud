import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema } from "@gt/domain/ids";
import type { Job } from "@gt/domain/job";
import { enqueueIn, get } from "@gt/kernel/job";
import type { Producer } from "@gt/kernel/job-core";
import { runJob, type RunOptions, type RunReport } from "@gt/kernel/job-run";
import type { Store } from "@gt/kernel/store";
import { SCOUT_INGEST, SCOUT_INGEST_LANE, defineScoutIngest, ingestRunId, type IngestPorts, type IngestTarget } from "@gt/producers/scout-ingest/define";

import { ingestSource, realDeps, type IngestDeps } from "../foundry/scout/ingest.ts";
import { mutateNight, readNight, readNightNow } from "../foundry/scout/store.ts";
import { FoundryError } from "../foundry/runStore.ts";
import { effectsFor } from "./extract.ts";

// THE SCOUT INGEST PRODUCER, BOUND TO THIS BOX (spark media-training-loop WP1):
// the definition (packages/producers/src/scout-ingest/define.ts) over the night
// store and the ingest engine (lib/foundry/scout/ingest.ts). The registry line is
//
//   { name: "scout-ingest", producer: scoutIngestProducer() },
//
// LAUNCHED AS MEDIA-FACTS IS QUEUED (packages/producers/src/media-facts/run.ts
// `queueFacts`): a free box.render job is enqueued directly - no receipt, no Run
// row, no ceiling, DRY (it calls no vendor, so the mode changes nothing it does).
// The job's id names the night's ingest run, `job:run:scout-ingest:<night>[:<s-NN>]`,
// `~2`, `~3` for a later launch, and the night lists it in `jobs`.

/** `deps` absent: PATH / YTDLP / FFMPEG / FFPROBE as the environment says when the unit runs. */
export const ingestPorts = (deps?: IngestDeps): IngestPorts => ({
  load(nightId) {
    try {
      const n = readNightNow(nightId);
      return ok({ id: n.id, sources: n.sources.map((s) => ({ id: s.id, kind: s.kind, status: s.status })) });
    } catch (e) {
      if (e instanceof FoundryError) return err(e.status === 404 ? "not-found" : "unavailable", e.message);
      throw e;
    }
  },
  ingest: (nightId, sourceId, io) => ingestSource(nightId, sourceId, deps ?? realDeps(), io.stillHeld),
});

/** The bound producer; a test or a rehearsal hands it stub binaries and a fake resolver. */
export const scoutIngestProducer = (deps?: IngestDeps): Producer => defineScoutIngest(ingestPorts(deps));

export type IngestLaunch =
  | { readonly kind: "launched"; readonly jobId: string; readonly sources: readonly string[] }
  /** An ingest job for the same scope is not finished: that job, never a second. */
  | { readonly kind: "existing"; readonly jobId: string; readonly state: Job["state"] }
  /** Nothing in scope is pending. */
  | { readonly kind: "nothing" };

function jobOf(store: Store, id: string): Job | undefined {
  const parsed = parseAt("job id", jobIdSchema, id);
  if (!parsed.ok) throw parsed.error;
  const r = get(store, parsed.value);
  if (r.ok) return r.value.job;
  if (r.error.code === "not-found") return undefined;
  throw r.error;
}

const OPEN: readonly Job["state"][] = ["planned", "queued", "running", "paused", "interrupted"];

export async function launchIngest(store: Store, target: IngestTarget, opts: { readonly actor: Actor }): Promise<Result<IngestLaunch>> {
  const night = await readNight(target.nightId);
  if (night.state !== "open") return err("refused", `night ${night.id} is ${night.state}; nothing more is ingested into it`);
  if (target.sourceId !== undefined && !night.sources.some((s) => s.id === target.sourceId)) return err("not-found", `night ${night.id} has no source ${target.sourceId}`);
  const pending = night.sources.filter((s) => s.status === "pending" && (target.sourceId === undefined || s.id === target.sourceId)).map((s) => s.id);
  if (pending.length === 0) return ok({ kind: "nothing" });
  const runId = ingestRunId(target);
  const base = `job:run:${runId}`;
  let jobId: string | undefined;
  for (let k = 1; k < 1000 && jobId === undefined; k++) {
    const id = k === 1 ? base : `${base}~${k}`;
    const held = jobOf(store, id);
    if (held === undefined) jobId = id;
    else if (OPEN.includes(held.state)) return ok({ kind: "existing", jobId: held.id, state: held.state });
  }
  if (jobId === undefined) throw new AppError("conflict", `${runId} has been launched a thousand times`);
  const id = jobId;
  // The night names its job BEFORE the job exists (extract's order): a launch that dies
  // between the two leaves a job id that serves nothing, which the budget reads as $0.
  await mutateNight(night.id, (n) => (n.jobs.includes(id) ? n : { ...n, jobs: [...n.jobs, id] }));
  const r = store.tx((t) => enqueueIn(t, { id, of: { kind: "run", id: runId }, producer: SCOUT_INGEST, lane: SCOUT_INGEST_LANE }, opts.actor));
  if (!r.ok) return r;
  return ok({ kind: "launched", jobId: id, sources: pending });
}

export type DriveIngestOptions = RunOptions & {
  readonly deps?: IngestDeps;
  /** Told each unit as it is booked: the CLI's progress line. */
  readonly onStep?: (step: string) => void;
};

/** Drive the ingest job in this process until it finishes (the CLI's default; the worker's otherwise). */
export async function driveIngest(store: Store, location: string, jobId: string, opts: DriveIngestOptions = {}): Promise<Result<RunReport>> {
  const { deps, onStep, ...run } = opts;
  const base = effectsFor(store, location);
  const fx =
    onStep === undefined
      ? base
      : {
          ...base,
          tx: ((name, fn) => {
            const r = base.tx(name, fn);
            if (r.ok && name.startsWith("book:")) onStep(name.slice("book:".length));
            return r;
          }) as typeof base.tx,
        };
  return runJob(fx, scoutIngestProducer(deps), jobId, run);
}
