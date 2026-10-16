import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import { laneSlots } from "@gt/domain/lane";
import type { Producer, StepOutcome } from "@gt/kernel/job-core";
import { enqueue, list, loadOutputs } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";
import { claimIn } from "@gt/kernel/lease";
import { producerSet } from "@gt/producers/set";

import { runWorker } from "../../workers/worker.ts";

// THE WORKER (workers/runner.mts over workers/worker.ts). The drain is proved in
// a CHILD PROCESS, the way cron and a skill run it: two dry jobs for a stub
// producer, `--once --json`, one line per job outcome, exit 0 - and a failed job
// makes it 1, a bad flag 2. The park-on-signal contract is proved in process,
// where the test can fire the stop while a step is in flight: the step finishes
// and is booked, and the job goes back to its line rather than being abandoned.

const ROOT = process.cwd();
const RUNNER = path.join(ROOT, "workers", "runner.mts");
const STUB = path.join(ROOT, "tests", "next-server", "fixtures", "worker-stub.mts");
const operator: Actor = { kind: "operator", id: "kazda" };
const dir = mkdtempSync(path.join(tmpdir(), "gt-worker-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
function freshStore(): { file: string; k: Kernel } {
  const file = path.join(dir, `store-${++n}.sqlite`);
  const k = openKernel(file);
  if (!k.ok) throw k.error;
  return { file, k: k.value };
}
function node(script: string, store: string, args: string[]) {
  return spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", script, ...args], {
    cwd: ROOT,
    env: { ...process.env, GRAVITONE_STORE_PATH: store, GRAVITONE_DRY_ONLY: "1" },
    encoding: "utf8",
    timeout: 60_000,
  });
}
const lineSchema = z.object({ jobId: z.string(), lane: z.string(), producer: z.string(), outcome: z.string(), state: z.string().optional(), error: z.string().optional() });
const linesOf = (stdout: string) =>
  stdout
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l, i) => {
      const p = parseJsonAt(`stdout line ${i + 1}`, lineSchema, l);
      if (!p.ok) throw p.error;
      return p.value;
    });
const research = (id: string) => ({ id, of: { kind: "run" as const, id: `run-${id}` }, producer: "research", lane: "seat.text" as const });

