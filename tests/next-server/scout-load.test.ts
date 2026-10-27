import { ROOT, disposeRoot } from "./scout-cli-harness.ts";

import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

// A NIGHT'S LOAD (spark night-load-band WP-L2) - lib/foundry/scout/load.ts over the kernel's load samples,
// the `status` lines the seat steers by, and the taste brief's `## Last night's load`. The samples table is
// WP-L1's: here @gt/kernel/resources/load is a FAKE READER over the samples below, which records the window
// each read asked for. Jobs and their events are the real kernel's, in a temp store (the harness's).

const fake = vi.hoisted(() => ({ samples: [] as import("@gt/domain/load").LoadSample[], asked: [] as [number, number][] }));
vi.mock("server-only", () => ({}));
vi.mock("@gt/kernel/resources/load", async (actual) => ({
  ...(await actual<typeof import("@gt/kernel/resources/load")>()),
  readLoadSamples: (_r: unknown, fromMs: number, toMs: number) => {
    fake.asked.push([fromMs, toMs]);
    return fake.samples.filter((s) => s.atMs >= fromMs && s.atMs <= toMs);
  },
}));

import { openKernel } from "@gt/kernel/kernel";
import { enqueue } from "@gt/kernel/job";
import { closeProcessKernel, processKernel } from "@gt/kernel/process";
import { summarizeLoad, type LoadSample } from "@gt/domain/load";

import { interruptedOf, nightLoad, recentLine, recentLoad, waitingLine } from "../../lib/foundry/scout/load.ts";
import { createNight, mutateNight } from "../../lib/foundry/scout/store.ts";
import { loadSection, tasteBrief, tasteOf } from "../../lib/foundry/scout/taste.ts";
import type { Night } from "../../lib/foundry/scout/types.ts";
import { runCli } from "../../pipeline/scout.mts";

afterAll(() => {
  closeProcessKernel();
  disposeRoot();
});

const MIN = 60_000;
const T0 = Date.parse("2026-10-22T22:00:00.000Z");
const iso = (ms: number): string => new Date(ms).toISOString();
const actor = { kind: "agent", id: "scout-test" } as const;

/** One sample a minute over [fromMs, toMs), every resource reading `v`. */
const minutes = (fromMs: number, toMs: number, v: number, extra: Partial<LoadSample> = {}): LoadSample[] =>
  Array.from({ length: Math.floor((toMs - fromMs) / MIN) }, (_, i) => ({ atMs: fromMs + i * MIN, load: { cpuBusy: v, gpuBusy: v / 2, commitUsedGb: 60 }, ramUsedGb: v * 64, ramTotalGb: 64, commitLimitGb: 110, ...extra }));

const night = (over: Partial<Night>): Night => ({ id: "2026-10-22", startedAt: iso(T0), ceilingUsd: 15, target: 20, clipCap: 2, dry: false, state: "closed", closedAt: iso(T0 + 60 * MIN), sources: [], candidates: [], jobs: [], ...over });

