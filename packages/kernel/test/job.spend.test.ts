import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { err } from "@gt/domain/errors";
import { enumerateCrashes, type CrashSpec, type Phase } from "../src/crash.ts";
import type { Effects } from "../src/effects.ts";
import type { MissingStep, Producer, StepContext, StepOutcome } from "../src/job-core.ts";
import { ackLane, laneHold } from "../src/job-queue.ts";
import { recover, runJob, type RunOptions } from "../src/job-run.ts";
import { enqueue, get, retry } from "../src/job.ts";
import type { SpendClass } from "../src/spend/core.ts";
import { meterOf, reconcileJobSpend } from "../src/spend/projection.ts";
import { must, scratch } from "./helpers.ts";
import { hostA, jobId, LIVE, openWorld, operator, type World } from "./job-fixture.ts";

// Decision 7: spend is the meter's. After ANY sequence - produced, a vendor
// failure that cost money, a money stop, a crash at any prefix, a retry - the
// job's usd equals the sum of its settled meter rows and its unpriced count
// equals the meter's. Credit-priced work is admitted under a USD ceiling and
// counted with its reason; a step with neither price nor credit still stops.

const tmp = scratch("jobspend");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `s-${++n}.sqlite`));
const opts: RunOptions = { holder: hostA, alive: () => true, sleep: async () => {} };
const J = jobId("j1");
const IMAGING = (ceiling = 5): SpendClass => ({ id: "imaging-usd", unit: "usd", windowMs: 86_400_000, ceiling });
const subject = { kind: "job", id: "j1" };

type Act = (step: MissingStep, ctx: StepContext, call: number) => Promise<StepOutcome> | StepOutcome;

function scripted(steps: readonly (MissingStep & { readonly act: Act })[]): { p: Producer; calls: Map<string, number> } {
  const calls = new Map<string, number>();
  const p: Producer = {
    lane: "cloud.google",
    plan: (_j, outputs) => steps.filter((s) => !outputs.has(s.name)),
    perform: async (step, ctx) => {
      const k = (calls.get(step.name) ?? 0) + 1;
      calls.set(step.name, k);
      const s = steps.find((x) => x.name === step.name);
      if (s === undefined) throw new Error(`no step ${step.name}`);
      return s.act(step, ctx, k);
    },
  };
  return { p, calls };
}

/** A metered image call that the vendor bills at `usd`. */
const metered = (cls: SpendClass, usd: number): Act => async (step, ctx) => {
  const intent = { provider: "google", model: "nano-banana", usage: { image: 1 }, quote: { usd: 0.04, basis: "estimated" as const, note: "1 image" }, payload: { step: step.name }, subject };
  const r = await ctx.meter.paid(cls, 0.04, intent, async () => ({ value: step.name, entries: [{ amount: usd, outcome: "served" as const, basis: "vendor", axes: {} }] }));
  if (!r.ok) return r.error.code === "budget" ? { kind: "money-stop", message: r.error.message } : { kind: "fatal", code: r.error.code, message: r.error.message };
  return { kind: "produced", output: { file: r.value } };
};

const priced = (name: string, act: Act, usd = 0.04): MissingStep & { act: Act } => ({ name, estimate: { seconds: 1, usd }, act });

function put(w: World, ceilingUsd?: number): void {
  must(enqueue(w.store, { id: "j1", of: { kind: "run", id: "run-1" }, producer: "p", lane: "cloud.google", mode: LIVE, ...(ceilingUsd === undefined ? {} : { ceilingUsd }) }, operator));
}
const reconciled = (w: World) => must(w.store.read((r) => reconcileJobSpend(r, "j1")));

