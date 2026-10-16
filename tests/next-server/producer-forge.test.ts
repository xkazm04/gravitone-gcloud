import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));

import { parseJsonAt } from "@gt/domain/door";
import { recover } from "@gt/kernel/job-run";
import { laneHold } from "@gt/kernel/job-queue";
import { retry } from "@gt/kernel/job";
import { assertReconciled } from "@gt/kernel/spend/projection";
import { forgeSteps } from "@gt/producers/forge/plan";

import { effectsFor } from "../../lib/producers/dojo.ts";
import { forgeReceipt, launchForge, readForgeRun } from "../../lib/producers/forge.ts";
import { disposeAll, docOf, jobOf, kernelOf, linesOf, nodeCli, operator, py, pyAsync, PYTHON, REPO, startsOf, universe, until, type Universe } from "./producer-gpu-harness.ts";

// THE FORGE AS A KERNEL JOB (L34). Its plan and receipt are Node's
// (packages/producers/src/forge/plan.ts, lib/producers/forge.ts); its perform is
// Python's (pipeline/foundry/forge_job.py under worker.py), on gpu.local#1 - the
// card's one slot, which IS the GPU lease. Every child runs dry under
// GRAVITONE_DRY_ONLY=1 in a temp universe: no ComfyUI, no Ollama.
//
// Where v1's guarantees went (pipeline/foundry/selftest.py keeps its own forge
// cases - ungradable, scoreless, unmeasured regrade, adopted provenance, gave-up
// is incomplete - against the same unit functions, which the job now calls):
//   resume: a PNG on disk is a finished generation   -> plan-cases.json, both languages
//   `unmeasured` is graded again                      -> plan-cases.json (attempt-scoped grade)
//   a run that gave up is not `done`                  -> "an abandoned plate fails the job ..."
//   v1 had no crash story (live status, no pid)       -> "a SIGKILL at a step boundary ..."
//   v1 forge took no GPU lease                        -> "one driver per job; the card has one tenant"

afterAll(disposeAll);
// Every case spawns Python (and the launcher spawns Node): seconds each, more under a loaded full suite.
vi.setConfig({ testTimeout: 120_000 });
const FORGE = path.join("pipeline", "foundry", "forge.py");
const WORKER = path.join("pipeline", "foundry", "worker.py");
const LAUNCH = path.join("pipeline", "foundry", "launch.mts");

function plan(u: Universe, styles = ["painted-3d", "cel-anime"]): string {
  const file = path.join(u.dir, "plan.json");
  writeFileSync(file, JSON.stringify({ id: "l34", scenes: [{ id: "s1", frame: "f1.jpg" }], styles, mechanisms: [{ id: "text", reference: false }, { id: "ref-early", reference: true, window: 0.35 }], seeds: [7] }));
  return file;
}

const runJsonSchema = z.object({
  status: z.string(),
  dry: z.boolean().optional(),
  job: z.string().optional(),
  error: z.string().optional(),
  candidates: z.array(z.object({ id: z.string(), status: z.string(), file: z.string(), grade: z.object({ grader: z.string(), dry: z.boolean().optional() }).nullable() })),
});
function runJson(u: Universe, runId: string) {
  const r = parseJsonAt("run.json", runJsonSchema, readFileSync(path.join(u.runs, runId, "run.json"), "utf8"));
  if (!r.ok) throw r.error;
  return r.value;
}

describe.skipIf(PYTHON === undefined)("the forge plan is one function in two languages", () => {
  const caseSchema = z.object({ name: z.string(), view: z.object({ scenes: z.array(z.object({ id: z.string(), annotated: z.boolean() })), candidates: z.array(z.object({ id: z.string(), scene: z.string(), status: z.enum(["pending", "generated", "graded", "unmeasured", "failed"]), plate: z.boolean() })) }), booked: z.array(z.string()), attempt: z.number(), skipGrade: z.boolean().optional(), abandoned: z.boolean().optional(), expect: z.array(z.string()) });
  const file = path.join(REPO, "packages", "producers", "src", "forge", "plan-cases.json");
  const cases = parseJsonAt("plan-cases.json", z.object({ cases: z.array(caseSchema) }), readFileSync(file, "utf8"));
  if (!cases.ok) throw cases.error;

  it("Node's forgeSteps gives every case's answer", () => {
    for (const c of cases.value.cases) expect(forgeSteps(c.view, new Set(c.booked), c.attempt, { ...(c.skipGrade === undefined ? {} : { skipGrade: c.skipGrade }), ...(c.abandoned === undefined ? {} : { abandoned: c.abandoned }) }), c.name).toEqual(c.expect);
  });

  it("Python's forge_job.plan gives the same answers", () => {
    const script = [
      "import json, sys",
      "sys.path.insert(0, 'pipeline/foundry')",
      "import forge_job",
      `cases = json.load(open(${JSON.stringify(file)}, encoding='utf-8'))['cases']`,
      "print(json.dumps([forge_job.plan(c['view'], set(c['booked']), c['attempt'], c.get('skipGrade', False), c.get('abandoned', False)) for c in cases]))",
    ].join("\n");
    const r = py(universe(), ["-c", script]);
    expect(r.status, r.stderr).toBe(0);
    const got = parseJsonAt("python plans", z.array(z.array(z.string())), r.stdout.trim());
    if (!got.ok) throw got.error;
    expect(got.value).toEqual(cases.value.cases.map((c) => c.expect));
  });
});

