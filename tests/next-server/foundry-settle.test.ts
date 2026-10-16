import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import { enqueue } from "@gt/kernel/job";

import { disposeAll, jobOf, kernelOf, operator, PYTHON, py, pyAsync, REPO, universe, type Universe } from "./producer-gpu-harness.ts";

// V1'S "GENERATING FOREVER" CLOSES (L41). A forge (or Dojo) job SIGKILLed mid-step left its v1
// artefact reading a live stage with no process behind it. The GPU worker's look now starts with
// `jobs.recover(producers)` (packages/kernel/py/job_settle.py): the dead holder's job is named
// interrupted and its producer's settle (forge_job.settle / dojo_job.settle) writes the ending onto
// run.json / cycle.json. Proved with a real process killed with SIGKILL, then a real worker.

afterAll(disposeAll);
const WORKER = path.join(REPO, "pipeline", "foundry", "worker.py");
const KERNEL_PY = path.join(REPO, "packages", "kernel", "py");

// Claims the job, dispatches a step (from this commit a crash names it), says so, and hangs.
const VICTIM = `
import sys, time
sys.path.insert(0, sys.argv[1])
from job import Jobs
from kernel_store import store_location
jobs = Jobs(store_location())
run = jobs.claim(sys.argv[2])
run.start(sys.argv[3])
print("started", flush=True)
time.sleep(600)
`;

async function killedMidStep(u: Universe, jobId: string, step: string): Promise<void> {
  const child = pyAsync(u, ["-c", VICTIM, KERNEL_PY, jobId, step]);
  let err = "";
  child.stderr?.on("data", (d: Buffer) => (err += d.toString()));
  await new Promise<void>((resolve, reject) => {
    child.stdout?.on("data", (d: Buffer) => d.toString().includes("started") && resolve());
    child.on("exit", (code) => reject(new Error(`the victim exited ${String(code)} before its step: ${err}`)));
  });
  const gone = new Promise((r) => child.on("exit", r));
  child.kill("SIGKILL");
  await gone;
}

const statusOf = (file: string) => parseJsonAt(file, z.object({ status: z.string(), ending: z.string().optional(), error: z.string().optional() }).loose(), readFileSync(file, "utf8"));

describe.skipIf(PYTHON === undefined)("a SIGKILLed GPU job's artefact is settled by the next worker look", () => {
  it("forge: run.json stops reading `generating` - the job is interrupted and the run failed with ending interrupted", async () => {
    const u = universe();
    const runDir = path.join(u.runs, "r1");
    mkdirSync(runDir, { recursive: true });
    const runJson = path.join(runDir, "run.json");
    writeFileSync(runJson, JSON.stringify({ id: "r1", status: "generating", progress: { stage: "generating", done: 1, total: 3 }, log: [], candidates: [], scenes: [] }));
    const k = kernelOf(u);
    const r = enqueue(k.store, { id: "job:run:forge:r1", of: { kind: "run", id: "forge:r1" }, producer: "forge", lane: "gpu.local" }, operator);
    k.close();
    if (!r.ok) throw r.error;

    await killedMidStep(u, "job:run:forge:r1", "generate:c1");
    expect(statusOf(runJson)).toMatchObject({ ok: true, value: { status: "generating" } });

    const w = py(u, [WORKER, "--once", "--json"]);
    expect(w.status, w.stderr).toBe(0);
    const after = kernelOf(u);
    try {
      expect(jobOf(after, "job:run:forge:r1")).toMatchObject({ state: "interrupted", interruption: { stage: "generate:c1" } });
    } finally {
      after.close();
    }
    const s = statusOf(runJson);
    expect(s.ok && s.value).toMatchObject({ status: "failed", ending: "interrupted" });
    expect(s.ok ? s.value.error : "").toContain("at generate:c1");
    // A second look tells nothing twice: the run is terminal and the ending already settled.
    expect(py(u, [WORKER, "--once", "--json"]).status).toBe(0);
    expect(statusOf(runJson)).toEqual(s);
  }, 120_000);

  it("dojo: cycle.json stops reading `generating`", async () => {
    const u = universe();
    const cdir = path.join(u.training, "c1");
    mkdirSync(cdir, { recursive: true });
    const cycleJson = path.join(cdir, "cycle.json");
    writeFileSync(cycleJson, JSON.stringify({ id: "c1", status: "generating", log: [] }));
    const k = kernelOf(u);
    const r = enqueue(k.store, { id: "job:run:dojo:c1", of: { kind: "run", id: "dojo:c1" }, producer: "dojo", lane: "gpu.local" }, operator);
    k.close();
    if (!r.ok) throw r.error;
    await killedMidStep(u, "job:run:dojo:c1", "render:p1--baseline");
    expect(py(u, [WORKER, "--once", "--json"]).status).toBe(0);
    expect(statusOf(cycleJson)).toMatchObject({ ok: true, value: { status: "failed", ending: "interrupted" } });
  }, 120_000);
});
