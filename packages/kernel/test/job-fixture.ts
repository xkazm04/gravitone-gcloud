import path from "node:path";
import { parseAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import { jobIdSchema, type JobId } from "@gt/domain/ids";
import type { Holder } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import { blobStore } from "../src/blob.ts";
import { liveEffects, type Effects } from "../src/effects.ts";
import { eventsMigrations } from "../src/events.ts";
import type { MissingStep, Producer, StepOutcome } from "../src/job-core.ts";
import { jobMigrations } from "../src/job.ts";
import { leaseMigrations } from "../src/lease.ts";
import { migrate } from "../src/migrate.ts";
import { spendMigrations } from "../src/spend/ledger.ts";
import { openStore, type Store } from "../src/store.ts";
import { must } from "./helpers.ts";

// Shared by the job tests: a world on a real store file with a clock the test
// moves, and a scripted producer that counts every perform per step.

export const KERNEL = [eventsMigrations, leaseMigrations, jobMigrations, spendMigrations];
export const operator: Actor = { kind: "operator", id: "kazda" };
export const agent: Actor = { kind: "agent", id: "claude" };
export const hostA: Holder = { bootId: "boot-a", pid: 501, host: "box-a" };
export const hostB: Holder = { bootId: "boot-b", pid: 502, host: "box-b" };
export const jobId = (s: string): JobId => must(parseAt("job id", jobIdSchema, s));

export type World = { file: string; store: Store; fx: Effects; clock: { ms: number } };

export function openWorld(file: string, clock: { ms: number } = { ms: Date.parse("2026-10-15T12:00:00.000Z") }, snapshotDir = path.dirname(file)): World {
  const store = must(openStore(file, { clock: () => new Date(clock.ms) }));
  must(migrate(store, KERNEL, { snapshotDir }));
  return { file, store, fx: liveEffects(store, blobStore(`${file}.blobs`)), clock };
}

export type Script = (step: MissingStep, call: number) => StepOutcome | Promise<StepOutcome>;

/** A producer over named steps; a step's output exists once booked. */
export function producer(lane: ResourceLane, steps: readonly string[], script: Script = (s) => ({ kind: "produced", output: { made: s.name } }), estimateUsd = 0.01) {
  const calls = new Map<string, number>();
  const p: Producer = {
    lane,
    plan: (_job, outputs) => steps.filter((s) => !outputs.has(s)).map((name) => ({ name, estimate: { seconds: 1, usd: estimateUsd } })),
    perform: async (step) => {
      const n = (calls.get(step.name) ?? 0) + 1;
      calls.set(step.name, n);
      return script(step, n);
    },
  };
  return { p, calls };
}

export function count(s: Store, sql: string, ...params: string[]): number {
  const v = must(s.read((r) => r.get(sql, ...params)?.["n"]));
  return typeof v === "number" ? v : -1;
}

export function eventTypes(s: Store, subject: string): string[] {
  return must(s.read((r) => r.all("SELECT type FROM events WHERE subject_id = ? ORDER BY seq", subject).map((e) => String(e["type"]))));
}