describe.skipIf(PYTHON === undefined)("a dry forge job end to end", () => {
  it("forge.py --dry --json prepares the run, enqueues it through the launcher's receipt and drives it to done on the card's slot, $0 and reconciled", () => {
    const u = universe();
    const r = py(u, [FORGE, plan(u), "--run-id", "r1", "--dry", "--json"]);
    expect(r.status, r.stderr).toBe(0);
    const doc = docOf(r);
    expect(doc).toMatchObject({ ok: true, runId: "r1", jobId: "job:run:forge:r1", state: "done", status: "done", graded: 4, left: 0 });
    const k = kernelOf(u);
    const job = jobOf(k, "job:run:forge:r1");
    expect(job).toMatchObject({ producer: "forge", lane: "gpu.local", state: "done", mode: { kind: "dry" }, of: { kind: "run", id: "forge:r1" } });
    expect(job.spend.usd).toBe(0);
    const rec = k.store.read((t) => assertReconciled(t, job.id));
    expect(rec.ok).toBe(true);
    // The launch wrote its Run row (L32 RunInput): what the job is FOR, readable by Runs and re-route.
    const row = k.store.read((t) => t.get("SELECT job_id, json_extract(record, '$.producer') AS producer, json_extract(record, '$.recipe') AS recipe, json_extract(record, '$.input.producer') AS by, json_extract(record, '$.input.plan') AS plan FROM runs WHERE id = ?", "forge:r1"));
    expect(row.ok && row.value).toMatchObject({ job_id: "job:run:forge:r1", producer: "forge", recipe: "style/forge-sweep", by: "forge", plan: "l34" });
    // One annotation, four plates, four grades - each started exactly once.
    expect(startsOf(k, job.id).sort()).toEqual([...["annotate:s1"], ...["cel-anime--ref-early--s7", "cel-anime--text--s7", "painted-3d--ref-early--s7", "painted-3d--text--s7"].flatMap((c) => [`generate:s1/${c}`, `grade:s1/${c}:a1`])].sort());
    k.close();
    const m = runJson(u, "r1");
    expect(m).toMatchObject({ status: "done", dry: true, job: "job:run:forge:r1" });
    for (const c of m.candidates) {
      expect(c.status).toBe("graded");
      expect(c.grade).toMatchObject({ grader: "dry/stand-in", dry: true });
      expect(statSync(path.join(u.runs, "r1", c.file)).size).toBeGreaterThan(0);
      const side = parseJsonAt("sidecar", z.object({ dry: z.literal(true), workflow: z.record(z.string(), z.unknown()) }), readFileSync(path.join(u.runs, "r1", c.file.replace(/\.png$/, ".json")), "utf8"));
      expect(side.ok, "a dry plate keeps the workflow it would have sent").toBe(true);
    }
  });

  it("the receipt is computed from the plan before anything runs: plates, reads, $0 on gpu.local", () => {
    const u = universe();
    expect(py(u, [FORGE, plan(u), "--run-id", "r2", "--prepare", "--json"]).status).toBe(0);
    const run = readForgeRun("r2", u.runs);
    if (!run.ok) throw run.error;
    const k = kernelOf(u);
    const rec = forgeReceipt(k.store, run.value, { mode: "dry", now: Date.parse("2026-10-16T12:00:00Z") });
    if (!rec.ok) throw rec.error;
    expect(rec.value.lines).toHaveLength(1);
    expect(rec.value.lines[0]).toMatchObject({ lane: "gpu.local", units: 4, usd: 0 });
    // 1 annotation + 4 grades at 24 s, 4 plates at 96 s.
    expect(rec.value.totals.seconds).toBe(4 * 96 + 5 * 24);
    expect(rec.value.overCeiling).toBe(false);
    k.close();
  });

  it("refusals keep v1's words and gain exit codes: an unknown style is 1, a bad flag 2, live under GRAVITONE_DRY_ONLY is 1", () => {
    const u = universe();
    const unknown = py(u, [FORGE, plan(u, ["no-such-style"]), "--run-id", "bad", "--json"]);
    expect(unknown.status).toBe(1);
    expect(String(docOf(unknown)["error"])).toContain("unknown style ids");
    expect(py(u, [FORGE, plan(u), "--no-such-flag"]).status).toBe(2);
    const live = py(u, [FORGE, plan(u), "--run-id", "live1", "--json"]);
    expect(live.status).toBe(1);
    expect(String(docOf(live)["error"])).toMatch(/dry/);
  });
});

