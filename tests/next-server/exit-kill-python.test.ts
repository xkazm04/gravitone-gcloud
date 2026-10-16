import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { parseJsonAt } from "@gt/domain/door";
import { laneHold } from "@gt/kernel/job-queue";
import { retry } from "@gt/kernel/job";
import { reconcileJobSpend } from "@gt/kernel/spend/projection";

import { disposeAll, jid, jobOf, kernelOf, linesOf, operator, py, pyAsync, PYTHON, startsOf, universe, until, type Universe } from "./producer-gpu-harness.ts";

// PHASE 4 EXIT - CRASH RECOVERY PASSES A KILL TEST, AT THE PROCESS LEVEL (Python half, L44).
//
// The GPU worker (`npm run worker:gpu` = pipeline/foundry/worker.py) drives two dry forge
// jobs on gpu.local#1 - the card's one slot - with every dry step slowed behind the
// stand-in seam (FOUNDRY_DRY_STEP_MS), and is SIGKILLed with a step in flight. Where
// producer-forge.test.ts sweeps with an in-test `recover()`, here the next look is the one
// an operator gets: THE REAL WORKER RESTARTED. worker.py recovers first on every look
// (packages/kernel/py/job_settle.py), so the restarted process:
//   - names the killed job interrupted with the step that was in flight, and copies that
//     ending onto run.json (no "generating forever");
//   - holds NOTHING: gpu.local is a free lane (owner ruling 2026-10-16), so the neighbour
//     forge job is claimed and driven to done by that same restarted process;
//   - never resumes the interrupted job on its own.
// Then the operator retries and the real worker finishes it at attempt 2 without starting
// a step booked before the kill again and without redrawing a plate (mtime), its spend
// equal to its meter.

afterAll(disposeAll);

const FORGE = path.join("pipeline", "foundry", "forge.py");
const WORKER = path.join("pipeline", "foundry", "worker.py");
const SLOW = { FOUNDRY_DRY_STEP_MS: "400" };

function plan(u: Universe): string {
  const file = path.join(u.dir, "plan.json");
  writeFileSync(file, JSON.stringify({ id: "l44", scenes: [{ id: "s1", frame: "f1.jpg" }], styles: ["painted-3d", "cel-anime"], mechanisms: [{ id: "text", reference: false }, { id: "ref-early", reference: true, window: 0.35 }], seeds: [7] }));
  return file;
}

const runJsonSchema = z.object({ status: z.string(), ending: z.string().optional(), error: z.string().optional() });
function runJson(u: Universe, runId: string) {
  const r = parseJsonAt("run.json", runJsonSchema, readFileSync(path.join(u.runs, runId, "run.json"), "utf8"));
  if (!r.ok) throw r.error;
  return r.value;
}

describe.skipIf(PYTHON === undefined)("the real GPU worker, SIGKILLed mid-step", () => {
  it("restarted, names the job interrupted at its step and holds nothing on gpu.local (the neighbour runs); the retry finishes without re-performing a booked step", { timeout: 240_000 }, async () => {
    const u = universe();
    const p = plan(u);
    for (const run of ["k", "n"]) {
      const d = py(u, [FORGE, p, "--run-id", run, "--dry", "--detach", "--json"]);
      expect(d.status, d.stderr).toBe(0);
    }
    const id = "job:run:forge:k";
    const neighbour = "job:run:forge:n";
    const k = kernelOf(u);
    try {
      const child = pyAsync(u, [WORKER, "--once", "--json"], SLOW);
      const bookedOf = (job: string): string[] => {
        const r = k.store.read((t) => t.all("SELECT step FROM job_outputs WHERE job_id = ?", job).map((row) => String(row["step"])));
        return r.ok ? r.value : [];
      };
      await until(() => bookedOf(id).length >= 3 && jobOf(k, id).state === "running" && jobOf(k, id).progress.stage !== undefined, "three booked steps and one in flight", 120_000);
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      child.kill("SIGKILL");
      await exited;
      const before = bookedOf(id);
      const dead = jobOf(k, id);
      expect(dead.state, "nobody has looked yet").toBe("running");
      const plates = new Map(
        before
          .filter((s) => s.startsWith("generate:"))
          .map((s) => {
            const file = path.join(u.runs, "k", "scenes", "s1", "candidates", `${s.slice("generate:s1/".length)}.png`);
            return [file, statSync(file).mtimeMs] as const;
          }),
      );
      expect(jobOf(k, neighbour).state, "the neighbour waited behind the card's one slot").toBe("queued");

      // RESTART: the real worker, whose every look recovers first.
      const r1 = py(u, [WORKER, "--once", "--json"]);
      expect(r1.status, r1.stderr).toBe(0);
      const swept = jobOf(k, id);
      expect(swept.state).toBe("interrupted");
      expect(swept.interruption?.stage, "the step in flight is named").toMatch(/^(annotate|generate|grade):/);
      expect(before).not.toContain(swept.interruption?.stage);
      expect(runJson(u, "k"), "run.json reads the ending, not a live stage").toMatchObject({ status: "failed", ending: "interrupted" });
      const hold = k.store.read((t) => laneHold(t, "gpu.local"));
      expect(hold.ok && hold.value, "gpu.local is free: an interruption holds nothing").toBeUndefined();
      // The free lane carried on: the restarted worker drove the neighbour, and only the neighbour.
      expect(linesOf(r1).map((l) => [l["jobId"], l["state"]])).toEqual([[neighbour, "done"]]);
      expect(jobOf(k, id).state, "never resumed on its own").toBe("interrupted");

      expect(retry(k.store, jid(id), operator).ok).toBe(true);
      const r2 = py(u, [WORKER, "--once", "--json"]);
      expect(r2.status, r2.stderr).toBe(0);
      expect(linesOf(r2).map((l) => [l["jobId"], l["state"]])).toEqual([[id, "done"]]);
      expect(jobOf(k, id)).toMatchObject({ state: "done", attempt: 2 });

      const starts = startsOf(k, id);
      for (const s of before) expect(starts.filter((x) => x === s), `${s} was booked before the kill`).toHaveLength(1);
      for (const [file, mtime] of plates) expect(statSync(file).mtimeMs, `${path.basename(file)} was not drawn again`).toBe(mtime);
      expect(runJson(u, "k").status).toBe("done");
      for (const j of [id, neighbour]) {
        const rec = k.store.read((t) => reconcileJobSpend(t, j));
        expect(rec.ok && rec.value.drift, `${j} spend equals its meter`).toBeUndefined();
      }
    } finally {
      k.close();
    }
  });
});