describe("the job's spend is the meter's projection", () => {
  it("metered calls: the job's usd is the sum of its settled rows, and each row names its job and step", async () => {
    const w = world();
    put(w);
    const cls = IMAGING();
    const { p } = scripted([priced("a", metered(cls, 0.039)), priced("b", metered(cls, 0.041))]);
    const r = must(await runJob(w.fx, p, "j1", opts));
    expect(r.job?.spend).toEqual({ usd: 0.08, unpriced: 0, basis: "reported" });
    expect(reconciled(w).drift).toBeUndefined();
    expect(must(w.store.read((x) => x.all("SELECT job_id, step, usd FROM spend_rows ORDER BY seq")))).toEqual([
      { job_id: "j1", step: "a", usd: 0.039 },
      { job_id: "j1", step: "b", usd: 0.041 },
    ]);
    w.store.close();
  });

  it("a producer that does not meter is metered by the driver: its reported cost is a row against its job and step", async () => {
    const w = world();
    put(w);
    const { p } = scripted([priced("a", () => ({ kind: "produced", output: {}, costUsd: 0.03 })), priced("b", () => ({ kind: "produced", output: {} }), 0.02)]);
    const r = must(await runJob(w.fx, p, "j1", opts));
    expect(r.job?.spend).toEqual({ usd: 0.05, unpriced: 1, basis: "estimate" });
    expect(must(w.store.read((x) => x.all("SELECT class, job_id, step, usd, basis FROM spend_rows ORDER BY seq")))).toEqual([
      { class: "job-usd", job_id: "j1", step: "a", usd: 0.03, basis: "vendor" },
      { class: "job-usd", job_id: "j1", step: "b", usd: 0.02, basis: "estimate" },
    ]);
    expect(reconciled(w).drift).toBeUndefined();
    w.store.close();
  });

  it("a vendor failure that cost money is spend; the retry that follows adds its own", async () => {
    const w = world();
    put(w);
    const { p } = scripted([priced("a", (_s, _c, k) => (k === 1 ? { kind: "vendor-failure", message: "429", costUsd: 0.01 } : { kind: "produced", output: {}, costUsd: 0.04 }))]);
    const r = must(await runJob(w.fx, p, "j1", opts));
    expect(r.job?.spend).toEqual({ usd: 0.05, unpriced: 0, basis: "reported" });
    expect(reconciled(w).drift).toBeUndefined();
    w.store.close();
  });

  it("the period ceiling refusing a hold is a money stop; the job's spend is what settled before it", async () => {
    const w = world();
    put(w);
    const cls = IMAGING(0.05);
    const { p, calls } = scripted([priced("a", metered(cls, 0.04)), priced("b", metered(cls, 0.04))]);
    const r = must(await runJob(w.fx, p, "j1", opts));
    expect(r.job).toMatchObject({ state: "failed", error: { code: "budget" }, stop: { by: "period-ceiling" }, spend: { usd: 0.04 } });
    expect(calls.get("b")).toBe(1);
    expect(reconciled(w).drift).toBeUndefined();
    must(retry(w.store, J, operator));
    expect(reconciled(w).drift).toBeUndefined();
    w.store.close();
  });

  it("a hold its step never settled lapses: counted against the period, not in the job's known spend", async () => {
    const w = world();
    put(w);
    const cls = IMAGING();
    const { p } = scripted([
      priced("a", async (_s, ctx) => {
        must(ctx.meter.reserve(cls, 0.04));
        throw new Error("the vendor answered and the producer crashed reading it");
      }),
    ]);
    const r = must(await runJob(w.fx, p, "j1", opts));
    expect(r.job).toMatchObject({ state: "failed", spend: { usd: 0 } });
    expect(must(w.store.read((x) => x.all("SELECT state FROM spend_reservations")))).toEqual([{ state: "lapsed" }]);
    expect(reconciled(w).drift).toBeUndefined();
    w.store.close();
  });

  it("a settle the busy store deferred is applied when its step books, never left held", async () => {
    const w = world();
    put(w);
    const cls = IMAGING();
    let busy = 1;
    // The settle's own transaction meets a busy store once; every other transaction lands.
    const fx: Effects = {
      blob: (bytes, mime) => w.fx.blob(bytes, mime),
      call: (name, fn) => w.fx.call(name, fn),
      tx(name, fn) {
        if (name === "spend.settle" && busy-- > 0) return err("unavailable", "the store is busy");
        return w.fx.tx(name, fn);
      },
    };
    const { p } = scripted([priced("a", metered(cls, 0.03))]);
    const r = must(await runJob(fx, p, "j1", opts));
    expect(busy).toBe(0);
    expect(r.job).toMatchObject({ state: "done", spend: { usd: 0.03, basis: "reported" } });
    expect(must(w.store.read((x) => x.all("SELECT state FROM spend_reservations")))).toEqual([{ state: "settled" }]);
    expect(must(w.store.read((x) => x.get("SELECT value FROM spend_counters WHERE class = 'imaging-usd' AND name = 'lateWrites'")))).toEqual({ value: 1 });
    expect(reconciled(w).drift).toBeUndefined();
    w.store.close();
  });

  it("reconcile names a drift when the record and the meter disagree", () => {
    const w = world();
    put(w);
    must(w.store.tx((t) => t.run("UPDATE jobs SET record = json_set(record, '$.spend.usd', 1.5) WHERE id = 'j1'")));
    expect(reconciled(w)).toMatchObject({ job: { usd: 1.5 }, meter: { usd: 0 }, drift: { usd: 1.5, unpriced: 0 } });
    w.store.close();
  });
});