describe("nightLoad - the night's window", () => {
  it("runs from startedAt to the end of the night's last job when that job ran past the close", () => {
    let now = T0 + 30 * MIN;
    const k = openKernel(":memory:", { clock: () => new Date(now) });
    if (!k.ok) throw k.error;
    const store = k.value.store;
    for (const [id, at] of [["job:a", T0 + 30 * MIN], ["job:b", T0 + 90 * MIN]] as const) {
      now = at;
      const j = enqueue(store, { id, of: { kind: "run", id: `run-${id}` }, producer: "scout-scene", lane: "gpu.local" }, actor);
      if (!j.ok) throw j.error;
    }
    // Load before the night, during it, and after its last job's last move.
    fake.samples = [...minutes(T0 - 30 * MIN, T0, 0.9), ...minutes(T0, T0 + 100 * MIN, 0.7), ...minutes(T0 + 100 * MIN, T0 + 130 * MIN, 0.1)];
    fake.asked = [];
    const s = nightLoad(store, night({ jobs: ["job:a", "job:b", "job:never-enqueued"] }), T0 + 12 * 60 * MIN);
    expect(fake.asked).toEqual([[T0, T0 + 90 * MIN]]);
    expect(s).toMatchObject({ fromMs: T0, toMs: T0 + 90 * MIN, samples: 91 });
    expect(s?.cpu).toMatchObject({ avg: 0.7, inBand: 1, read: 91 });
    expect(s?.cpu.strip).toHaveLength(18);
    expect(s?.commit).toEqual({ peakGb: 60, limitGb: 110 });

    // With no job past it, the close ends the window.
    expect(nightLoad(store, night({}), T0 + 12 * 60 * MIN)).toMatchObject({ toMs: T0 + 60 * MIN, samples: 61 });
    k.value.close();
  });

  it("an open night ends at now, or at its deadline once that has passed; none ends after now", () => {
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    const store = k.value.store;
    fake.samples = minutes(T0, T0 + 200 * MIN, 0.65);
    const open = night({ state: "open", closedAt: undefined as never });
    const { closedAt: _none, ...still } = open;
    expect(nightLoad(store, { ...still, deadline: iso(T0 + 120 * MIN) }, T0 + 45 * MIN)).toMatchObject({ toMs: T0 + 45 * MIN });
    expect(nightLoad(store, { ...still, deadline: iso(T0 + 120 * MIN) }, T0 + 180 * MIN)).toMatchObject({ toMs: T0 + 120 * MIN });
    expect(nightLoad(store, still, T0 + 30 * MIN)).toMatchObject({ toMs: T0 + 30 * MIN });
    k.value.close();
  });

  it("a night with no samples in its window has no load", () => {
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    fake.samples = minutes(T0 + 2 * 60 * MIN, T0 + 3 * 60 * MIN, 0.7);
    expect(nightLoad(k.value.store, night({}), T0 + 12 * 60 * MIN)).toBeUndefined();
    k.value.close();
  });
});

describe("recentLoad - the last 15 minutes, for status", () => {
  it("averages what was read, names the unread, and says what waits at the newest sample", () => {
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    const now = T0 + 60 * MIN;
    fake.samples = [
      ...minutes(now - 40 * MIN, now - 20 * MIN, 0.9),
      ...minutes(now - 14 * MIN, now, 0.34).map((s) => ({ ...s, load: { cpuBusy: 0.34 }, ramUsedGb: 33.28 })),
      { atMs: now, load: { cpuBusy: 0.34 }, ramUsedGb: 33.28, ramTotalGb: 64, waiting: [{ jobId: "job:x", resource: "memory" }, { jobId: "job:y", resource: "memory" }, { jobId: "job:z", resource: "comfy-queue" }] },
    ];
    const r = recentLoad(k.value.store, now);
    expect(r).toMatchObject({ minutes: 15, samples: 15, avg: { cpu: 0.34, ram: 0.52 }, band: { low: 0.6, high: 0.8 } });
    expect(r.avg).not.toHaveProperty("gpu");
    expect(recentLine(r)).toBe("load (15 min) cpu 34% · ram 52% · gpu unread - band 60-80%");
    expect(waitingLine(r)).toBe("waiting: memory 2 · comfy-queue 1");
    fake.samples = [];
    const none = recentLoad(k.value.store, now);
    expect(recentLine(none)).toBe("load (15 min) no samples - band 60-80%");
    expect(waitingLine(none)).toBeUndefined();
    k.value.close();
  });
});

