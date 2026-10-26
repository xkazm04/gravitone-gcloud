// RUNS' ONE READ (app/(studio)/projects/runs/_runs/load.ts), its caps: every store it reads is
// stubbed, so a read past a cap can be handed to it without a store holding that many rows.
//
//   1. A cap that drops rows says so. The ledger page's cap already did ("more than 1000 run
//      events in the window"); the kernel jobs' cap kept the last KERNEL_CAP in silence, so a
//      kernel holding more drew a day-line missing its oldest jobs with nothing on the page
//      saying any were left out.

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ok } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";

vi.mock("server-only", () => ({}));

const side = vi.hoisted(() => ({ jobs: [] as unknown[], produced: [] as unknown[], lists: 0 }));

vi.mock("../../lib/kernelStore.ts", () => ({
  kernel: () => ({ ok: true, value: { store: { read: (f: (r: unknown) => unknown) => ({ ok: true, value: f({ get: () => ({ n: side.jobs.length }) }) }) } } }),
}));
vi.mock("@gt/kernel/events-query", () => ({ queryEvents: () => ({ ok: true, value: { head: 0, events: [], capped: false } }) }));
vi.mock("@gt/kernel/job", () => ({ list: () => (side.lists++, { ok: true, value: side.jobs }) }));
vi.mock("../../lib/ledger/v1/sync.ts", () => ({
  freshLedger: () => ({ ok: true, value: {} }),
  liveNow: async () => ({ jobs: [], weir: [], slots: [], holds: [], failures: [] }),
}));
vi.mock("../../lib/producers/dojo.ts", () => ({ startableCycles: () => ({ ok: true, value: [] }) }));
vi.mock("../../app/(studio)/projects/_port/port.ts", () => ({
  SIDE: "real",
  serverProduce: () => ({
    listJobs: () => ok(side.produced),
    listHolds: () => ok([]),
    listProjects: () => ok({ projects: [], truncated: false }),
    composeChoices: () => ok({ recipes: [], styles: [], takes: [], topics: [] }),
  }),
}));

const { KERNEL_CAP, loadRuns } = await import("../../app/(studio)/projects/runs/_runs/load.ts");

const NOW = Date.parse("2026-10-24T12:00:00.000Z");
const kjob = (n: number): Job =>
  ({ id: `job:run:r${n}`, of: { kind: "run", id: `r${n}` }, lane: "seat.text", state: "done", progress: { done: 1, total: 1 }, attempt: 1 }) as unknown as Job;

beforeEach(() => {
  side.jobs = [];
  side.produced = [];
  side.lists = 0;
});

describe("1. a cap that drops rows says so", () => {
  it("a kernel past KERNEL_CAP draws the last KERNEL_CAP and names how many it left out", async () => {
    side.jobs = Array.from({ length: KERNEL_CAP + 3 }, (_, i) => kjob(i));
    const d = await loadRuns(NOW);
    expect(d.model.jobs.filter((j) => j.from === "kernel")).toHaveLength(KERNEL_CAP);
    expect(d.model.jobs.some((j) => j.id === "job:run:r0")).toBe(false);
    expect(d.problems).toEqual([{ source: "kernel jobs", error: `more than ${KERNEL_CAP} kernel jobs; the first 3 in queue order are not drawn` }]);
  });

  it("a kernel at the cap reports nothing", async () => {
    side.jobs = Array.from({ length: KERNEL_CAP }, (_, i) => kjob(i));
    const d = await loadRuns(NOW);
    expect(d.model.jobs.filter((j) => j.from === "kernel")).toHaveLength(KERNEL_CAP);
    expect(d.problems).toEqual([]);
  });
});

describe("2. the kernel's jobs are read once per render", () => {
  const produced = (n: number): unknown =>
    ({ id: `job:run:r${n}`, title: `run r${n}`, lane: "seat.text", state: "done", media: "text", after: [], s: 0, e: 1, queuePos: 0, blocked: false, held: false, estimate: { seconds: 1, usd: 0, src: "illustrative" }, units: 1, noun: "step", options: [], acts: [] });

  it("when the produce read answered for every job, the kernel's list is not read", async () => {
    side.jobs = Array.from({ length: 40 }, (_, i) => kjob(i));
    side.produced = side.jobs.map((_, i) => produced(i));
    const d = await loadRuns(NOW);
    expect(side.lists).toBe(0);
    expect(d.model.jobs.filter((j) => j.id.startsWith("job:run:r"))).toHaveLength(40);
  });

  it("when the produce read left a job out, the kernel's list is read and that job is still drawn", async () => {
    side.jobs = Array.from({ length: 40 }, (_, i) => kjob(i));
    side.produced = side.jobs.slice(1).map((_, i) => produced(i + 1));
    const d = await loadRuns(NOW);
    expect(side.lists).toBe(1);
    expect(d.model.jobs.some((j) => j.id === "job:run:r0")).toBe(true);
  });
});
