import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Job } from "@gt/domain/job";
import { vendorHealth, type Health } from "../src/job-core.ts";
import { runJob, type RunOptions } from "../src/job-run.ts";
import { enqueue, get } from "../src/job.ts";
import { must, scratch } from "./helpers.ts";
import { hostA, jobId, LIVE, openWorld, operator, producer, type World } from "./job-fixture.ts";

// L45 (Phase 4 exit, L44's live mv/Suno rows): health is the JOB's question. A dry job's vendor is
// its stand-in, so a live vendor that is down (the studio browser closed, Suno's CDP absent) must
// not leave a dry job queued forever; a live job still waits on it, claiming and failing nothing.

const tmp = scratch("jobhealth");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `h-${++n}.sqlite`));
const opts: RunOptions = { holder: hostA, alive: () => true, sleep: async () => {} };

function queued(w: World, live: boolean): void {
  must(enqueue(w.store, { id: "job-1", of: { kind: "run", id: "run-1" }, producer: "test", lane: "box.chrome", ...(live ? { mode: LIVE } : {}) }, operator));
}

/** A vendor probe that is down, counting how often it is asked. */
function down(): { probe: (job?: Job) => Promise<Health>; asked: (string | undefined)[] } {
  const asked: (string | undefined)[] = [];
  return {
    asked,
    probe: async (job) => {
      asked.push(job?.id);
      return { ok: false, reason: "the studio browser is closed" };
    },
  };
}

describe("a producer's health is asked about the job it is about to claim", () => {
  it("the driver passes the job, as it stands, to health", async () => {
    const w = world();
    queued(w, false);
    const seen: (Job | undefined)[] = [];
    const { p } = producer("box.chrome", ["a"]);
    const r = must(
      await runJob(w.fx, { ...p, health: async (job) => (seen.push(job), { ok: true }) }, "job-1", opts),
    );
    expect(r.outcome).toBe("done");
    expect(seen.map((j) => [j?.id, j?.state, j?.mode.kind])).toEqual([["job-1", "queued", "dry"]]);
    w.store.close();
  });

  it("a DRY job behind a vendor that is down runs to done; the probe is never asked", async () => {
    const w = world();
    queued(w, false);
    const v = down();
    const { p, calls } = producer("box.chrome", ["a", "b"]);
    const r = must(await runJob(w.fx, { ...p, health: vendorHealth(v.probe) }, "job-1", { ...opts, dryOnly: true }));
    expect(r.outcome).toBe("done");
    expect([...calls.keys()]).toEqual(["a", "b"]);
    expect(v.asked).toEqual([]);
    w.store.close();
  });

  it("a LIVE job behind the same vendor claims nothing and fails nothing: it waits, named", async () => {
    const w = world();
    queued(w, true);
    const v = down();
    const { p, calls } = producer("box.chrome", ["a"]);
    const r = must(await runJob(w.fx, { ...p, health: vendorHealth(v.probe) }, "job-1", opts));
    expect(r).toEqual({ outcome: "unhealthy", reason: "the studio browser is closed" });
    expect(v.asked).toEqual(["job-1"]);
    expect(calls.size).toBe(0);
    expect(must(get(w.store, jobId("job-1"))).job.state).toBe("queued");
    w.store.close();
  });

  it("a question with no job in hand (an operator's look) is answered as a live job would be", async () => {
    const v = down();
    expect(await vendorHealth(v.probe)()).toEqual({ ok: false, reason: "the studio browser is closed" });
    expect(v.asked).toEqual([undefined]);
  });

  it("a job that is not there is the store's not-found, not a health answer", async () => {
    const w = world();
    const { p } = producer("box.chrome", ["a"]);
    const r = await runJob(w.fx, { ...p, health: async () => ({ ok: true }) }, "job-1", opts);
    expect(r.ok ? "ok" : r.error.code).toBe("not-found");
    w.store.close();
  });
});
