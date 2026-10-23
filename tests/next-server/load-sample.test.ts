// THE ALWAYS-ON WORKER'S OWN PARTS (spark night-load-band): the env files it reads for itself
// (lib/envFile.ts) and its load sampler (lib/producers/loadSample.ts). A fake probe, a temp kernel
// store, a temp env folder: no PowerShell, no nvidia-smi, no worker process.
//   · a name only an env file holds is read, an exported value wins, values are never returned;
//   · one tick with a fake probe writes one row with the totals beside the reading and the jobs
//     admission holds; a probe that throws writes none and reports a failure the roster records.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { LOAD_SAMPLE_MS } from "@gt/domain/load";
import { append } from "@gt/kernel/events";
import { openKernel } from "@gt/kernel/kernel";
import { readLoadSamples, recordLoadSampleIn } from "@gt/kernel/resources/load";
import type { Store } from "@gt/kernel/store";
import { LOAD_SAMPLE } from "@gt/producers/publish/timers";

import { loadEnvFiles } from "../../lib/envFile.ts";
import { loadSampleTimer, sampleOf } from "../../lib/producers/loadSample.ts";
import type { MachineReading } from "../../lib/resources/probe.ts";
import type { TickContext } from "../../workers/timers.ts";

const DIR = mkdtempSync(path.join(tmpdir(), "gt-load-sample-"));
afterAll(() => rmSync(DIR, { recursive: true, force: true }));
let n = 0;
const T0 = Date.parse("2026-10-23T22:00:00.000Z");

describe("the worker's env files", () => {
  it("reads a name only .env.local holds, lets .env.local override .env, and never clobbers an exported value", () => {
    const root = mkdtempSync(path.join(DIR, "env-"));
    writeFileSync(path.join(root, ".env"), "SHARED=from-env\nONLY_ENV=a\n");
    writeFileSync(path.join(root, ".env.local"), '﻿# a comment\n\nLEONARDO_API_KEY="quoted-secret"\nSHARED=from-local\nEXPORTED=from-file\nEMPTY=\nnot a pair\n');
    const env: Record<string, string | undefined> = { EXPORTED: "from-shell" };
    const names = loadEnvFiles(root, undefined, env);
    expect(names).toEqual(["SHARED", "ONLY_ENV", "LEONARDO_API_KEY"]);
    expect(env).toEqual({ EXPORTED: "from-shell", SHARED: "from-local", ONLY_ENV: "a", LEONARDO_API_KEY: "quoted-secret" });
    expect(names.join(" ")).not.toContain("secret");
    expect(loadEnvFiles(path.join(root, "missing"), undefined, {})).toEqual([]);
  });
});

const reading: MachineReading = {
  load: { commitUsedGb: 82.4, vramUsedGb: 13.37, cpuBusy: 0.71, gpuBusy: 0.65, comfyQueue: 0 },
  totals: { commitLimitGb: 120, ramTotalGb: 63.9, ramFreeGb: 20.4, vramTotalGb: 62.5, cores: 20 },
};

function store(): Store {
  const k = openKernel(path.join(DIR, `k-${++n}.sqlite`), { clock: () => new Date(T0) });
  if (!k.ok) throw k.error;
  return k.value.store;
}

const ctx = (atMs: number): TickContext => ({ now: new Date(atMs), signal: new AbortController().signal, beat: async () => {} });
const rows = (s: Store) => {
  const r = s.read((rd) => readLoadSamples(rd, 0, Number.MAX_SAFE_INTEGER));
  if (!r.ok) throw r.error;
  return r.value;
};

describe("the load-sample timer", () => {
  it("ticks every LOAD_SAMPLE_MS, inside half its cadence, after the publish tick's boot", () => {
    expect(LOAD_SAMPLE).toEqual({ name: "load-sample", everyMs: LOAD_SAMPLE_MS, deadlineMs: 30_000, firstDelayMs: 5_000 });
  });

  it("one tick with a fake probe writes one row: the reading, RAM used from the totals, the jobs admission holds", async () => {
    const s = store();
    const w = s.tx((t) => {
      t.run("INSERT INTO jobs (id, lane, state, record) VALUES ('job-a', 'gpu.local', 'queued', '{}')");
      append(t, { actor: { kind: "machine", id: "worker" }, type: "job.waiting", subject: { kind: "job", id: "job-a" }, data: { resource: "memory", why: "commit charge would reach 110.0 GB" } });
    });
    expect(w.ok).toBe(true);
    const timer = loadSampleTimer({ store: s, read: async () => reading });
    const r = await timer.tick(ctx(T0));
    expect(r).toEqual({ ok: true, value: { count: 1, what: "load sample(s) recorded", detail: { waiting: 1, pruned: 0 } } });
    expect(rows(s)).toEqual([
      { atMs: T0, load: reading.load, ramUsedGb: 43.5, ramTotalGb: 63.9, commitLimitGb: 120, waiting: [{ jobId: "job-a", resource: "memory" }] },
    ]);
    s.close();
  });

  it("a probe that throws writes no row and reports a failure; the next good reading writes again", async () => {
    const s = store();
    let fail = true;
    const timer = loadSampleTimer({
      store: s,
      read: async () => {
        if (fail) throw new Error("powershell is not on PATH");
        return reading;
      },
    });
    const bad = await timer.tick(ctx(T0));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.message).toBe("the machine probe failed: powershell is not on PATH");
    expect(rows(s)).toEqual([]);
    fail = false;
    expect((await timer.tick(ctx(T0 + LOAD_SAMPLE_MS))).ok).toBe(true);
    expect(rows(s).map((x) => x.atMs)).toEqual([T0 + LOAD_SAMPLE_MS]);
    s.close();
  });

  it("prunes once an hour, rows past the thirty days only", async () => {
    const s = store();
    const DAY = 24 * 60 * 60_000;
    const timer = loadSampleTimer({ store: s, read: async () => reading });
    const first = await timer.tick(ctx(T0));
    expect(first.ok && first.value.detail).toEqual({ waiting: 0, pruned: 0 });
    // A row a worker wrote 31 days ago, after the first prune of this run.
    expect(s.tx((t) => recordLoadSampleIn(t, { atMs: T0 - 31 * DAY, load: {} })).ok).toBe(true);
    // Within the hour of the last prune, none is asked for; an hour on, the 31-day-old row goes.
    const soon = await timer.tick(ctx(T0 + 10 * 60_000));
    expect(soon.ok && soon.value.detail).toEqual({ waiting: 0, pruned: 0 });
    expect(rows(s)).toHaveLength(3);
    const later = await timer.tick(ctx(T0 + 60 * 60_000));
    expect(later.ok && later.value.detail).toEqual({ waiting: 0, pruned: 1 });
    expect(rows(s).map((x) => x.atMs)).toEqual([T0, T0 + 10 * 60_000, T0 + 60 * 60_000]);
    s.close();
  });

  it("a reading the probe could not take stays absent in the row, never zero", () => {
    expect(sampleOf(T0, { load: {}, totals: { cores: 20 } }, [])).toEqual({ atMs: T0, load: {} });
  });
});
