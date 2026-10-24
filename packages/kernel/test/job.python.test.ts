import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { holderSchema, type Holder } from "@gt/domain/job";
import { resourceLaneSchema } from "@gt/domain/lane";
import { blobStore } from "../src/blob.ts";
import { verify } from "../src/events.ts";
import { liveEffects, type Effects } from "../src/effects.ts";
import type { Producer, StepOutcome } from "../src/job-core.ts";
import { ackLane } from "../src/job-queue.ts";
import { recover, runJob, type RunReport } from "../src/job-run.ts";
import { enqueue, loadJob, loadOutputs, pause, release, retry } from "../src/job.ts";
import { openKernel } from "../src/kernel.ts";
import { launchProject, planReceipt } from "../src/records/launch.ts";
import { compose } from "../src/records/write.ts";
import { reconcileJobSpend } from "../src/spend/projection.ts";
import type { Store } from "../src/store.ts";
import { findPython, must, scratch } from "./helpers.ts";
import { eventTypes, jobId } from "./job-fixture.ts";

// spec/job.json is the job protocol across two languages as a table. A
// scenario's steps run in order on ONE store file: a `node` step through the
// Node kernel (runJob driving a producer whose every step waits for the table
// to say `perform`, the operator's acts, recover, the door's loadJob), a `py`
// step through packages/kernel/py/job.py, served by py/job_spec.py over a pipe.
// Both sides read one clock the table moves. What it holds, beyond each
// language's own tests: the two drivers claim the SAME slots, refuse the same
// holds and states, fence each other's late writes, and write records and
// events the other side's door and chain verifier accept.

const here = path.dirname(fileURLToPath(import.meta.url));
const specFile = path.join(here, "..", "spec", "job.json");
const pyServer = path.join(here, "..", "py", "job_spec.py");

const stepSchema = z.object({
  t: z.number().nonnegative(),
  by: z.enum(["node", "py"]),
  op: z.string().min(1),
  as: z.string().optional(),
  job: z.string().optional(),
  step: z.string().optional(),
  steps: z.array(z.string()).optional(),
  lane: resourceLaneSchema.optional(),
  code: z.string().optional(),
  message: z.string().optional(),
  dryOnly: z.boolean().optional(),
  producers: z.array(z.string()).optional(),
  expect: z.unknown(),
});
const jobSpec = z.object({ lane: resourceLaneSchema, producer: z.string(), state: z.literal("planned").optional(), mode: z.literal("live").optional() });
const specSchema = z.object({
  base: z.iso.datetime(),
  ttlS: z.number().int().positive(),
  actors: z.record(z.string(), holderSchema),
  scenarios: z
    .array(
      z.object({
        name: z.string(),
        // A plan Node composes and launches dry before the steps: its part jobs are `job:part:<id>/<key>`.
        project: z.object({ id: z.string(), recipe: z.string() }).optional(),
        jobs: z.record(z.string(), jobSpec),
        steps: z.array(stepSchema).min(1),
      }),
    )
    .min(1),
});
type Step = z.output<typeof stepSchema>;

const spec = must(parseJsonAt("spec/job.json", specSchema, readFileSync(specFile, "utf8")));
const operator: Actor = { kind: "operator", id: "spec" };

const python = findPython();
if (python === undefined) console.warn("[job.python] SKIPPED: no Python 3 on PATH; the cross-language job protocol did not run");