describe("the worker process", () => {
  it("--migrate brings a fresh store up to date and exits 0; a second run applies nothing", () => {
    const file = path.join(dir, "migrate.sqlite");
    const first = node(RUNNER, file, ["--migrate", "--json"]);
    expect(first.status, first.stderr).toBe(0);
    const doc = parseJsonAt("migrate", z.object({ ok: z.literal(true), applied: z.number() }), first.stdout.trim());
    expect(doc.ok && doc.value.applied).toBeGreaterThan(0);
    const again = parseJsonAt("migrate", z.object({ applied: z.number() }), node(RUNNER, file, ["--migrate", "--json"]).stdout.trim());
    expect(again.ok && again.value.applied).toBe(0);
  }, 60_000); // spawns the real runner, which loads every producer: slow under a full run

  it("--once drains two dry jobs for a stub producer: one JSON line per job, exit 0, both done with their outputs", () => {
    const { file, k } = freshStore();
    for (const id of ["job:run:w1", "job:run:w2"]) expect(enqueue(k.store, research(id), operator).ok).toBe(true);
    k.close();
    const r = node(STUB, file, ["--once", "--json", "--idle-ms", "50"]);
    expect(r.status, r.stderr).toBe(0);
    const lines = linesOf(r.stdout);
    expect(lines.map((l) => [l.jobId, l.outcome, l.state]).sort()).toEqual([
      ["job:run:w1", "done", "done"],
      ["job:run:w2", "done", "done"],
    ]);
    const after = openKernel(file);
    if (!after.ok) throw after.error;
    try {
      const jobs = list(after.value.store);
      expect(jobs.ok && jobs.value.map((j) => [j.id, j.state, j.mode.kind])).toEqual([
        ["job:run:w1", "done", "dry"],
        ["job:run:w2", "done", "dry"],
      ]);
      const outs = after.value.store.read((rd) => [...loadOutputs(rd, "job:run:w2").keys()]);
      expect(outs.ok && outs.value).toEqual(["outline", "draft"]);
    } finally {
      after.value.close();
    }
  });

  it("a failed job makes the drain exit 1 with the engine's sentence on its line; a head no producer here makes is named and left queued", () => {
    const { file, k } = freshStore();
    expect(enqueue(k.store, research("job:run:fail1"), operator).ok).toBe(true);
    expect(enqueue(k.store, { id: "job:run:s1", of: { kind: "run", id: "run-s1" }, producer: "suno", lane: "box.chrome" }, operator).ok).toBe(true);
    k.close();
    const r = node(STUB, file, ["--once", "--json", "--idle-ms", "50"]);
    expect(r.status).toBe(1);
    expect(linesOf(r.stdout).map((l) => [l.jobId, l.outcome, l.error])).toEqual([["job:run:fail1", "failed", "the stub refuses job:run:fail1"]]);
    expect(r.stderr).toContain("job:run:s1 heads box.chrome for producer suno, which this worker does not carry");
  });

  it("a head whose every slot another process holds does not keep a drain alive: --once reports it busy and exits, the job still queued", () => {
    const { file, k } = freshStore();
    expect(enqueue(k.store, research("job:run:b1"), operator).ok).toBe(true);
    // Another box's drives hold all four seat.text slots, inside their TTL: alive as far as anyone here can know.
    const other = { bootId: "boot-other", pid: 4242, host: "other-box" };
    for (const slot of laneSlots("seat.text")) {
      const c = k.store.tx((t) => claimIn(t, { resource: slot, holder: other, ticket: `t-${slot}`, ttlS: 3600, wait: false }, () => true).kind);
      expect(c.ok && c.value).toBe("granted");
    }
    k.close();
    const r = node(STUB, file, ["--once", "--json", "--idle-ms", "50"]);
    expect(r.status, r.stderr).toBe(0);
    const lines = linesOf(r.stdout);
    expect(lines.length).toBeGreaterThan(0);
    expect(new Set(lines.map((l) => `${l.jobId} ${l.outcome}`))).toEqual(new Set(["job:run:b1 busy"]));
    const after = openKernel(file);
    if (!after.ok) throw after.error;
    const jobs = list(after.value.store);
    after.value.close();
    expect(jobs.ok && jobs.value.map((j) => j.state)).toEqual(["queued"]);
  });

  it("the real runner with no producer bound drains nothing and exits 0; a bad flag is a usage error, exit 2", () => {
    const { file, k } = freshStore();
    k.close();
    const r = node(RUNNER, file, ["--once", "--json", "--idle-ms", "50"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout.trim()).toBe("");
    expect(node(RUNNER, file, ["--lanes", "gpu"]).status).toBe(2);
    expect(node(RUNNER, file, ["--frobnicate"]).status).toBe(2);
    // The real runner loads every bound producer (lib/producers/registry.ts) three times here: seconds under a loaded suite.
  }, 60_000);
});

describe("stopping parks, it does not abandon", () => {
  it("a stop while a step is in flight lets the step finish and be booked, and the job goes back to its line", async () => {
    const { file, k } = freshStore();
    expect(enqueue(k.store, research("job:run:p1"), operator).ok).toBe(true);
    let release: (o: StepOutcome) => void = () => {};
    let inFlight: () => void = () => {};
    const entered = new Promise<void>((r) => (inFlight = r));
    const producer: Producer = {
      lane: "seat.text",
      plan: (_j, outs) => ["outline", "draft"].filter((s) => !outs.has(s)).map((name) => ({ name, estimate: { seconds: 1, usd: 0 } })),
      perform: (step) =>
        step.name === "outline"
          ? new Promise<StepOutcome>((r) => {
              release = r;
              inFlight();
            })
          : Promise.resolve({ kind: "produced", output: { step: step.name } }),
    };
    let stop: (hard: boolean) => void = () => {};
    const out: string[] = [];
    const done = runWorker(["--json", "--idle-ms", "20"], producerSet([{ name: "research", producer }]), {
      out: (l) => void out.push(l),
      err: () => {},
      env: { GRAVITONE_STORE_PATH: file, GRAVITONE_DRY_ONLY: "1" },
      onSignal: (s) => {
        stop = s;
        return () => {};
      },
    });
    await entered;
    stop(false);
    release({ kind: "produced", output: { step: "outline" } });
    expect(await done).toBe(0);
    expect(linesOf(out.join("\n")).map((l) => ({ outcome: l.outcome, state: l.state }))).toEqual([{ outcome: "yielded", state: "queued" }]);
    const jobs = list(k.store);
    expect(jobs.ok && jobs.value.map((j) => [j.state, j.progress.stage])).toEqual([["queued", undefined]]);
    const outs = k.store.read((rd) => [...loadOutputs(rd, "job:run:p1").keys()]);
    expect(outs.ok && outs.value).toEqual(["outline"]);
    k.close();
  });
});
