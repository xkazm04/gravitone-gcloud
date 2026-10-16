import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJsonAt } from "@gt/domain/door";
import type { Actor } from "@gt/domain/event";
import { laneSlots } from "@gt/domain/lane";
import { blobStore } from "@gt/kernel/blob";
import { liveEffects } from "@gt/kernel/effects";
import type { Producer, StepOutcome } from "@gt/kernel/job-core";
import { runJob } from "@gt/kernel/job-run";
import { enqueue } from "@gt/kernel/job";
import { openKernel, type Kernel } from "@gt/kernel/kernel";

import { GPU_SLOT, GpuBroker, LeaseHeld, LeaseLost, LeaseTimeout } from "../../lib/gpu/lease.ts";

// ONE GPU LEASE (Phase 4, L27). v1's broker API (lib/gpu/lease.ts) is now a
// shim over the kernel lease on gpu.local#1, so a kernel job, a broker tenant
// (the Ollama eye) and a Python tenant (pipeline/gpu/lease.py; selftest case 4
// and packages/kernel/test/job.python.test.ts cover that side) all exclude each
// other. Cases 1-3 are v1's gpu-lease probe cases, kept against the shim; the
// rest are what the unification adds. Each case gets its own store file.

const operator: Actor = { kind: "operator", id: "kazda" };
const alive = (...pids: number[]) => (pid: number) => pids.includes(pid);

let dir = "";
let store = "";
const opened: { close(): Promise<void> | void }[] = [];
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gt-gpu-lease-"));
  store = path.join(dir, "gravitone.sqlite");
});
afterEach(async () => {
  for (const o of opened.splice(0)) await o.close();
  rmSync(dir, { recursive: true, force: true });
});

function broker(pid: number, extra: ConstructorParameters<typeof GpuBroker>[0] = {}): GpuBroker {
  const b = new GpuBroker({ store, root: path.join(dir, "gpu"), pid, host: "h", alive: alive(1, 2, 3, 4), pollMs: 10, ...extra });
  opened.push(b);
  return b;
}
function kernelAt(clock?: () => number): Kernel {
  const k = openKernel(store, clock === undefined ? {} : { clock: () => new Date(clock()) });
  if (!k.ok) throw k.error;
  opened.push(k.value);
  return k.value;
}

describe("the shim keeps v1's broker contract", () => {
  it("the shim's slot is the domain's one gpu.local slot", () => {
    expect(laneSlots("gpu.local")).toEqual([GPU_SLOT]);
  });

  it("1. a non-holder's recycle raises LeaseHeld naming the holder, and nothing is stopped", async () => {
    const held = await broker(1).acquire({ tenant: "tenant-a", engine: "comfy", vramGb: 20 });
    let stopped = 0;
    const stop = () => (stopped += 1);
    const e = await broker(2).recycle("comfy", null, stop).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LeaseHeld);
    expect(e instanceof LeaseHeld ? [e.holder?.tenant, e.message.includes("tenant-a")] : []).toEqual(["tenant-a", true]);
    expect(stopped).toBe(0);
    await held.recycle("comfy", stop);
    expect(stopped).toBe(1);
    const wrongEngine = await held.recycle("ollama", stop).catch((x: unknown) => x);
    expect(wrongEngine).toBeInstanceOf(LeaseHeld);
    await held.release();
    expect(await broker(1).recycle("comfy", held, stop).catch((x: unknown) => (x instanceof LeaseHeld ? x.holder : x))).toBeNull();
  });

  it("2. a dead holder with a lapsed heartbeat is reclaimed and counted; a fresh heartbeat holds", async () => {
    let t = Date.parse("2026-10-16T00:00:00.000Z");
    const now = () => t;
    await broker(1, { now, alive: alive(2) }).acquire({ tenant: "tenant-a", engine: "comfy", vramGb: 20, ttlS: 60 });
    t += 61_000;
    const b = broker(2, { now, alive: alive(2) });
    const got = await b.acquire({ tenant: "tenant-b", engine: "comfy", vramGb: 20, ttlS: 60 });
    expect(got.rec.tenant).toBe("tenant-b");
    expect((await b.status()).reclaims).toBe(1);
    t += 30_000;
    await got.heartbeat();
    t += 45_000;
    const c = broker(3, { now, alive: alive(2, 3) });
    const e = await c.acquire({ tenant: "tenant-c", engine: "comfy", vramGb: 20 }).catch((x: unknown) => x);
    expect(e instanceof LeaseTimeout ? e.holder?.tenant : e).toBe("tenant-b");
    t += 30_000;
    expect((await c.acquire({ tenant: "tenant-c", engine: "comfy", vramGb: 20 })).rec.tenant).toBe("tenant-c");
    const lost = await got.heartbeat().catch((x: unknown) => x);
    expect(lost).toBeInstanceOf(LeaseLost);
    const k = kernelAt();
    const reasons = k.store.read((r) => r.all("SELECT json_extract(data, '$.reason') AS why FROM events WHERE type = 'lease.reclaimed' ORDER BY seq").map((x) => x["why"]));
    expect(reasons.ok && reasons.value).toEqual(["holder-gone", "heartbeat-expired"]);
  });

  it("3. waiters are granted FIFO and a waiter past its wait times out instead of hanging", async () => {
    const [a, b, c, d] = [1, 2, 3, 4].map((p) => broker(p));
    if (a === undefined || b === undefined || c === undefined || d === undefined) throw new Error("four brokers");
    const held = await a.acquire({ tenant: "tenant-a", engine: "comfy", vramGb: 20 });
    const order: string[] = [];
    const wait = (br: GpuBroker, tenant: string) =>
      br.acquire({ tenant, engine: "comfy", vramGb: 20, waitMs: 20_000 }).then(async (h) => {
        order.push(tenant);
        await h.release();
      });
    const queued = async (n: number) => {
      for (let i = 0; i < 500; i++) {
        if ((await a.status()).queue.length >= n) return;
        await new Promise((r) => setTimeout(r, 10));
      }
      throw new Error(`queue never reached ${n}`);
    };
    const pb = wait(b, "tenant-b");
    await queued(1);
    const pc = wait(c, "tenant-c");
    await queued(2);
    const t0 = Date.now();
    const e = await d.acquire({ tenant: "tenant-d", engine: "comfy", vramGb: 20, waitMs: 200 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LeaseTimeout);
    expect(Date.now() - t0).toBeLessThan(5_000);
    expect((await a.status()).queue.map((w) => w.tenant)).toEqual(["tenant-b", "tenant-c"]);
    await held.release();
    await Promise.all([pb, pc]);
    expect(order).toEqual(["tenant-b", "tenant-c"]);
  });
});