const tmp = scratch("job-python");
afterAll(() => tmp.dispose());
const template = path.join(tmp.dir, "template.sqlite");
{
  const k = must(openKernel(template, { snapshotDir: tmp.dir }));
  k.close();
}

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void };
function deferred<T>(): Deferred<T> {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** A Node drive the table steers: every perform waits for a `perform` step. */
type Drive = { gate: ((o: StepOutcome) => void) | undefined; blocked: Deferred<string>; done: Promise<Result<RunReport>> };

async function settle(d: Drive): Promise<unknown> {
  const r = await Promise.race([d.blocked.promise.then((step) => ({ blocked: step })), d.done.then((report) => ({ report }))]);
  if ("blocked" in r) return { blocked: r.blocked };
  return r.report.ok ? { outcome: r.report.value.outcome } : { error: r.report.error.code };
}

/** The py side: one server process per scenario, one reply line per op. */
function pyServerFor(db: string): { send(op: Record<string, unknown>): Promise<unknown>; close(): Promise<void> } {
  const p: ChildProcessWithoutNullStreams = spawn(python ?? "python", ["-I", pyServer, specFile, db], { stdio: ["pipe", "pipe", "pipe"] });
  let errText = "";
  p.stderr.on("data", (d: Buffer) => (errText += d.toString()));
  const lines = createInterface({ input: p.stdout });
  const queue: Deferred<string>[] = [];
  lines.on("line", (l) => queue.shift()?.resolve(l));
  const reply = z.union([z.object({ got: z.unknown() }), z.object({ error: z.string() })]);
  return {
    async send(op) {
      const d = deferred<string>();
      queue.push(d);
      p.stdin.write(`${JSON.stringify(op)}\n`);
      const r = must(parseJsonAt("job_spec.py reply", reply, await d.promise));
      if ("error" in r) throw new Error(`python: ${r.error}\n${errText}`);
      return r.got;
    },
    close: () =>
      new Promise((resolve) => {
        p.on("close", () => resolve());
        p.stdin.end();
      }),
  };
}

function stateOf(store: Store, id: string): Record<string, unknown> {
  return must(
    store.read((r) => {
      const { job } = loadJob(r, id);
      const rec = reconcileJobSpend(r, id);
      if (rec.drift !== undefined) throw new Error(`job ${id}: spend drifted from the meter by ${JSON.stringify(rec.drift)}`);
      return {
        state: job.state,
        attempt: job.attempt,
        outputs: [...loadOutputs(r, id).keys()],
        ...(job.slot === undefined ? {} : { slot: job.slot }),
        ...(job.progress.stage === undefined ? {} : { stage: job.progress.stage }),
        ...(job.error === undefined ? {} : { error: job.error.code }),
      };
    }),
  );
}

describe.skipIf(python === undefined)("spec/job.json: Node and Python drive jobs on one store", () => {
  for (const [i, sc] of spec.scenarios.entries()) {
    it(sc.name, async () => {
      const db = path.join(tmp.dir, `job-${i}.sqlite`);
      copyFileSync(template, db);
      const clock = { ms: Date.parse(spec.base) };
      const k = must(openKernel(db, { clock: () => new Date(clock.ms), snapshotDir: tmp.dir }));
      const store = k.store;
      const fx: Effects = liveEffects(store, blobStore(path.join(tmp.dir, `blobs-${i}`)));
      const killed = new Set<number>();
      const alive = (pid: number): boolean => !killed.has(pid);
      const py = pyServerFor(db);
      const drives = new Map<string, Drive>();
      const actor = (name: string | undefined): Holder => {
        const a = name === undefined ? undefined : spec.actors[name];
        if (a === undefined) throw new Error(`spec names an unknown actor ${String(name)}`);
        return a;
      };
      const id = (s: Step): string => {
        if (s.job === undefined) throw new Error(`step ${s.op} names no job`);
        return s.job;
      };

      const node = async (s: Step): Promise<unknown> => {
        switch (s.op) {
          case "drive": {
            const j = id(s);
            const lane = spec.scenarios[i]?.jobs[j]?.lane ?? must(store.read((r) => loadJob(r, j).job.lane));
            if (lane === undefined) throw new Error(`job ${j} is not in the scenario`);
            const d: Drive = { gate: undefined, blocked: deferred<string>(), done: Promise.resolve({ ok: true, value: { outcome: "stopped" } }) };
            const steps = s.steps ?? [];
            const producer: Producer = {
              lane,
              plan: (_job, outputs) => steps.filter((x) => !outputs.has(x)).map((name) => ({ name, estimate: { seconds: 1, usd: 0 } })),
              perform: (step) =>
                new Promise<StepOutcome>((resolve) => {
                  d.gate = resolve;
                  d.blocked.resolve(step.name);
                }),
            };
            d.done = runJob(fx, producer, j, { holder: actor(s.as), alive, ttlS: spec.ttlS, heartbeatMs: 2_000_000_000, now: () => clock.ms, sleep: async () => {}, dryOnly: s.dryOnly === true });
            drives.set(j, d);
            return settle(d);
          }
          case "perform": {
            const d = drives.get(id(s));
            if (d?.gate === undefined) throw new Error(`no drive of ${id(s)} is waiting at a step`);
            const gate = d.gate;
            d.gate = undefined;
            d.blocked = deferred<string>();
            gate({ kind: "produced", output: { made: "by node" } });
            return settle(d);
          }
          case "state":
            return stateOf(store, id(s));
          case "events":
            return eventTypes(store, id(s));
          case "release":
            return must(release(store, jobId(id(s)), operator)).state;
          case "pause":
            return must(pause(store, jobId(id(s)), operator)).state;
          case "retry":
            return must(retry(store, jobId(id(s)), operator)).state;
          case "ack":
            if (s.lane === undefined) throw new Error("ack names no lane");
            return must(ackLane(store, s.lane, operator)).length;
          case "recover":
            return must(recover(fx, { holder: actor(s.as), alive })).map((j) => j.id);
          case "kill":
            killed.add(actor(s.as).pid);
            await py.send({ op: "kill", as: s.as, at: new Date(clock.ms).toISOString() });
            return "ok";
          case "verify": {
            const v = must(verify(store));
            const pv = await py.send({ op: "verify", at: new Date(clock.ms).toISOString() });
            return v.state === "intact" && pv === "intact" ? "intact" : { node: v, python: pv };
          }
          default:
            throw new Error(`unknown node op ${s.op}`);
        }
      };

      try {
        if (sc.project !== undefined) {
          const { id: pid, recipe } = sc.project;
          must(compose(store, { recipe }, operator, { id: pid }));
          const now = Date.parse(spec.base);
          const receipt = must(planReceipt(store, pid, { mode: "dry" }, { now }));
          must(launchProject(store, { id: pid, baseRev: 1, token: receipt.token, mode: "dry" }, operator, { now, dryOnly: true }));
        }
        for (const [n, j] of Object.entries(sc.jobs)) {
          if (j === undefined) continue;
          must(enqueue(store, { id: n, of: { kind: "run", id: `run-${n}` }, producer: j.producer, lane: j.lane, ...(j.state === undefined ? {} : { state: j.state }), ...(j.mode === undefined ? {} : { mode: { kind: "live", arm: { by: operator, at: spec.base, reason: "spec: a live job" } } }) }, operator));
        }
        for (const [n, s] of sc.steps.entries()) {
          clock.ms = Date.parse(spec.base) + s.t * 1000;
          if (s.op === "kill") killed.add(actor(s.as).pid);
          const got = s.by === "node" ? await node(s) : await py.send({ ...s, at: new Date(clock.ms).toISOString() });
          expect(got, `step ${n} (${s.by} ${s.op}${s.job === undefined ? "" : ` ${s.job}`} at t=${s.t})`).toEqual(s.expect);
        }
      } finally {
        for (const d of drives.values()) d.gate?.({ kind: "fatal", code: "internal", message: "the scenario ended" });
        await Promise.all([...drives.values()].map((d) => d.done));
        await py.close();
        k.close();
      }
    }, 30_000);
  }
});

// job.py's heartbeat is a daemon thread (lease-renewal: every ttl/3, never per unit). Two ways it
// can meet the store, measured from Python with the thread's own beats counted:
//   - busy (`database is locked`): one beat missed is what the ttl/3 cadence is for; the thread
//     beats again, and the run never hears of it;
//   - anything else (`disk I/O error`): the slot can no longer be renewed, so the run's next call
//     raises - the loss reaches the work loop, as Node's beat carries a throw (job-run.ts).
// A thread that died on either one stopped renewing while the run went on writing, unwarned.
describe.skipIf(python === undefined)("the Python heartbeat meets a store error", () => {
  const cases = [
    { name: "a busy store misses one beat and the thread keeps renewing", error: "database is locked", expect: "BEATING" },
    { name: "any other store error stops the run at its next call", error: "disk I/O error", expect: "STOPPED" },
  ] as const;
  for (const [n, c] of cases.entries()) {
    it(c.name, () => {
      const db = path.join(tmp.dir, `heartbeat-${n}.sqlite`);
      copyFileSync(template, db);
      const k = must(openKernel(db, { snapshotDir: tmp.dir }));
      must(enqueue(k.store, { id: "hb", of: { kind: "run", id: "run-hb" }, producer: "forge", lane: "gpu.local" }, operator));
      k.close();
      const code = [
        "import sqlite3, sys, time",
        `sys.path.append(${JSON.stringify(path.join(here, "..", "py"))})`,
        "import job, job_record",
        "calls = []",
        "real = job_record.heartbeat_in",
        "def flaky(*a):",
        "    calls.append(1)",
        `    if ${c.expect === "BEATING" ? "len(calls) == 1" : "True"}:`,
        `        raise sqlite3.OperationalError(${JSON.stringify(c.error)})`,
        "    return real(*a)",
        "job.heartbeat_in = job_record.heartbeat_in = flaky",
        `jobs = job.Jobs(${JSON.stringify(db)})`,
        "run = jobs.claim('hb', dry_only=True)",
        "run.start_heartbeat(every_s=0.02)",
        "time.sleep(1.0)",
        "alive = run._beat[1].is_alive()",
        "try:",
        "    run.start('a')",
        "    print('BEATING' if alive and len(calls) > 2 else 'DEAD after %d beat(s)' % len(calls))",
        "except job.LeaseError as e:",
        "    print('STOPPED' if not alive else 'RAISED with the thread alive: %s' % e)",
        "run._stop_heartbeat()",
        "jobs.close()",
      ].join("\n");
      const r = spawnSync(python ?? "python", ["-I", "-c", code], { encoding: "utf8", timeout: 30_000 });
      expect({ out: r.stdout.trim(), traceback: r.stderr.includes("Traceback") }).toEqual({ out: c.expect, traceback: false });
    });
  }
});