describe("credits under a USD ceiling", () => {
  it("a credit-priced step is admitted under a ceiling and booked unpriced WITH its reason", async () => {
    const w = world();
    put(w, 1);
    const credit = "Suno subscription credits are not priced per track";
    const { p, calls } = scripted([{ name: "track", estimate: { seconds: 240, usd: null, unpricedReason: credit }, credit, act: () => ({ kind: "produced", output: { id: "t1" } }) }]);
    const r = must(await runJob(w.fx, p, "j1", opts));
    expect(r.job).toMatchObject({ state: "done", spend: { usd: 0, unpriced: 1, basis: "estimate" } });
    expect(calls.get("track")).toBe(1);
    expect(must(w.store.read((x) => x.all("SELECT job_id, step, reason FROM spend_unpriced")))).toEqual([{ job_id: "j1", step: "track", reason: credit }]);
    expect(reconciled(w).drift).toBeUndefined();
    w.store.close();
  });

  it("a producer can book its own credit call; the driver then books nothing beside it", async () => {
    const w = world();
    put(w, 1);
    const { p } = scripted([{ name: "still", estimate: { seconds: 30, usd: null, unpricedReason: "studio credits" }, credit: "studio credits", act: (_s, ctx) => (must(ctx.meter.unpriced("Leonardo studio: 8 credits")), { kind: "produced", output: {} }) }]);
    must(await runJob(w.fx, p, "j1", opts));
    expect(must(w.store.read((x) => x.all("SELECT reason FROM spend_unpriced")))).toEqual([{ reason: "Leonardo studio: 8 credits" }]);
    expect(reconciled(w)).toMatchObject({ meter: { unpriced: 1 } });
    expect(reconciled(w).drift).toBeUndefined();
    w.store.close();
  });

  it("a step with no price and no credit under a ceiling still stops before it runs", async () => {
    const w = world();
    put(w, 1);
    const { p, calls } = scripted([{ name: "render", estimate: { seconds: 30, usd: null, unpricedReason: "nobody priced it" }, act: () => ({ kind: "produced", output: {} }) }]);
    const r = must(await runJob(w.fx, p, "j1", opts));
    expect(r.job).toMatchObject({ state: "failed", error: { code: "budget" }, stop: { by: "run-ceiling" } });
    expect(calls.size).toBe(0);
    w.store.close();
  });
});

type CW = World & { calls: Map<string, number>; atInterrupt?: string };

function invariant(w: CW, phase: Phase): string | undefined {
  if (phase === "crashed") return undefined;
  if (w.atInterrupt !== undefined) return w.atInterrupt;
  const { job } = must(get(w.store, J));
  if (job.state !== "done") return `recovery left the job ${job.state}`;
  const rec = must(w.store.read((r) => reconcileJobSpend(r, "j1")));
  if (rec.drift !== undefined) return `drift after recovery: ${JSON.stringify(rec)}`;
  const settled = must(w.store.read((r) => meterOf(r, "j1")));
  return settled.usd >= 0.08 ? undefined : `only $${settled.usd} settled for two served calls`;
}

describe("a metered job under crash-prefix enumeration", () => {
  it("after any crash, recovery, the operator's retry and a second drive, the record equals its meter", async () => {
    const cls = IMAGING();
    const spec: CrashSpec<CW> = {
      open: () => {
        const w = { ...openWorld(path.join(tmp.dir, `c-${++n}.sqlite`)), calls: new Map<string, number>() };
        put(w);
        return w;
      },
      reopen: (w) => {
        w.store.close();
        return { ...openWorld(w.file, w.clock, tmp.dir), calls: w.calls };
      },
      close: (w) => w.store.close(),
      effects: (w) => w.fx,
      scenario: async (fx, w) => {
        const { p } = scripted([priced("a", metered(cls, 0.04)), priced("b", metered(cls, 0.04))]);
        must(await runJob(fx, p, "j1", { ...opts, heartbeatMs: 3_600_000 }));
        void w;
      },
      recover: async (fx, w) => {
        must(recover(fx, { holder: { ...hostA, bootId: "boot-a-2" }, alive: () => true, spendClasses: [cls] }));
        // The interrupted record already equals its meter: a step that settled and died unbooked shows its spend.
        const atInterrupt = must(w.store.read((r) => reconcileJobSpend(r, "j1")));
        if (atInterrupt.drift !== undefined) w.atInterrupt = `drift on the interrupted record: ${JSON.stringify(atInterrupt)}`;
        if (must(get(w.store, J)).job.state === "interrupted") must(retry(w.store, J, operator));
        // cloud.google is a paid lane: the crash held it, and the operator acknowledges having looked.
        if (must(w.store.read((r) => laneHold(r, "cloud.google"))) !== undefined) must(ackLane(w.store, "cloud.google", operator));
        const { p } = scripted([priced("a", metered(cls, 0.04)), priced("b", metered(cls, 0.04))]);
        if (must(get(w.store, J)).job.state === "queued") must(await runJob(fx, p, "j1", { ...opts, holder: { ...hostA, bootId: "boot-a-2" }, heartbeatMs: 3_600_000 }));
      },
      invariant,
    };
    const report = await enumerateCrashes(spec);
    expect(report.effects).toContain("tx:meter.reserve");
    expect(report.effects).toContain("tx:spend.settle");
    expect(report.violations).toEqual([]);
    // ~20 crash points, each a fresh store and two drives: generous under a loaded parallel run.
  }, 30_000);
});