describe("the taste brief - last night's load", () => {
  const load = (v: number) => {
    const k = openKernel(":memory:");
    if (!k.ok) throw k.error;
    fake.samples = [...minutes(T0, T0 + 30 * MIN, v), ...minutes(T0 + 30 * MIN, T0 + 60 * MIN, 0.7, { waiting: [{ jobId: "job:a", resource: "memory" }] })];
    const s = nightLoad(k.value.store, night({}), T0 + 12 * 60 * MIN);
    k.value.close();
    if (s === undefined) throw new Error("no load");
    return s;
  };

  it("opens the brief with the night's averages, time in band, the waits and what sat idle", () => {
    const md = tasteOf([], { night: night({}), load: load(0.2) });
    expect(md).toContain(
      [
        "## Last night's load",
        "",
        "- 2026-10-22 · 1.0 h · 60 samples · band 60-80%",
        "- cpu avg 45% (50% in band) · ram avg 45% (50% in band) · gpu avg 23% (0% in band) · waited: memory 30 min",
        "- gpu under 60% for 100% of the night",
      ].join("\n"),
    );
    expect(md.indexOf("## Last night's load")).toBeLessThan(md.indexOf("No committed live night yet"));
  });

  it("is absent for nights without samples", () => {
    expect(tasteOf([])).not.toContain("Last night's load");
  });

  it("names nothing idle when every resource held the band, and an unread one as unread", () => {
    const held = summarizeLoad(minutes(T0, T0 + 30 * MIN, 0.7).map((s) => ({ ...s, load: { cpuBusy: 0.7 } })), { fromMs: T0, toMs: T0 + 30 * MIN });
    expect(loadSection(night({}), held).slice(3, 5)).toEqual(["- cpu avg 70% (100% in band) · ram avg 70% (100% in band) · gpu unread", "- nothing under 60%"]);
  });

  it("tasteBrief reads the newest closed night its reader has samples for", async () => {
    const older = await createNight({ dry: true, ceilingUsd: 15, target: 20, clipCap: 2, now: new Date(T0) });
    await mutateNight(older.id, (n) => ({ ...n, state: "closed", closedAt: iso(T0 + 60 * MIN) }));
    const newer = await createNight({ dry: true, ceilingUsd: 15, target: 20, clipCap: 2, now: new Date(T0 + 24 * 60 * MIN) });
    await mutateNight(newer.id, (n) => ({ ...n, state: "closed", closedAt: iso(T0 + 25 * 60 * MIN) }));
    const s = load(0.7);
    const md = await tasteBrief("none", (n) => (n.id === older.id ? s : undefined));
    expect(md).toContain(`- ${older.id} (dry) · 1.0 h · 60 samples · band 60-80%`);
    expect(md).toContain("- cpu avg 70% (100% in band) · ram avg 70% (100% in band) · gpu avg 35% (0% in band) · waited: memory 30 min");
    expect(await tasteBrief("none")).not.toContain("Last night's load");
  });
});

describe("status - the load against the band, and the night's interrupted jobs", () => {
  it("--json carries load and interrupted; the text prints the load line, the waits and the ids", async () => {
    const now = T0 + 3 * 24 * 60 * MIN;
    const n = await createNight({ dry: true, ceilingUsd: 15, target: 20, clipCap: 2, now: new Date(now - 60 * MIN) });
    const k = processKernel(path.join(ROOT, "kernel.sqlite"));
    if (!k.ok) throw k.error;
    const store = k.value.store;
    for (const id of ["job:scout-scene:i1", "job:scout-scene:q1"]) {
      const j = enqueue(store, { id, of: { kind: "run", id: `run-${id}` }, producer: "scout-scene", lane: "gpu.local" }, actor);
      if (!j.ok) throw j.error;
    }
    // An interrupted job, as a crash leaves one (the state column is what interruptedOf reads).
    const set = store.tx((t) => t.run("UPDATE jobs SET state = 'interrupted' WHERE id = ?", "job:scout-scene:i1"));
    if (!set.ok) throw set.error;
    await mutateNight(n.id, (x) => ({ ...x, jobs: ["job:scout-scene:i1", "job:scout-scene:q1"] }));
    expect(interruptedOf(store, { ...n, jobs: ["job:scout-scene:i1", "job:scout-scene:q1"] })).toEqual(["job:scout-scene:i1"]);
    fake.samples = minutes(now - 15 * MIN, now + MIN, 0.7, { waiting: [{ jobId: "job:scout-scene:q1", resource: "comfy-queue" }] });

    const run = async (argv: string[]) => {
      const out: string[] = [];
      const code = await runCli(argv, { env: { ...process.env, GRAVITONE_DRY_ONLY: "1" }, out: (s) => out.push(s), err: () => undefined, ports: { now: () => new Date(now) } });
      return { code, out: out.join("\n") };
    };
    const j = await run(["status", n.id, "--json"]);
    expect(j.code).toBe(0);
    const doc = JSON.parse(j.out) as Record<string, unknown>;
    expect(doc["load"]).toEqual({ last15: { cpu: 0.7, ram: 0.7, gpu: 0.35 }, band: { low: 0.6, high: 0.8 }, waiting: [{ jobId: "job:scout-scene:q1", resource: "comfy-queue" }], samples: 16 });
    expect(doc["interrupted"]).toEqual(["job:scout-scene:i1"]);

    const t = await run(["status", n.id]);
    expect(t.out).toContain("load (15 min) cpu 70% · ram 70% · gpu 35% - band 60-80%");
    expect(t.out).toContain("waiting: comfy-queue 1");
    expect(t.out).toContain("interrupted: job:scout-scene:i1");
    // The CLI loads its whole command table on first call: slow beside a full parallel unit run.
  }, 60_000);
});
