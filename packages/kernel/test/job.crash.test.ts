import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Holder } from "@gt/domain/job";
import { enumerateCrashes, type CrashSpec, type Phase } from "../src/crash.ts";
import { verify } from "../src/events.ts";
import type { Producer } from "../src/job-core.ts";
import { recover, runJob } from "../src/job-run.ts";
import { enqueue, get, retry } from "../src/job.ts";
import { assertFence } from "../src/lease.ts";
import { reconcileJobSpend } from "../src/spend/projection.ts";
import { must, scratch } from "./helpers.ts";
import { count, hostA, hostB, jobId, LIVE, openWorld, operator, producer, type World } from "./job-fixture.ts";

// Crash-prefix enumeration over the job driver (plan §6 Phase 1 exit). The
// driver's effects are enumerated from a recording, so a step that gains a
// transaction gains its crash points without this file changing.
//
// (a) A two-step job dies after every prefix; a restarted process sweeps,
//     the operator retries what was interrupted, and the job is driven again.
//     INVARIANT: the job ends `done` with one output per step; a step whose
//     output was booked is never performed again; and a step is performed a
//     second time ONLY when the interruption named it as the step in flight -
//     the one case where the record honestly does not know whether it ran.
// (b) The same job's holder vanishes on another host, so nobody here can
//     prove it dead: the sweep waits out its TTL, a second host takes the lane
//     and finishes the job, and then the old holder wakes and makes the write
//     it was about to make. INVARIANT: that write is refused by the fence.

const tmp = scratch("job-crash");
afterAll(() => tmp.dispose());
let n = 0;
const J = jobId("job-1");
const STEPS = ["a", "b"];

type CW = World & { calls: Map<string, number>; zombie: "none" | "refused" | "accepted" };

function interruptedStages(w: CW): string[] {
  return must(w.store.read((r) => r.all("SELECT data FROM events WHERE type = 'job.interrupted' ORDER BY seq").map((e) => String(e["data"]))))
    .map((d) => /"stage":"([a-z]+)"/.exec(d)?.[1] ?? "");
}

function fenceOf(w: CW, h: Holder): number | undefined {
  const rows = must(w.store.read((r) => r.all("SELECT data FROM events WHERE type = 'lease.claimed' ORDER BY seq").map((e) => String(e["data"]))));
  const mine = rows.find((d) => d.includes(`"bootId":"${h.bootId}"`));
  const m = mine === undefined ? null : /"fence":(\d+)/.exec(mine);
  return m === null ? undefined : Number(m[1]);
}

function invariant(w: CW, phase: Phase): string | undefined {
  const chain = must(verify(w.store));
  if (chain.state !== "intact") return `chain broken at ${chain.seq}: ${chain.reason}`;
  const outputs = count(w.store, "SELECT count(*) AS n FROM job_outputs");
  const booked = count(w.store, "SELECT count(*) AS n FROM events WHERE type = 'job.step-done'");
  if (outputs !== booked) return `${outputs} output row(s) but ${booked} step-done event(s)`;
  const named = new Set(interruptedStages(w));
  for (const [step, calls] of w.calls) {
    if (calls > 2) return `step ${step} performed ${calls} times`;
    if (calls === 2 && !named.has(step)) return `step ${step} performed twice though no interruption named it in flight`;
  }
  if (w.zombie === "accepted") return "the old holder's write landed after the take-over";
  // Decision 7: the driver books a non-metering producer's spend in the same
  // transaction as the record, so the record equals its meter at EVERY prefix.
  const rec = must(w.store.read((r) => reconcileJobSpend(r, "job-1")));
  if (rec.drift !== undefined) return `job spend drifted from the meter: ${JSON.stringify(rec)}`;
  if (phase === "crashed") return undefined;
  const { job } = must(get(w.store, J));
  if (job.state !== "done") return `recovery left the job ${job.state}`;
  if (outputs !== STEPS.length) return `recovery left ${outputs} outputs`;
  return count(w.store, "SELECT count(*) AS n FROM leases WHERE holder_boot IS NOT NULL") === 0 ? undefined : "the lane is still held after the job finished";
}

/** The producer, counting every perform into the world so the count survives a restart. */
function counted(w: CW): Producer {
  const { p } = producer("gpu.local", STEPS);
  return {
    ...p,
    perform: (step, ctx) => {
      w.calls.set(step.name, (w.calls.get(step.name) ?? 0) + 1);
      return p.perform(step, ctx);
    },
  };
}

function spec(variant: "restart" | "takeover"): CrashSpec<CW> {
  const first: Holder = variant === "restart" ? hostA : { ...hostA, host: "box-far" };
  // The restarted process: same host and pid as A (it inherited the number), a new bootId.
  const second: Holder = variant === "restart" ? { ...hostA, bootId: "boot-a-2" } : hostB;
  const open = (file: string, prior?: CW): CW => {
    const w = openWorld(file, prior?.clock, tmp.dir);
    return { ...w, calls: prior?.calls ?? new Map(), zombie: prior?.zombie ?? "none" };
  };
  return {
    open: () => {
      const w = open(path.join(tmp.dir, `c-${++n}.sqlite`));
      must(enqueue(w.store, { id: "job-1", of: { kind: "part", id: "part-1" }, producer: "test", lane: "gpu.local", mode: LIVE }, operator));
      return w;
    },
    reopen: (w) => {
      w.store.close();
      return open(w.file, w);
    },
    close: (w) => w.store.close(),
    effects: (w) => w.fx,
    scenario: async (fx, w) => {
      must(await runJob(fx, counted(w), "job-1", { holder: first, alive: () => true, ttlS: 60, heartbeatMs: 3_600_000 }));
    },
    recover: async (fx, w) => {
      if (variant === "takeover") w.clock.ms += 61_000; // the far host's TTL runs out; nobody here can probe it
      must(recover(fx, { holder: second, alive: () => true }));
      if (must(get(w.store, J)).job.state === "interrupted") must(retry(w.store, J, operator));
      if (must(get(w.store, J)).job.state === "queued") must(await runJob(fx, counted(w), "job-1", { holder: second, alive: () => true, heartbeatMs: 3_600_000 }));
      if (variant === "takeover") {
        const old = fenceOf(w, first);
        if (old !== undefined) {
          // The old holder wakes and books the step it had in flight.
          const r = w.store.tx((t) => {
            assertFence(t, "gpu.local#1", old);
            t.run("INSERT OR REPLACE INTO job_outputs (job_id, step, output, fence, at) VALUES ('job-1', 'b', '{}', ?, ?)", old, t.at);
          });
          w.zombie = r.ok ? "accepted" : r.error.code === "conflict" ? "refused" : "accepted";
        }
      }
    },
    invariant,
  };
}

const EFFECTS = ["tx:claim", "tx:next", "call:perform:a", "tx:book:a", "tx:next", "call:perform:b", "tx:book:b", "tx:next"];

describe("job driver under crash-prefix enumeration", () => {
  it("(a) crashed at every prefix, swept, retried by the operator: done, no booked step re-performed", async () => {
    const report = await enumerateCrashes(spec("restart"));
    expect(report.effects).toEqual(EFFECTS);
    expect(report.violations).toEqual([]);
  });

  it("(b) a take-over after TTL while the old holder resumes: its write is refused by the fence", async () => {
    const report = await enumerateCrashes(spec("takeover"));
    expect(report.effects).toEqual(EFFECTS);
    expect(report.violations).toEqual([]);
  });

});
