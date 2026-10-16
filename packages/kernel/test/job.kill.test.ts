import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import type { Producer } from "../src/job-core.ts";
import { ackLane, laneHold } from "../src/job-queue.ts";
import { recover, runJob } from "../src/job-run.ts";
import { enqueue, get, retry } from "../src/job.ts";
import { pidAlive } from "../src/lease.ts";
import { reconcileJobSpend } from "../src/spend/projection.ts";
import { must, scratch } from "./helpers.ts";
import { eventTypes, jobId, LIVE, openWorld, operator } from "./job-fixture.ts";

// THE KILL TEST (Phase 4 exit criterion). Not a crash prefix enumerated in one
// process: a real child process drives a job, blocks inside step `b`, and is
// killed hard - SIGKILL, which on Windows is TerminateProcess - with no
// `finally`, no release, no heartbeat stop. Then, in the parent, the way an
// operator meets it:
//   recover   names it interrupted (its holder is a dead pid on this host),
//             with the step that was in flight;
//   the lane  seat.text is paid, so it HOLDS: the retried job is not claimed
//             until the operator acknowledges having looked;
//   retry     re-queues it, and the second drive finishes WITHOUT performing
//             the step the child had already booked - only the one that was
//             in flight, which the interruption named, runs again.

const tmp = scratch("jobkill");
afterAll(() => tmp.dispose());
const child = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "job-kill-child.ts");

function startChild(args: string[]): { pid: number; blocked: Promise<string>; exited: Promise<number | null>; kill(): void } {
  const p = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", child, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let errText = "";
  const blocked = new Promise<string>((resolve, reject) => {
    p.stdout.on("data", (d: Buffer) => {
      out += d.toString();
      if (out.includes("blocked")) resolve(out);
    });
    p.stderr.on("data", (d: Buffer) => (errText += d.toString()));
    p.on("exit", () => reject(new Error(`child exited before blocking: ${out} ${errText}`)));
  });
  const exited = new Promise<number | null>((resolve) => p.on("exit", (code) => resolve(code)));
  if (p.pid === undefined) throw new Error("the child did not start");
  return { pid: p.pid, blocked, exited, kill: () => void p.kill("SIGKILL") };
}

const performs = (log: string): string[] => readFileSync(log, "utf8").split("\n").filter((l) => l.length > 0);

describe("a job whose process is killed mid-step", () => {
  it("is interrupted with its stage, holds its paid lane until acknowledged, and a retry finishes without re-performing a booked step", async () => {
    const db = path.join(tmp.dir, "kill.sqlite");
    const log = path.join(tmp.dir, "performs.log");
    writeFileSync(log, "");
    const w = openWorld(db);
    must(enqueue(w.store, { id: "k1", of: { kind: "run", id: "run-k1" }, producer: "kill", lane: "seat.text", mode: LIVE }, operator));
    must(enqueue(w.store, { id: "k2", of: { kind: "run", id: "run-k2" }, producer: "kill", lane: "seat.text", mode: LIVE }, operator));

    const c = startChild([db, "k1", "seat.text", log, "b"]);
    await c.blocked;
    expect(must(get(w.store, jobId("k1"))).job).toMatchObject({ state: "running", progress: { stage: "b", done: 1 } });
    c.kill();
    await c.exited;
    expect(pidAlive(c.pid)).toBe(false);

    // The sweep a restarted worker runs first.
    const swept = must(recover(w.fx));
    expect(swept.map((j) => j.id)).toEqual(["k1"]);
    const { job } = must(get(w.store, jobId("k1")));
    expect(job).toMatchObject({ state: "interrupted", interruption: { stage: "b", holder: { pid: c.pid } } });
    expect(must(w.store.read((r) => laneHold(r, "seat.text")))).toMatchObject({ jobId: "k1", stage: "b" });

    const counted: Producer = {
      lane: "seat.text",
      plan: (_j, outputs) => ["a", "b", "c"].filter((s) => !outputs.has(s)).map((name) => ({ name, estimate: { seconds: 1, usd: 0.01 } })),
      perform: async (step) => {
        appendFileSync(log, `parent ${step.name}\n`);
        return { kind: "produced", output: { by: "parent", step: step.name } };
      },
    };
    // The lane holds: neither the neighbour nor the retried job is claimed.
    expect(must(await runJob(w.fx, counted, "k2"))).toMatchObject({ outcome: "held" });
    must(retry(w.store, jobId("k1"), operator));
    expect(must(await runJob(w.fx, counted, "k1"))).toMatchObject({ outcome: "held" });

    must(ackLane(w.store, "seat.text", operator));
    expect(must(await runJob(w.fx, counted, "k1"))).toMatchObject({ outcome: "done", job: { attempt: 2, progress: { done: 3 } } });
    expect(performs(log)).toEqual(["child a", "child b", "parent b", "parent c"]);
    expect(eventTypes(w.store, "k1")).toEqual(expect.arrayContaining(["job.interrupted", "job.retried", "job.done"]));
    expect(must(w.store.read((r) => reconcileJobSpend(r, "k1"))).drift).toBeUndefined();
    expect(must(await runJob(w.fx, counted, "k2")).outcome).toBe("done");
    w.store.close();
  }, 30_000);
});
