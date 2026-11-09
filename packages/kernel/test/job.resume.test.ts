import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Holder } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import { producerKey } from "../src/job-queue-core.ts";
import { AUTO_RESUME_LANES, RESUMABLE_PRODUCERS, MAX_AUTO_RESUMES, resumeFreeWork } from "../src/job-resume.ts";
import { recover, runJob, type RunOptions } from "../src/job-run.ts";
import { workLoop } from "../src/job-worker.ts";
import { enqueue, get, retry } from "../src/job.ts";
import { must, scratch } from "./helpers.ts";
import { eventTypes, hostA, jobId, LIVE, openWorld, operator, producer, type World } from "./job-fixture.ts";

// THE MACHINE RESUMES FREE WORK (job-resume.ts): a dead holder's job on gpu.local or box.render goes
// back to the queue by itself, every booked step kept; seat.text and the paying lanes stay
// interrupted for an operator; a crash loop ends at the attempt limit.

const tmp = scratch("jobresume");
afterAll(() => tmp.dispose());
let n = 0;
const world = (): World => openWorld(path.join(tmp.dir, `r-${++n}.sqlite`));
const until = async (cond: () => boolean, ms = 10_000): Promise<void> => {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("condition not reached");
    await new Promise((r) => setTimeout(r, 5));
  }
};

const deadHolder = (pid: number): Holder => ({ bootId: `boot-dead-${pid}`, pid, host: hostA.host });
const lease: RunOptions = { alive: () => true, sleep: async () => {}, heartbeatMs: 3_600_000 };

function put(w: World, id: string, lane: ResourceLane, name = "cut"): void {
  must(enqueue(w.store, { id, of: { kind: "run", id: `run-${id}` }, producer: name, lane, mode: LIVE }, operator));
}

/** A drive that books step `a` and then dies inside `b`: the process is gone, the job stays running. */
async function dieInB(w: World, id: string, lane: ResourceLane, pid: number): Promise<void> {
  const { p } = producer(lane, ["a", "b"], (s) => (s.name === "b" ? new Promise(() => {}) : { kind: "produced", output: { made: s.name } }));
  // Only this drive counts as alive to itself: the earlier dead ones' slots are taken over, as a real restart does.
  void runJob(w.fx, p, id, { ...lease, holder: deadHolder(pid), alive: (q) => q === pid });
  await until(() => must(get(w.store, jobId(id))).job.progress.stage === "b");
}

const sweep = (w: World) => must(recover(w.fx, { holder: hostA, alive: (pid) => pid === hostA.pid }));
const stateOf = (w: World, id: string): string => must(get(w.store, jobId(id))).job.state;