describe("one lease: a kernel job and a broker tenant exclude each other", () => {
  async function jobDrive(k: Kernel, id: string) {
    must(enqueue(k.store, { id, of: { kind: "run", id: `run-${id}` }, producer: "forge", lane: "gpu.local" }, operator));
    let gate: (o: StepOutcome) => void = () => {};
    let blocked: () => void = () => {};
    const atStep = new Promise<void>((r) => (blocked = r));
    const producer: Producer = {
      lane: "gpu.local",
      plan: (_j, outs) => (outs.has("render") ? [] : [{ name: "render", estimate: { seconds: 1, usd: 0 } }]),
      perform: () =>
        new Promise<StepOutcome>((r) => {
          gate = r;
          blocked();
        }),
    };
    const done = runJob(liveEffects(k.store, blobStore(path.join(dir, "blobs"))), producer, id, { holder: { bootId: "boot-w", pid: 4, host: "h" }, heartbeatMs: 2_000_000_000 });
    return { done, atStep, finish: () => gate({ kind: "produced", output: { made: "render" } }) };
  }

  it("a job holding gpu.local#1 makes a broker acquire time out, naming the job; once it is done the broker gets the card", async () => {
    const k = kernelAt();
    const job = await jobDrive(k, "job:run:f1");
    await Promise.race([job.atStep, job.done.then((r) => Promise.reject(new Error(`the drive ended: ${JSON.stringify(r)}`)))]);
    const e = await broker(1).acquire({ tenant: "next-ollama-eye", engine: "ollama", vramGb: 22 }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(LeaseTimeout);
    expect(e instanceof LeaseTimeout ? [e.holder?.engine, e.holder?.tenant] : []).toEqual(["job", "forge job job:run:f1"]);
    expect((await broker(1).status()).holder?.tenant).toBe("forge job job:run:f1");
    job.finish();
    const r = await job.done;
    expect(r.ok && r.value.outcome).toBe("done");
    const turn = await broker(1).acquire({ tenant: "next-ollama-eye", engine: "ollama", vramGb: 22 });
    expect(turn.rec.fence).toBe(2);
    await turn.release();
  });

  it("a broker tenant holding the card makes a job's drive busy, and the job runs once it is released", async () => {
    const k = kernelAt();
    const turn = await broker(1).acquire({ tenant: "consistency/baseline", engine: "comfy", vramGb: 20 });
    must(enqueue(k.store, { id: "job:run:f2", of: { kind: "run", id: "run-f2" }, producer: "forge", lane: "gpu.local" }, operator));
    const producer: Producer = { lane: "gpu.local", plan: (_j, outs) => (outs.has("render") ? [] : [{ name: "render", estimate: { seconds: 1, usd: 0 } }]), perform: async () => ({ kind: "produced", output: { made: "render" } }) };
    const fx = liveEffects(k.store, blobStore(path.join(dir, "blobs")));
    const busy = must(await runJob(fx, producer, "job:run:f2", { heartbeatMs: 2_000_000_000 }));
    expect([busy.outcome, busy.reason?.includes(`h/1`)]).toEqual(["busy", true]);
    await turn.release();
    expect(must(await runJob(fx, producer, "job:run:f2", { heartbeatMs: 2_000_000_000 })).outcome).toBe("done");
  });

  it("the first broker to open the store leaves a MIGRATED marker in v1's lease directory, and reads nothing from lease.json", async () => {
    const root = path.join(dir, "gpu");
    rmSync(root, { recursive: true, force: true });
    const { mkdirSync } = await import("node:fs");
    mkdirSync(root);
    // A v1 holder file left behind: the shim must not read it as a holder.
    writeFileSync(path.join(root, "lease.json"), JSON.stringify({ tenant: "ghost", engine: "comfy", vramGb: 20, pid: 1, host: "h", jobPrefix: "", acquiredAt: 0, heartbeatAt: Date.now(), ttlS: 120, ticket: "t" }));
    const b = broker(1, { root });
    expect((await b.status()).holder).toBeNull();
    expect(existsSync(path.join(root, "MIGRATED"))).toBe(true);
    expect(readFileSync(path.join(root, "MIGRATED"), "utf8")).toContain("gpu.local#1");
    expect((await b.acquire({ tenant: "tenant-a", engine: "comfy", vramGb: 20 })).rec.tenant).toBe("tenant-a");
  });
});

function must<T>(r: { ok: true; value: T } | { ok: false; error: Error }): T {
  if (!r.ok) throw r.error;
  return r.value;
}

// A Python GPU tenant that is a kernel JOB (forge or Dojo through packages/kernel/py/job.py)
// holds the card through its claim; `hold_for_job` (pipeline/gpu/lease.py) names it on the
// ledger and hands guard/comfy a handle, with no second claim. Node's broker sees the job's
// tenant and is refused; recycle is the job's.
function findPython(): string | undefined {
  for (const bin of ["python", "python3", "py"]) {
    const r = spawnSync(bin, ["-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.trim() === "3") return bin;
  }
  return undefined;
}
const python = findPython();

describe.skipIf(python === undefined)("a Python job on the card is the card's tenant", () => {
  it("hold_for_job names the job's tenant, a Node broker is refused naming it, and only the job's handle recycles", () => {
    const k = kernelAt();
    must(enqueue(k.store, { id: "job:run:forge1", of: { kind: "run", id: "run-forge1" }, producer: "forge", lane: "gpu.local" }, operator));
    const script = [
      "import json, sys",
      `sys.path.insert(0, ${JSON.stringify(path.join(process.cwd(), "pipeline", "gpu"))})`,
      `sys.path.append(${JSON.stringify(path.join(process.cwd(), "packages", "kernel", "py"))})`,
      "import lease",
      "from job import Jobs",
      `jobs = Jobs(${JSON.stringify(store)})`,
      "run = jobs.claim('job:run:forge1')",
      `handle = lease.hold_for_job(run, 'forge-comfy', 'comfy', 20, job_prefix='foundry', broker=lease.Broker(${JSON.stringify(path.join(dir, "gpu"))}, store=${JSON.stringify(store)}))`,
      `other = lease.Broker(${JSON.stringify(path.join(dir, "gpu"))}, store=${JSON.stringify(store)}, pid=77)`,
      "refused = None",
      "try:\n    other.recycle('comfy', holder=None, stop=lambda: 'killed')\nexcept lease.LeaseHeld as e:\n    refused = e.holder['tenant']",
      "print(json.dumps({'current': lease.current_handle() is handle, 'recycled': handle.recycle('comfy', stop=lambda: 'restarted'), 'refused': refused}))",
      "sys.stdout.flush()",
      "import time; time.sleep(30)",
    ].join("\n");
    const child = spawn(python ?? "python", ["-c", script], { stdio: ["ignore", "pipe", "pipe"] });
    return new Promise<void>((resolve, reject) => {
      let out = "";
      let errText = "";
      let verdict: Error | null | undefined;
      child.stderr.on("data", (d: Buffer) => (errText += d.toString()));
      child.stdout.on("data", async (d: Buffer) => {
        out += d.toString();
        if (!out.includes("\n") || verdict !== undefined) return;
        try {
          const doc = parseJsonAt("python report", z.object({ current: z.boolean(), recycled: z.string(), refused: z.string().nullable() }), out.trim());
          expect(doc.ok && doc.value).toEqual({ current: true, recycled: "restarted", refused: "forge-comfy" });
          const e = await broker(1, { alive: (pid) => pid === child.pid || pid === 1 }).acquire({ tenant: "next-ollama-eye", engine: "ollama", vramGb: 22 }).catch((x: unknown) => x);
          expect(e instanceof LeaseTimeout ? [e.holder?.tenant, e.holder?.engine, e.holder?.jobPrefix] : e).toEqual(["forge-comfy", "comfy", "foundry"]);
          verdict = null;
        } catch (x) {
          verdict = x instanceof Error ? new Error(`${x.message}\n${errText}`) : new Error(String(x));
        }
        child.kill();
      });
      // Settled on exit, so the store file is closed before the case's directory is removed.
      child.on("exit", (code) => {
        if (verdict === null) resolve();
        else reject(verdict ?? new Error(`python exited ${String(code)} before reporting: ${errText}`));
      });
    });
  }, 60_000);
});
