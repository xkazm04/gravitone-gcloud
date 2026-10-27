import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { LoadSample } from "@gt/domain/load";
import { append, eventsMigrations } from "../src/events.ts";
import { openKernel } from "../src/kernel.ts";
import { migrate } from "../src/migrate.ts";
import { loadMigrations, newestLoadSampleMs, pruneLoadSamplesIn, readLoadSamples, recordLoadSampleIn, RETENTION_MS, waitingJobsIn } from "../src/resources/load.ts";
import { openStore, type Store } from "../src/store.ts";
import { KERNEL as JOB_FIXTURE } from "./job-fixture.ts";
import { must, scratch, steppingClock } from "./helpers.ts";

// THE LOAD SAMPLES (spark night-load-band): one row a minute of the box, append-only but for a thirty-day
// retention. A window reads back in order through the door; the prune lets go of only what is both before
// its cutoff and older than the retention, and the trigger refuses any hand-written delete inside it; the
// module migrates on a fresh store and on one that already carries every other module.

const tmp = scratch("load");
afterAll(() => tmp.dispose());
let n = 0;
const file = (): string => path.join(tmp.dir, `l-${++n}.sqlite`);
const T0 = Date.parse("2026-10-23T22:00:00.000Z");
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const kernel = (): Store => must(openKernel(file(), { clock: steppingClock() })).store;
const sample = (atMs: number, over: Partial<LoadSample> = {}): LoadSample => ({ atMs, load: { cpuBusy: 0.62, gpuBusy: 0.4, commitUsedGb: 70.5 }, ramUsedGb: 40, ramTotalGb: 63.9, commitLimitGb: 120, ...over });

describe("load samples", () => {
  it("records three and reads a window of two, oldest first, absent fields still absent", () => {
    const s = kernel();
    must(s.tx((t) => {
      recordLoadSampleIn(t, sample(T0 + 2 * MIN, { load: { commitUsedGb: 71 }, waiting: [{ jobId: "job-1", resource: "memory" }] }));
      recordLoadSampleIn(t, sample(T0));
      recordLoadSampleIn(t, sample(T0 + MIN));
    }));
    const got = must(s.read((r) => readLoadSamples(r, T0 + MIN, T0 + 2 * MIN)));
    expect(got.map((x) => x.atMs)).toEqual([T0 + MIN, T0 + 2 * MIN]);
    expect(got[1]).toEqual({ atMs: T0 + 2 * MIN, load: { commitUsedGb: 71 }, ramUsedGb: 40, ramTotalGb: 63.9, commitLimitGb: 120, waiting: [{ jobId: "job-1", resource: "memory" }] });
    expect(must(s.read((r) => newestLoadSampleMs(r)))).toBe(T0 + 2 * MIN);
    s.close();
  });

  it("refuses a sample the door would refuse on the way out, and any rewrite", () => {
    const s = kernel();
    const bad = s.tx((t) => recordLoadSampleIn(t, sample(T0, { load: { cpuBusy: 1.5 } })));
    expect(bad.ok).toBe(false);
    must(s.tx((t) => recordLoadSampleIn(t, sample(T0))));
    const rewrite = s.tx((t) => t.run("UPDATE load_samples SET at_ms = 0"));
    expect(rewrite.ok).toBe(false);
    s.close();
  });

  it("prunes only the rows before the cutoff that are older than the retention; the trigger holds the rest", () => {
    const s = kernel();
    const now = T0 + 40 * DAY;
    must(s.tx((t) => {
      for (const d of [0, 5, 9, 20, 40]) recordLoadSampleIn(t, sample(T0 + d * DAY));
    }));
    // Cutoff at day 7: days 0 and 5 go; day 9 is after the cutoff and stays.
    expect(must(s.tx((t) => pruneLoadSamplesIn(t, T0 + 7 * DAY)))).toBe(2);
    expect(must(s.read((r) => readLoadSamples(r, 0, now))).map((x) => (x.atMs - T0) / DAY)).toEqual([9, 20, 40]);
    // A cutoff inside the retention (now) asks only for what the retention allows: day 9 (31 days before 40), not day 20.
    expect(must(s.tx((t) => pruneLoadSamplesIn(t, now)))).toBe(1);
    expect(must(s.read((r) => readLoadSamples(r, 0, now))).map((x) => (x.atMs - T0) / DAY)).toEqual([20, 40]);
    // By hand, a delete inside the retention is refused.
    const hand = s.tx((t) => t.run("DELETE FROM load_samples WHERE at_ms = ?", T0 + 20 * DAY));
    expect(hand.ok).toBe(false);
    expect(RETENTION_MS).toBe(30 * DAY);
    s.close();
  });

  it("migrates on a fresh store and on one that already carries every other module", () => {
    const fresh = must(openStore(file()));
    must(migrate(fresh, [eventsMigrations, loadMigrations], { snapshotDir: tmp.dir }));
    expect(must(fresh.read((r) => r.get("SELECT count(*) AS c FROM load_samples")?.["c"]))).toBe(0);
    fresh.close();

    // A store opened by the code before this module: every module but "load", then the whole kernel.
    const loc = file();
    const old = must(openStore(loc));
    must(migrate(old, JOB_FIXTURE, { snapshotDir: tmp.dir }));
    old.close();
    const k = must(openKernel(loc, { clock: steppingClock(), snapshotDir: tmp.dir }));
    expect(k.migrated.applied).toContainEqual({ module: "load", version: 1 });
    must(k.store.tx((t) => recordLoadSampleIn(t, sample(T0))));
    k.close();
    const again = must(openKernel(loc, { clock: steppingClock(), snapshotDir: tmp.dir }));
    expect(again.migrated.applied).toEqual([]);
    again.close();
  });

  it("names a queued job whose latest wait no claim has answered, and nothing else", () => {
    const s = kernel();
    must(s.tx((t) => {
      const job = (id: string, state: string): void => void t.run("INSERT INTO jobs (id, lane, state, record) VALUES (?, 'gpu.local', ?, '{}')", id, state);
      job("held", "queued");
      job("claimed", "queued");
      job("running", "running");
      job("never", "queued");
      const ev = (id: string, type: string, data: Record<string, string>): void =>
        void append(t, { actor: { kind: "machine", id: "worker" }, type, subject: { kind: "job", id }, data });
      ev("held", "job.waiting", { resource: "vram" });
      ev("claimed", "job.waiting", { resource: "memory" });
      ev("claimed", "job.claimed", {});
      ev("running", "job.waiting", { resource: "cpu" });
    }));
    expect(must(s.read((r) => waitingJobsIn(r)))).toEqual([{ jobId: "held", resource: "vram" }]);
    s.close();
  });
});