describe.skipIf(PYTHON === undefined)("the CLI, the launcher and the worker act on one job", () => {
  it("forge.py --detach enqueues; the Node launcher and launchForge find that job, never a second; worker.py --once drives it", () => {
    const u = universe();
    const d = py(u, [FORGE, plan(u), "--run-id", "r3", "--dry", "--detach", "--json"]);
    expect(d.status, d.stderr).toBe(0);
    expect(docOf(d)).toMatchObject({ ok: true, jobId: "job:run:forge:r3", detached: true });
    const viaNode = nodeCli(u, [LAUNCH, "forge", "--run-id", "r3", "--dry", "--detach", "--json"]);
    expect(viaNode.status, viaNode.stderr).toBe(0);
    expect(docOf(viaNode)).toMatchObject({ kind: "existing", jobId: "job:run:forge:r3", state: "queued" });
    const k = kernelOf(u);
    const again = launchForge(k.store, "r3", { mode: "dry", actor: operator, dryOnly: true, root: u.runs });
    expect(again.ok && again.value).toMatchObject({ kind: "existing", jobId: "job:run:forge:r3" });
    k.close();
    const w = py(u, [WORKER, "--once", "--json"]);
    expect(w.status, w.stderr).toBe(0);
    expect(linesOf(w)).toEqual([{ jobId: "job:run:forge:r3", lane: "gpu.local", producer: "forge", outcome: "done", state: "done" }]);
    expect(runJson(u, "r3").status).toBe("done");
  });
});

describe.skipIf(PYTHON === undefined)("a SIGKILL at a step boundary", () => {
  const SLOW = { FOUNDRY_DRY_STEP_MS: "350" };
  for (const after of [1, 3, 6]) {
    it(`after ${after} booked step(s): the job is interrupted naming its step, gpu.local holds nothing, and a retry finishes without re-performing a booked step`, async () => {
      const u = universe();
      expect(py(u, [FORGE, plan(u), "--run-id", "k", "--dry", "--detach", "--json"]).status).toBe(0);
      const id = "job:run:forge:k";
      const k = kernelOf(u);
      const child = pyAsync(u, [WORKER, "--once", "--json"], SLOW);
      const booked = (): number => {
        const r = k.store.read((t) => Number(t.get("SELECT count(*) AS c FROM job_outputs WHERE job_id = ?", id)?.["c"] ?? 0));
        return r.ok ? r.value : 0;
      };
      await until(() => booked() >= after && jobOf(k, id).progress.stage !== undefined, `${after} booked step(s) and one in flight`);
      child.kill("SIGKILL");
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
      const firstBooked = k.store.read((t) => t.all("SELECT step FROM job_outputs WHERE job_id = ?", id).map((r) => String(r["step"])));
      if (!firstBooked.ok) throw firstBooked.error;
      const plates = new Map(firstBooked.value.filter((s) => s.startsWith("generate:")).map((s) => {
        const file = path.join(u.runs, "k", "scenes", "s1", "candidates", `${s.slice("generate:s1/".length)}.png`);
        return [file, statSync(file).mtimeMs] as const;
      }));

      // The next look (the Node worker's recovery sweep) names it: the pid is dead, the fence is gone.
      const swept = recover(effectsFor(k.store, u.store));
      if (!swept.ok) throw swept.error;
      const dead = jobOf(k, id);
      expect(dead.state).toBe("interrupted");
      expect(dead.interruption?.stage, "the step in flight is named").toMatch(/^(annotate|generate|grade):/);
      const holdNow = k.store.read((t) => laneHold(t, "gpu.local"));
      expect(holdNow.ok && holdNow.value, "gpu.local is a free lane: an interruption holds nothing").toBeUndefined();

      if (after === 3) {
        // The operator's own door: `forge.py --resume` retries the interrupted job and drives it, one command.
        const resumed = py(u, [FORGE, plan(u), "--run-id", "k", "--dry", "--resume", "--json"]);
        expect(resumed.status, resumed.stderr).toBe(0);
        expect(docOf(resumed)).toMatchObject({ jobId: id, state: "done" });
      } else {
        expect(retry(k.store, dead.id, operator).ok).toBe(true);
        const w = py(u, [WORKER, "--once", "--json"]);
        expect(w.status, w.stderr).toBe(0);
      }
      const done = jobOf(k, id);
      expect(done).toMatchObject({ state: "done", attempt: 2 });
      const starts = startsOf(k, id);
      for (const s of firstBooked.value) expect(starts.filter((x) => x === s), `${s} was booked before the kill and never performed again`).toHaveLength(1);
      for (const [file, mtime] of plates) expect(statSync(file).mtimeMs, `${path.basename(file)} was not drawn again`).toBe(mtime);
      expect(runJson(u, "k").status).toBe("done");
      k.close();
    }, 60_000);
  }
});

