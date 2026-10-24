import path from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { AppError } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import { blobStore } from "../src/blob.ts";
import { liveEffects } from "../src/effects.ts";
import type { Ending, Producer } from "../src/job-core.ts";
import { runJob } from "../src/job-run.ts";
import { enqueue, get, loadJob, pause } from "../src/job.ts";
import { openKernel } from "../src/kernel.ts";
import { launchProject, planReceipt } from "../src/records/launch.ts";
import { compose } from "../src/records/write.ts";
import { must, scratch, steppingClock } from "./helpers.ts";
import { eventTypes, hostA, jobId, LIVE, openWorld, operator, producer, type World } from "./job-fixture.ts";

// THE DRIVER TELLS THE PRODUCER HOW ITS JOB ENDED (wave B item 2), and a part's job done
// releases what waited for it in the same transaction (item 6). Before the hook, extract's CLI
// and route settled its manifest after their drives and the worker did not; before the release,
// nothing called `releaseHeld` after a job finished, so every downstream part stayed `planned`.

const tmp = scratch("jobsettle");
afterAll(() => tmp.dispose());
let n = 0;
const worlds: World[] = [];
const world = (): World => {
  const w = openWorld(path.join(tmp.dir, `w-${++n}.sqlite`));
  worlds.push(w);
  return w;
};
afterEach(() => {
  for (const w of worlds.splice(0)) w.store.close();
});
const RUN = { holder: hostA, alive: () => true, sleep: async () => {} };

/** A producer whose `settle` records every ending it is told. */
function settling(base: Producer, fail?: string): { p: Producer; told: [string, Ending][] } {
  const told: [string, Ending][] = [];
  const p: Producer = {
    ...base,
    settle: async (job: Job, ending: Ending) => {
      told.push([job.state, ending]);
      if (fail !== undefined) throw new Error(fail);
    },
  };
  return { p, told };
}

describe("settle", () => {
  it("is told done once the job is done", async () => {
    const w = world();
    must(enqueue(w.store, { id: "d1", of: { kind: "run", id: "d1" }, producer: "p", lane: "gpu.local" }, operator));
    const { p, told } = settling(producer("gpu.local", ["a", "b"]).p);
    expect(must(await runJob(w.fx, p, "d1", RUN)).outcome).toBe("done");
    expect(told).toEqual([["done", "done"]]);
  });

  it("is told a ceiling stop the kernel made between steps, where no step of the producer ran to say so", async () => {
    const w = world();
    must(enqueue(w.store, { id: "c1", of: { kind: "run", id: "c1" }, producer: "p", lane: "gpu.local", ceilingUsd: 0.015, mode: LIVE }, operator));
    const { p, told } = settling(producer("gpu.local", ["a", "b"], undefined, 0.01).p);
    const r = must(await runJob(w.fx, p, "c1", RUN));
    expect(r.job?.stop?.by).toBe("run-ceiling");
    expect(told).toEqual([["failed", "failed"]]);
  });

  it("is told an operator's pause that landed mid-step, and never a yield", async () => {
    const w = world();
    must(enqueue(w.store, { id: "s1", of: { kind: "run", id: "s1" }, producer: "p", lane: "gpu.local" }, operator));
    const { p, told } = settling(
      producer("gpu.local", ["a", "b"], () => {
        must(pause(w.store, jobId("s1"), operator));
        return { kind: "produced", output: {} };
      }).p,
    );
    expect(must(await runJob(w.fx, p, "s1", RUN)).outcome).toBe("stopped");
    expect(told).toEqual([["paused", "stopped"]]);
    must(enqueue(w.store, { id: "y1", of: { kind: "run", id: "y1" }, producer: "p", lane: "box.render" }, operator));
    const y = settling(producer("box.render", ["a"]).p);
    expect(must(await runJob(w.fx, y.p, "y1", { ...RUN, deadlineMs: 0 })).outcome).toBe("yielded");
    expect(y.told).toEqual([]);
  });

  it("a settle that throws is reported on the drive and in the ledger, and the ending stands", async () => {
    const w = world();
    must(enqueue(w.store, { id: "t1", of: { kind: "run", id: "t1" }, producer: "p", lane: "gpu.local" }, operator));
    const { p } = settling(producer("gpu.local", ["a"]).p, "run.json is locked");
    const r = must(await runJob(w.fx, p, "t1", RUN));
    expect(r).toMatchObject({ outcome: "done", settle: { ok: false, message: "run.json is locked" } });
    expect(must(get(w.store, jobId("t1"))).job.state).toBe("done");
    expect(eventTypes(w.store, "t1").at(-1)).toBe("job.settle-failed");
  });

  it("a settle failure the ledger cannot take still leaves the drive's outcome standing, with both sentences", async () => {
    const w = world();
    must(enqueue(w.store, { id: "t2", of: { kind: "run", id: "t2" }, producer: "p", lane: "gpu.local" }, operator));
    const { p } = settling(producer("gpu.local", ["a"]).p, "run.json is locked");
    const fx: World["fx"] = { ...w.fx, tx: (name, fn) => (name === "settle-failed" ? { ok: false, error: new AppError("unavailable", "database is locked") } : w.fx.tx(name, fn)) };
    const r = must(await runJob(fx, p, "t2", RUN));
    expect(r).toMatchObject({ outcome: "done", job: { state: "done" } });
    expect(r.settle?.message).toContain("run.json is locked");
    expect(r.settle?.message).toContain("database is locked");
    expect(must(get(w.store, jobId("t2"))).job.state).toBe("done");
  });
});

describe("a part's job done releases what waited for it", () => {
  it("in the transaction that books it done: the next part is queued before the drive returns", async () => {
    const k = must(openKernel(path.join(tmp.dir, "plan.sqlite"), { clock: steppingClock("2026-10-16T08:00:00.000Z") }));
    const fx = liveEffects(k.store, blobStore(path.join(tmp.dir, "plan.blobs")));
    const now = Date.parse("2026-10-16T09:00:00Z");
    const c = compose(k.store, { recipe: "film/trailer" }, operator, { id: "p1" });
    expect(c.ok).toBe(true);
    const receipt = must(planReceipt(k.store, "p1", { mode: "dry" }, { now }));
    const l = launchProject(k.store, { id: "p1", baseRev: 1, token: receipt.token, mode: "dry" }, operator, { now, dryOnly: true });
    expect(l.ok).toBe(true);
    const job = (id: string) => must(k.store.read((r) => loadJob(r, id))).job;
    expect(job("job:part:p1/script").state).toBe("planned");
    const research = job("job:part:p1/research");
    const r = must(await runJob(fx, producer(research.lane, ["notes"]).p, research.id, RUN));
    expect(r.outcome).toBe("done");
    expect(job("job:part:p1/script").state).toBe("queued");
    // Frames waits for the script, not for research: it stays planned.
    expect(job("job:part:p1/frames").state).toBe("planned");
    expect(eventTypes(k.store, "job:part:p1/script")).toContain("job.released");
    k.close();
  });
});
