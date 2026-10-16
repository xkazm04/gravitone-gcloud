import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { ResourceLane } from "@gt/domain/lane";
import type { Effects } from "../src/effects.ts";
import { armLive, dryOnlyFrom, withDryRun } from "../src/dryrun.ts";
import type { Producer } from "../src/job-core.ts";
import { laneHold } from "../src/job-queue.ts";
import { runJob, type RunOptions } from "../src/job-run.ts";
import { enqueue, get } from "../src/job.ts";
import type { SpendClass } from "../src/spend/core.ts";
import { must, scratch } from "./helpers.ts";
import { count, eventTypes, hostA, jobId, LIVE, openWorld, operator, type World } from "./job-fixture.ts";

// G-dry: a dry job runs END TO END. The driver's own calls (health, perform)
// are kernel calls and pass the dry port; what a step pays for is what the
// producer declares, and in dry that is answered by a stand-in and booked as a
// would-call. And a throw never leaves a job `running` with a stage.

const tmp = scratch("jobdry");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `d-${++n}.sqlite`));
const opts: RunOptions = { holder: hostA, alive: () => true, sleep: async () => {} };
const IMAGING: SpendClass = { id: "imaging-usd", unit: "usd", windowMs: 86_400_000, ceiling: 5 };
const subject = { kind: "job", id: "j1" };

/** A producer whose every step is one declared, metered vendor call. */
function stills(steps: readonly string[], vendor: { calls: number }): Producer {
  return {
    lane: "cloud.google",
    health: async () => ({ ok: true }),
    plan: (_j, outputs) => steps.filter((s) => !outputs.has(s)).map((name) => ({ name, estimate: { seconds: 5, usd: 0.04 } })),
    perform: async (step, ctx) => {
      const intent = { provider: "google", model: "nano-banana", usage: { image: 1 }, quote: { usd: 0.04, basis: "estimated" as const, note: "1 image" }, payload: { step: step.name }, subject, stand: () => `stand-in:${step.name}` };
      const r = await ctx.meter.paid(IMAGING, 0.04, intent, async () => {
        vendor.calls++;
        return { value: `pixels:${step.name}`, entries: [{ amount: 0.039, outcome: "served" as const, basis: "vendor", axes: {} }] };
      });
      if (!r.ok) return r.error.code === "budget" ? { kind: "money-stop", message: r.error.message } : { kind: "fatal", code: r.error.code, message: r.error.message };
      return { kind: "produced", output: { file: r.value } };
    },
  };
}

function put(w: World, extra: Record<string, unknown> = {}, lane: ResourceLane = "cloud.google"): void {
  must(enqueue(w.store, { id: "j1", of: { kind: "run", id: "run-1" }, producer: "stills", lane, ...extra }, operator));
}

describe("a dry job runs end to end", () => {
  it("never calls the vendor, books a would-call per paid call, finishes done and lists the receipts", async () => {
    const w = world();
    put(w);
    const vendor = { calls: 0 };
    const r = must(await runJob(w.fx, stills(["a", "b"], vendor), "j1", opts));
    expect(r.outcome).toBe("done");
    expect(vendor.calls).toBe(0);
    expect(r.wouldCalls?.map((c) => c.provider)).toEqual(["google", "google"]);
    expect(r.job).toMatchObject({ mode: { kind: "dry" }, spend: { usd: 0, unpriced: 0 } });
    expect(count(w.store, "SELECT count(*) AS n FROM events WHERE type = 'dryrun.would-call'")).toBe(2);
    expect(count(w.store, "SELECT count(*) AS n FROM spend_reservations")).toBe(0);
    expect(count(w.store, "SELECT count(*) AS n FROM spend_rows")).toBe(0);
    w.store.close();
  });

  it("works when the caller already hands it a dry port (the G-dry refusal), booking each would-call once", async () => {
    const w = world();
    put(w);
    const port = withDryRun(w.fx, { kind: "dry" }, operator);
    const r = must(await runJob(port.effects, stills(["a"], { calls: 0 }), "j1", opts));
    expect(r.outcome).toBe("done");
    expect(count(w.store, "SELECT count(*) AS n FROM events WHERE type = 'dryrun.would-call'")).toBe(1);
    expect(port.wouldCalls).toHaveLength(1);
    w.store.close();
  });

  it("an undeclared vendor call in a dry job fails the job with the refusal; it is never left running", async () => {
    const w = world();
    put(w);
    let touched = 0;
    const p: Producer = { ...stills(["a"], { calls: 0 }), perform: async (_s, ctx) => ctx.fx.call("raw-fetch", async () => (touched++, { kind: "produced" as const, output: {} })) };
    const r = must(await runJob(w.fx, p, "j1", opts));
    expect(touched).toBe(0);
    expect(r.job).toMatchObject({ state: "failed", error: { code: "refused" } });
    expect(r.job?.progress.stage).toBeUndefined();
    w.store.close();
  });

  it("a live job calls the vendor and settles on the meter against its job and step", async () => {
    const w = world();
    put(w, { mode: LIVE });
    const vendor = { calls: 0 };
    const r = must(await runJob(w.fx, stills(["a"], vendor), "j1", opts));
    expect(r).toMatchObject({ outcome: "done", job: { spend: { usd: 0.039, unpriced: 0, basis: "reported" } } });
    expect(r.wouldCalls).toBeUndefined();
    expect(vendor.calls).toBe(1);
    expect(must(w.store.read((x) => x.all("SELECT job_id, step, state FROM spend_reservations")))).toEqual([{ job_id: "j1", step: "a", state: "settled" }]);
    w.store.close();
  });
});