describe("the machine resumes a free lane's interrupted job", () => {
  it.each(["gpu.local", "box.render"] as const)("%s: a dead holder's job is re-queued, resumes without redoing a booked step, and the ledger names the machine", async (lane) => {
    const w = world();
    put(w, "j", lane);
    await dieInB(w, "j", lane, 7001);
    const calls = new Map<string, number>();
    const { p } = producer(lane, ["a", "b"], (s) => {
      calls.set(s.name, (calls.get(s.name) ?? 0) + 1);
      return { kind: "produced", output: { made: s.name } };
    });
    const stop = new AbortController();
    const loop = workLoop(w.fx, new Map([[producerKey("cut", lane), p]]), { signal: stop.signal, holder: hostA, alive: (pid) => pid === hostA.pid, idleMs: 5, run: { sleep: async () => {} } });
    await until(() => stateOf(w, "j") === "done");
    stop.abort();
    const summary = must(await loop);
    expect(summary).toMatchObject({ recovered: 1, resumed: 1 });
    // `a` was booked before the death and is never performed again; `b` was in flight and is.
    expect([...calls]).toEqual([["b", 1]]);
    expect(must(get(w.store, jobId("j"))).job.attempt).toBe(2);
    expect(eventTypes(w.store, "j")).toEqual(expect.arrayContaining(["job.interrupted", "job.auto-resumed"]));
    const ev = must(w.store.read((r) => r.get("SELECT actor_kind, actor_id, data FROM events WHERE type = 'job.auto-resumed'")));
    expect(ev).toMatchObject({ actor_kind: "machine" });
    expect(String(ev?.["actor_id"])).toContain("auto-resume");
    expect(String(ev?.["data"])).toContain('"stage":"b"');
    expect(must(w.store.read((r) => r.get("SELECT count(*) AS c FROM events WHERE type = 'job.retried'")))?.["c"]).toBe(0);
    w.store.close();
  }, 20_000);

  it("seat.text and every paying lane stay interrupted: the machine does not take them up", async () => {
    const w = world();
    const lanes: readonly ResourceLane[] = ["seat.text", "box.chrome", "box.blender", "cloud.google", "cloud.leonardo"];
    lanes.forEach((lane, i) => put(w, `p${i}`, lane));
    for (const [i, lane] of lanes.entries()) await dieInB(w, `p${i}`, lane, 7100 + i);
    const swept = sweep(w);
    expect(swept).toHaveLength(lanes.length);
    expect(must(resumeFreeWork(w.fx, swept, hostA))).toEqual([]);
    for (let i = 0; i < lanes.length; i++) expect(stateOf(w, `p${i}`)).toBe("interrupted");
    expect(must(w.store.read((r) => r.get("SELECT count(*) AS c FROM events WHERE type = 'job.auto-resumed'")))?.["c"]).toBe(0);
    expect(AUTO_RESUME_LANES).toEqual(["gpu.local", "box.render"]);
    w.store.close();
  }, 20_000);

  it("a producer named unsafe to redo unattended stays interrupted on an allowed lane, and the storyboard does not", async () => {
    const w = world();
    put(w, "mv", "box.render", "mv");
    put(w, "forge", "gpu.local", "forge");
    put(w, "board", "gpu.local", "scout-storyboard");
    await dieInB(w, "mv", "box.render", 7501);
    await dieInB(w, "forge", "gpu.local", 7502);
    await dieInB(w, "board", "gpu.local", 7503);
    expect(must(resumeFreeWork(w.fx, sweep(w), hostA)).map((j) => j.id)).toEqual(["board"]);
    expect([stateOf(w, "mv"), stateOf(w, "forge"), stateOf(w, "board")]).toEqual(["interrupted", "interrupted", "queued"]);
    for (const name of ["mv", "frames", "still", "motion", "scout-scene", "scout-asset", "scout-sheet", "scout-ingest", "profile", "forge", "dojo"]) expect(RESUMABLE_PRODUCERS.has(name), name).toBe(false);
    expect([...RESUMABLE_PRODUCERS].sort()).toEqual(["cover", "cut", "media-facts", "mesh", "production-cut", "production-take", "scout-piece", "scout-storyboard", "yue2-post", "yue2-render", "yue2-score"]);
    w.store.close();
  }, 30_000);

  it("a producer nobody has audited is not re-queued on an allowed lane: unknown means interrupted", async () => {
    const w = world();
    put(w, "new", "gpu.local", "brand-new-producer");
    await dieInB(w, "new", "gpu.local", 7600);
    expect(must(resumeFreeWork(w.fx, sweep(w), hostA))).toEqual([]);
    expect(stateOf(w, "new")).toBe("interrupted");
    w.store.close();
  }, 30_000);

  it("a live holder's job is untouched: recovery names nothing, so nothing is resumed", async () => {
    const w = world();
    put(w, "live", "gpu.local");
    await dieInB(w, "live", "gpu.local", 7200);
    const alive = must(recover(w.fx, { holder: hostA, alive: () => true }));
    expect(alive).toEqual([]);
    expect(must(resumeFreeWork(w.fx, alive, hostA))).toEqual([]);
    expect(stateOf(w, "live")).toBe("running");
    w.store.close();
  }, 20_000);

  it("an operator's retry (or another worker) that got there first is left alone: resuming twice does nothing the second time", async () => {
    const w = world();
    put(w, "twice", "gpu.local");
    await dieInB(w, "twice", "gpu.local", 7300);
    const swept = sweep(w);
    expect(must(resumeFreeWork(w.fx, swept, hostA)).map((j) => j.id)).toEqual(["twice"]);
    expect(must(resumeFreeWork(w.fx, swept, hostA))).toEqual([]);
    expect(must(get(w.store, jobId("twice"))).job).toMatchObject({ state: "queued", attempt: 2 });
    w.store.close();
  }, 20_000);

  it(`a crash loop stops after ${MAX_AUTO_RESUMES} resumes and stays interrupted; an operator's retry grants a fresh allowance`, async () => {
    const w = world();
    put(w, "loop", "gpu.local");
    let pid = 7400;
    const dieAndSweep = async (): Promise<void> => {
      await dieInB(w, "loop", "gpu.local", ++pid);
      const swept = sweep(w);
      expect(swept.map((j) => j.id)).toEqual(["loop"]);
      must(resumeFreeWork(w.fx, swept, hostA));
    };
    for (let k = 1; k <= MAX_AUTO_RESUMES; k++) {
      await dieAndSweep();
      expect(must(get(w.store, jobId("loop"))).job).toMatchObject({ state: "queued", attempt: k + 1 });
    }
    await dieAndSweep();
    expect(must(get(w.store, jobId("loop"))).job).toMatchObject({ state: "interrupted", attempt: MAX_AUTO_RESUMES + 1 });
    expect(eventTypes(w.store, "loop").filter((t) => t === "job.auto-resumed")).toHaveLength(MAX_AUTO_RESUMES);
    must(retry(w.store, jobId("loop"), operator));
    await dieAndSweep();
    expect(stateOf(w, "loop")).toBe("queued");
    expect(eventTypes(w.store, "loop").filter((t) => t === "job.auto-resumed")).toHaveLength(MAX_AUTO_RESUMES + 1);
    w.store.close();
  }, 30_000);

  it("`retry` stays the operator's: a machine actor is refused it", () => {
    const w = world();
    put(w, "r", "gpu.local");
    const refused = retry(w.store, jobId("r"), { kind: "machine", id: "auto-resume:box/1" });
    expect(!refused.ok && refused.error.message).toContain("only an operator retries");
    w.store.close();
  });
});