describe.skipIf(PYTHON === undefined)("a stop signal parks at a step boundary", () => {
  it("the step in flight finishes and is booked, then the job goes back to the queue with its slot given back; the next drive takes the rest", () => {
    const u = universe();
    expect(py(u, [FORGE, plan(u), "--run-id", "p", "--dry", "--detach", "--json"]).status).toBe(0);
    // worker.py's StopFlag, set the way SIGINT sets it - from inside the step, so the step is in flight when it lands.
    const script = [
      "import sys, json",
      "sys.path.insert(0, 'pipeline/foundry')",
      "import forge_job, worker",
      "stop = worker.StopFlag()",
      "real = forge_job.ForgeSession.perform",
      "def perform(self, step):",
      "    out = real(self, step)",
      "    if step.startswith('generate:'):",
      "        stop.event.set()",
      "    return out",
      "forge_job.ForgeSession.perform = perform",
      "print(json.dumps(worker.drive_job('job:run:forge:p', say=lambda m: None, stop=stop)))",
    ].join("\n");
    const r = py(u, ["-c", script]);
    expect(r.status, r.stderr).toBe(0);
    expect(docOf(r)).toMatchObject({ outcome: "yielded", state: "queued" });
    const k = kernelOf(u);
    const job = jobOf(k, "job:run:forge:p");
    expect(job.slot, "the slot was given back").toBeUndefined();
    expect(startsOf(k, job.id)).toEqual(["annotate:s1", "generate:s1/painted-3d--text--s7"]);
    const outs = k.store.read((t) => t.all("SELECT step FROM job_outputs WHERE job_id = ?", job.id).map((x) => String(x["step"])));
    expect(outs.ok && outs.value.sort(), "the step in flight was booked, not abandoned").toEqual(["annotate:s1", "generate:s1/painted-3d--text--s7"]);
    expect(linesOf(py(u, [WORKER, "--once", "--json"]))).toMatchObject([{ jobId: job.id, state: "done" }]);
    expect(startsOf(k, job.id).filter((s) => s === "generate:s1/painted-3d--text--s7")).toHaveLength(1);
    k.close();
  });
});

describe.skipIf(PYTHON === undefined)("one driver per job; the card has one tenant", () => {
  it("while a forge job holds gpu.local#1: a second drive of it is not-queued, a second job waits, and a v1 GPU tenant is refused naming the forge", async () => {
    const u = universe();
    expect(py(u, [FORGE, plan(u), "--run-id", "a", "--dry", "--detach", "--json"]).status).toBe(0);
    expect(py(u, [FORGE, plan(u), "--run-id", "b", "--dry", "--detach", "--json"]).status).toBe(0);
    const k = kernelOf(u);
    // Slow enough that a is still on the card through every look below, even under a loaded suite.
    const child = pyAsync(u, [WORKER, "--once", "--json"], { FOUNDRY_DRY_STEP_MS: "1500" });
    let out = "";
    child.stdout?.on("data", (b: Buffer) => (out += b.toString("utf8")));
    await until(() => jobOf(k, "job:run:forge:a").state === "running", "the first job running");

    const second = py(u, [WORKER, "--job", "job:run:forge:a", "--json"]);
    expect(second.status).toBe(1);
    expect(linesOf(second)[0]).toMatchObject({ jobId: "job:run:forge:a", outcome: "not-queued", state: "running" });

    const busy = py(u, [WORKER, "--once", "--json"]);
    expect(busy.status).toBe(0);
    expect(linesOf(busy), "the slot is held: nothing is claimed").toEqual([]);
    expect(jobOf(k, "job:run:forge:b").state).toBe("queued");

    const tenant = py(u, ["-c", ["import sys", "sys.path.insert(0, 'pipeline/gpu')", "import lease", "try:", "    lease.acquire('v1-tenant', 'comfy', 8, wait=0)", "    print('GRANTED')", "except lease.LeaseTimeout as e:", "    print(str(e))"].join("\n")]);
    expect(tenant.stdout).toContain("forge job job:run:forge:a");

    // The first worker drains its lane (--once): b, the next head, is its too once a is done.
    await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    expect(linesOf({ status: 0, stdout: out, stderr: "" }).map((l) => [l["jobId"], l["state"]])).toEqual([
      ["job:run:forge:a", "done"],
      ["job:run:forge:b", "done"],
    ]);
    k.close();
  }, 120_000);
});

