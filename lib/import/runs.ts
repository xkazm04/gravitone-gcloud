import { parseAt } from "@gt/domain/door";
import { ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import type { ProducerRunInput } from "@gt/domain/produce";
import { runSchema } from "@gt/domain/run";
import { append } from "@gt/kernel/events";
import { recordImportedJobIn } from "@gt/kernel/job";
import { readRunIn, runJobId } from "@gt/kernel/records/launch";
import { priceLine } from "@gt/kernel/records/receipt";
import { insertRun } from "@gt/kernel/records/schema";
import type { Reader, Store, Tx } from "@gt/kernel/store";

// v1 RUNS THAT PREDATE THE JOB SYSTEM, AS RUN ROWS WITH A TERMINAL JOB (Phase 4 wave D, L42;
// plan §6 Phase 4: "`foundry-out/*` stores are imported by one-time scripts").
//
// Every forge run, extract run, Dojo cycle, strips run, article run and music-video / Suno job v1
// made before its producer moved onto `kernel/job` has no Run row and no job, so Runs and the
// Ledger's job lane show nothing of the history the Floor was built on. Each one here becomes
// what its producer would write today - the Run row (records/launch.ts, through the run door,
// priced by the same option table) and its ONE job - but TERMINAL, as v1 recorded it: `done`, or
// `failed` with v1's own sentence. A `job.imported` event says so (`imported: true`); nothing
// claimed a lane or spent (the meter reconciles at 0 for an imported job).
//
// WHAT IS NOT IMPORTED, AND IS REPORTED: a run v1 still shows working (its own driver - or the
// operator, for a crashed one v1 never marked - finishes it; its producer launches it as a job
// from there), and a run already on the job system (a `job` on its manifest, a Run row or a job
// serving its id): the job record is the truth for those already.
//
// ARTEFACTS STAY WHERE THEY ARE (COMMON decision 9): the v1 stores still serve the produced
// files and their readers keep reading them, so no `MIGRATED` marker is written. IDEMPOTENT:
// the run id is the producer's own (`forge:<id>`, `dojo:<id>`, the manifest id, `mv.<track>.<at>`,
// `suno.<proposal>`), so a second import - and a producer's later launch of the same run - finds
// the row.

export type V1RunState = "done" | "failed" | "live";

export type V1Run = {
  readonly source: string;
  /** The Run id its producer uses. */
  readonly runId: string;
  readonly input: ProducerRunInput;
  readonly units?: number;
  /** When v1 created it (ISO). */
  readonly at: string;
  readonly state: V1RunState;
  readonly error?: string;
  /** A kernel job v1's record already names: the run is on the job system. */
  readonly job?: string;
};

export type RunOutcome = { readonly source: string; readonly runId: string; readonly outcome: "imported" | "would-import" | "skipped" | "refused"; readonly state?: V1RunState; readonly reason?: string };

export const IMPORT_RUN_ACTOR: Actor = { kind: "machine", id: "v1-import" };

const iso = (s: string): string | undefined => {
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
};

/** Why `run` is not imported, or null when it is. */
function skipOf(r: Reader, run: V1Run, served: ReadonlySet<string>): string | null {
  if (run.state === "live") return "still working in v1; its producer launches it as a job from there";
  if (run.job !== undefined) return `already on the job system (${run.job})`;
  if (r.get("SELECT 1 AS x FROM runs WHERE id = ?", run.runId) !== undefined) return "a Run row already serves this id";
  if (served.has(run.runId)) return "a job already serves this id";
  if (iso(run.at) === undefined) return `v1's creation instant ${run.at} is unreadable`;
  return null;
}

/** Everything of `land` that only reads: the Run door's read of the input, the option and the run record. A dry pass runs exactly this, so it refuses what the wet pass would, without the write lock. */
function prepare(r: Reader, run: V1Run, now: number, stamp: string) {
  const read = readRunIn(r, run.input, { mode: "dry", ...(run.units === undefined ? {} : { units: run.units }) }, { now });
  const option = read.line.option ?? read.picked.option;
  const est = priceLine(read.line.units, option);
  const at = iso(run.at) ?? stamp;
  const rec = parseAt("imported run", runSchema, {
    id: run.runId,
    lane: read.plan.lane,
    producer: run.input.producer,
    recipe: read.plan.recipe,
    input: read.input,
    units: read.plan.units,
    option: option.key,
    estimate: est.usd === null ? { seconds: est.seconds, usd: null, unpricedReason: est.unpricedReason ?? "unpriced" } : { seconds: est.seconds, usd: est.usd, ...(est.usdRange === undefined ? {} : { usdRange: [...est.usdRange] }) },
    createdAt: at,
  });
  if (!rec.ok) throw rec.error;
  return { read, option, rec: rec.value, at };
}

function land(t: Tx, run: V1Run, now: number): void {
  const { read, option, rec, at } = prepare(t, run, now, t.at);
  const jobId = runJobId(run.runId);
  insertRun(t, rec, jobId);
  // Through the job machine (kernel `recordImportedJobIn`), ending as v1 recorded it.
  const ending = run.state === "done" ? { state: "done" as const } : { state: "failed" as const, code: "unavailable" as const, message: run.error ?? `failed in v1 (${run.source} recorded no sentence)` };
  recordImportedJobIn(t, { id: jobId, of: { kind: "run", id: run.runId }, producer: run.input.producer, lane: option.lane, correlation: { runId: run.runId }, units: read.plan.units, ending, data: { from: "v1", source: run.source } }, IMPORT_RUN_ACTOR);
  append(t, {
    actor: IMPORT_RUN_ACTOR,
    type: "run.imported",
    subject: { kind: "run", id: run.runId },
    data: { runId: run.runId, jobId, source: run.source, state: run.state, imported: true },
    occurredAt: at,
    atSrc: "recorded",
    key: `v1-import:${run.runId}:run`,
  });
}

/**
 * Import `runs` into `store`. `dry` (the CLI's default) reads and reports, writes nothing. Each run
 * is its own transaction: one that fails is reported with its reason and the rest carry on.
 */
export function importRuns(store: Store, runs: readonly V1Run[], opts: { readonly dry: boolean; readonly now: number }): Result<RunOutcome[]> {
  const out: RunOutcome[] = [];
  // The ids the jobs already serve, read once: jobs carries no index on `of.id`, so a per-run lookup is a scan of the table. A run
  // imported below is caught by its Run row, so the set need not follow the writes of this pass.
  const read = store.read((r) => new Set(r.all("SELECT DISTINCT json_extract(record, '$.of.id') AS id FROM jobs").map((x) => x["id"]).filter((id): id is string => typeof id === "string")));
  if (!read.ok) return read;
  const served = read.value;
  for (const run of runs) {
    const skip = store.read((r) => skipOf(r, run, served));
    if (!skip.ok) return skip;
    if (skip.value !== null) {
      out.push({ source: run.source, runId: run.runId, outcome: "skipped", state: run.state, reason: skip.value });
      continue;
    }
    if (opts.dry) {
      // The same door the wet pass goes through, read-only: a run it would refuse is reported refused.
      const seen = store.read((r) => prepare(r, run, opts.now, new Date(opts.now).toISOString()));
      out.push(seen.ok ? { source: run.source, runId: run.runId, outcome: "would-import", state: run.state } : { source: run.source, runId: run.runId, outcome: "refused", state: run.state, reason: seen.error.message });
      continue;
    }
    const w = store.tx((t) => land(t, run, opts.now));
    if (!w.ok) {
      // Nothing of this run landed (one transaction); the reason is the door's or the store's.
      out.push({ source: run.source, runId: run.runId, outcome: "refused", state: run.state, reason: w.error.message });
      continue;
    }
    out.push({ source: run.source, runId: run.runId, outcome: "imported", state: run.state });
  }
  return ok(out);
}
