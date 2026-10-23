import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";
import type { LoadSample } from "@gt/domain/load";
import type { WaitResource } from "@gt/domain/resource";
import type { ModuleMigrations } from "../migrate.ts";
import type { Reader, Tx } from "../store.ts";

// THE BOX'S LOAD SAMPLES (spark night-load-band) - one row a minute, written by the always-on worker's
// `load-sample` timer (lib/producers/loadSample.ts), read by a /scout night over its window.
//
// A row is the sample whole, as JSON, keyed by its instant: the reading's shape belongs to @gt/domain/load
// and the summary is computed from it there, so nothing here needs a column per field - the same choice
// as metric_snapshots (../slots/schema.ts), whose record is also a domain value read back through the door.
//
// APPEND-ONLY, WITH ONE KIND OF DELETE. Like every ledger in this kernel a sample is never rewritten (a
// trigger refuses the UPDATE). Unlike them it is not kept forever: a row a minute is ~525 600 a year of
// readings nobody reads past a month - a night's desk reads its own eight hours, and a comparison across
// nights reads weeks. The spend ledger's answer to an aged window was "a query, not a delete"
// (../spend/ledger.ts), because a booked dollar is evidence; a minute of CPU is not. So the retention is
// RETENTION_MS, and the delete trigger refuses any row younger than that - measured against the NEWEST
// sample, not a wall clock, so the rule holds the same under a test's clock and after a month the worker
// did not run (its last rows are then the newest, and are kept).

/** How long a sample is kept: thirty days. */
export const RETENTION_MS = 30 * 24 * 60 * 60_000;

export const loadMigrations: ModuleMigrations = {
  module: "load",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE load_samples (
  seq INTEGER PRIMARY KEY,
  at_ms INTEGER NOT NULL,
  record TEXT NOT NULL
);
CREATE INDEX load_samples_at ON load_samples (at_ms);
CREATE TRIGGER load_samples_no_update BEFORE UPDATE ON load_samples BEGIN SELECT RAISE(ABORT, 'load samples are append-only'); END;
CREATE TRIGGER load_samples_retention BEFORE DELETE ON load_samples
  WHEN OLD.at_ms >= (SELECT max(at_ms) FROM load_samples) - ${RETENTION_MS}
  BEGIN SELECT RAISE(ABORT, 'load samples are kept for 30 days; only older rows may be pruned'); END;`,
    },
  ],
};

const n = z.number().finite().nonnegative();
const WAITS = ["alone", "memory", "vram", "cpu", "comfy-queue", "unread"] as const satisfies readonly WaitResource[];
// Every WaitResource is listed: a new one in @gt/domain/resource fails to compile here, not to parse at night.
const _everyWait: Record<WaitResource, (typeof WAITS)[number]> = { alone: "alone", memory: "memory", vram: "vram", cpu: "cpu", "comfy-queue": "comfy-queue", unread: "unread" };
void _everyWait;

const sampleSchema = z.object({
  atMs: z.number().int().nonnegative(),
  load: z.object({
    vramUsedGb: n.optional(),
    commitUsedGb: n.optional(),
    cpuBusy: n.max(1).optional(),
    gpuBusy: n.max(1).optional(),
    comfyQueue: z.number().int().nonnegative().optional(),
  }),
  ramUsedGb: n.optional(),
  ramTotalGb: n.optional(),
  commitLimitGb: n.optional(),
  waiting: z.array(z.object({ jobId: z.string().min(1), resource: z.enum(WAITS) })).optional(),
});

/** Append one minute of the box. A sample the door would refuse on the way out is refused on the way in. */
export function recordLoadSampleIn(t: Tx, s: LoadSample): void {
  const p = parseAt("load sample", sampleSchema, s);
  if (!p.ok) throw new AppError("invalid", p.error.message);
  t.run("INSERT INTO load_samples (at_ms, record) VALUES (?, ?)", s.atMs, JSON.stringify(p.value));
}

/**
 * Delete the samples taken before `beforeMs` that the retention lets go - never one within RETENTION_MS of
 * the newest, whatever `beforeMs` says (the trigger would refuse it; this asks for only what it allows).
 * The one delete in the module. Returns how many rows went.
 */
export function pruneLoadSamplesIn(t: Tx, beforeMs: number): number {
  const r = t.run("DELETE FROM load_samples WHERE at_ms < ? AND at_ms < (SELECT max(at_ms) FROM load_samples) - ?", beforeMs, RETENTION_MS);
  return r.changes;
}

/** The samples taken in [fromMs, toMs], oldest first. */
export function readLoadSamples(r: Reader, fromMs: number, toMs: number): LoadSample[] {
  const out: LoadSample[] = [];
  for (const row of r.all("SELECT record FROM load_samples WHERE at_ms >= ? AND at_ms <= ? ORDER BY at_ms, seq", fromMs, toMs)) {
    const p = parseJsonAt("load sample", sampleSchema, String(row["record"]));
    if (!p.ok) throw p.error;
    out.push(p.value);
  }
  return out;
}

/** The newest sample's instant, or undefined when none was ever taken. */
export function newestLoadSampleMs(r: Reader): number | undefined {
  const v = r.get("SELECT max(at_ms) AS at FROM load_samples")?.["at"];
  return typeof v === "number" ? v : undefined;
}

const waitData = z.object({ resource: z.enum(WAITS) });

/**
 * The jobs admission is holding now, and on what, as the store says it: every QUEUED job whose latest
 * `job.waiting` event is later than its latest `job.claimed`. The gate writes `job.waiting` once per change
 * of reason, not once per look (./gate.ts), so a job held for three hours has one such event three hours
 * old - which is why this reads "latest wait not yet answered by a claim", not "waits since the last tick".
 * A wait whose reason this kernel no longer names is left out rather than guessed.
 */
export function waitingJobsIn(r: Reader): { readonly jobId: string; readonly resource: WaitResource }[] {
  const rows = r.all(
    `SELECT j.id AS id,
       (SELECT data FROM events w WHERE w.subject_id = j.id AND w.subject_kind = 'job' AND w.type = 'job.waiting' ORDER BY w.seq DESC LIMIT 1) AS wait,
       (SELECT max(w.seq) FROM events w WHERE w.subject_id = j.id AND w.subject_kind = 'job' AND w.type = 'job.waiting') AS wait_seq,
       (SELECT max(c.seq) FROM events c WHERE c.subject_id = j.id AND c.subject_kind = 'job' AND c.type = 'job.claimed') AS claim_seq
     FROM jobs j WHERE j.state = 'queued' ORDER BY j.n`,
  );
  const out: { jobId: string; resource: WaitResource }[] = [];
  for (const row of rows) {
    const wait = row["wait"];
    const waitSeq = row["wait_seq"];
    const claimSeq = row["claim_seq"];
    if (typeof wait !== "string" || typeof waitSeq !== "number") continue;
    if (typeof claimSeq === "number" && claimSeq > waitSeq) continue;
    const d = parseJsonAt("job.waiting data", waitData, wait);
    if (!d.ok) continue;
    out.push({ jobId: String(row["id"]), resource: d.value.resource });
  }
  return out;
}