describe("GRAVITONE_DRY_ONLY", () => {
  it("is read from the env handed in, and refuses an arm and a live drive", async () => {
    expect(dryOnlyFrom({ GRAVITONE_DRY_ONLY: "1" })).toBe(true);
    expect(dryOnlyFrom({})).toBe(false);
    expect(armLive(operator, "2026-10-15T12:00:00.000Z", "launch", { dryOnly: true })).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(armLive(operator, "2026-10-15T12:00:00.000Z", "launch", { dryOnly: false }).ok).toBe(true);
    const w = world();
    put(w, { mode: LIVE });
    const vendor = { calls: 0 };
    expect(await runJob(w.fx, stills(["a"], vendor), "j1", { ...opts, dryOnly: true })).toMatchObject({ ok: false, error: { code: "refused" } });
    expect(vendor.calls).toBe(0);
    expect(must(get(w.store, jobId("j1"))).job.state).toBe("queued");
    expect(eventTypes(w.store, "j1")).toEqual(["job.enqueued"]);
    w.store.close();
  });
});

describe("a throw never leaves a job running", () => {
  const plain = (lane: "gpu.local" | "cloud.google"): Producer => ({ lane, plan: (_j, o) => (o.has("a") ? [] : [{ name: "a", estimate: { seconds: 1, usd: 0 } }]), perform: async () => ({ kind: "produced", output: {} }) });

  it("a store fault while booking fails the job with its sentence, the slot released, the unbooked step still named", async () => {
    const w = world();
    put(w, {}, "gpu.local");
    const broken: Effects = { ...w.fx, tx: (name, fn) => (name === "book:a" ? (() => { throw new Error("disk I/O error"); })() : w.fx.tx(name, fn)) };
    const r = await runJob(broken, plain("gpu.local"), "j1", opts);
    expect(r).toMatchObject({ ok: false, error: { message: "disk I/O error" } });
    const { job } = must(get(w.store, jobId("j1")));
    expect(job).toMatchObject({ state: "failed", error: { code: "internal", message: "disk I/O error" } });
    // The step was dispatched and never booked: the record keeps saying so (job-coordination: in-flight-is-a-position).
    expect(job.progress.stage).toBe("a");
    expect(count(w.store, "SELECT count(*) AS n FROM leases WHERE holder_pid IS NOT NULL")).toBe(0);
    w.store.close();
  });

  it("a fence lost mid-step interrupts the job with its stage, and a paid lane holds", async () => {
    const w = world();
    put(w);
    const p: Producer = { ...plain("cloud.google"), perform: async () => ((w.clock.ms += 10 * 60_000), { kind: "produced", output: {} }) };
    const r = await runJob(w.fx, p, "j1", { ...opts, heartbeatMs: 3_600_000 });
    expect(r).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(must(get(w.store, jobId("j1"))).job).toMatchObject({ state: "interrupted", interruption: { stage: "a" } });
    expect(must(w.store.read((x) => laneHold(x, "cloud.google")))).toMatchObject({ jobId: "j1", stage: "a" });
    w.store.close();
  });
});