describe.skipIf(PYTHON === undefined)("vendor failures, the breaker and an abandoned pass", () => {
  // The unit seam forge_job calls, patched in the worker's own process: the job,
  // the store and run.json are real; only ComfyUI's answer is made up.
  const failing = (ids: string): string =>
    [
      "import sys",
      "sys.path.insert(0, 'pipeline/foundry')",
      "import forge, worker",
      "orig = forge.generate_candidate",
      `bad = ${ids}`,
      "def gen(m, rd, c, staged, dry=False):",
      "    if bad is None or c['id'] in bad:",
      "        raise RuntimeError('ComfyUI refused the prompt')",
      "    return orig(m, rd, c, staged, dry=dry)",
      "forge.generate_candidate = gen",
      "sys.exit(worker.main(['--once', '--json']))",
    ].join("\n");

  it("a plate that fails is skipped for the drive (v1 moved on); the run is incomplete and the job fails naming it; a retry draws only that plate", () => {
    const u = universe();
    expect(py(u, [FORGE, plan(u), "--run-id", "v", "--dry", "--detach", "--json"]).status).toBe(0);
    const r = py(u, ["-c", failing("{'s1/cel-anime--text--s7'}")]);
    expect(r.status).toBe(1);
    expect(linesOf(r)[0]).toMatchObject({ state: "failed" });
    expect(String(linesOf(r)[0]?.["error"])).toContain("incomplete: 1 of 4");
    expect(runJson(u, "v").status).toBe("incomplete");
    const k = kernelOf(u);
    const id = "job:run:forge:v";
    const before = startsOf(k, id);
    expect(retry(k.store, jobOf(k, id).id, operator).ok).toBe(true);
    expect(py(u, [WORKER, "--once", "--json"]).status).toBe(0);
    const after = startsOf(k, id).slice(before.length);
    expect(after).toEqual(["generate:s1/cel-anime--text--s7", "grade:s1/cel-anime--text--s7:a2"]);
    expect(runJson(u, "v").status).toBe("done");
    k.close();
  });

  it("three failures in a row trip the breaker: the job fails `unavailable` and run.json says failed", () => {
    const u = universe();
    expect(py(u, [FORGE, plan(u), "--run-id", "x", "--dry", "--detach", "--json"]).status).toBe(0);
    const r = py(u, ["-c", failing("None")]);
    expect(r.status).toBe(1);
    const k = kernelOf(u);
    const job = jobOf(k, "job:run:forge:x");
    expect(job).toMatchObject({ state: "failed", error: { code: "unavailable" } });
    expect(job.error?.message).toContain("3 consecutive vendor failures");
    expect(startsOf(k, job.id).filter((s) => s.startsWith("generate:"))).toHaveLength(3);
    k.close();
    expect(runJson(u, "x")).toMatchObject({ status: "failed" });
  });
});

describe.skipIf(PYTHON === undefined)("v1's readers read what the job made", () => {
  it("lib/foundry/store lists and reads the run the job finished", async () => {
    const u = universe();
    expect(py(u, [FORGE, plan(u), "--run-id", "seen", "--dry", "--json"]).status).toBe(0);
    // lib/foundry/store.ts roots its runs at <cwd>/<universe>/runs when it loads.
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(u.dir);
    vi.resetModules();
    const store = await import("../../lib/foundry/store.ts");
    cwd.mockRestore();
    const detail = await store.getRun("seen");
    expect(detail.run.status).toBe("done");
    expect(detail.run.candidates.filter((c) => c.status === "graded")).toHaveLength(4);
    const list = await store.listRuns();
    expect(list.map((r) => r.id)).toContain("seen");
  });
});
