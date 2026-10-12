// LANE — GPU-LEASE (dynamic).
//
// The card has ONE holder at a time and the holder is written on disk
// (lib/gpu/lease.ts, the Node half of pipeline/gpu/lease.py). This probe drives
// the ACTUAL broker and the ACTUAL router chokepoint:
//
//   1. a non-holder's recycle raises LeaseHeld naming the holder, and the stop
//      callback (the process kill) never runs;
//   2. a dead holder is reclaimed, and the reclaim is counted in queue.jsonl;
//   3. waiters are granted FIFO and a waiter past its wait gets LeaseTimeout;
//   4. (interop with Python is pipeline/gpu/selftest.py case 4, which drives
//      this module through pipeline/gpu/interop.mts);
//   5. recognize while the card is leased by a comfy tenant: the router's trail
//      shows ollama `rate-limited`, google serves, and the local model was never
//      called. Once the lease is released the local eye serves again.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { GpuBroker, LeaseHeld, LeaseTimeout } from "@/lib/gpu/lease";
import { __resetBudget } from "@/lib/imaging/budget";
import { recognize } from "@/lib/imaging/router";

import { keepEnv } from "./_helpers";

const realFetch = globalThis.fetch;
keepEnv(["GPU_LEASE_DIR", "OLLAMA_HOST", "GOOGLE_AI_API_KEY", "IMAGING_ENV", "OLLAMA_LEASE_WAIT_MS"]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gpu-lease-probe-"));
  process.env.GPU_LEASE_DIR = dir;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});

const alive = (...pids: number[]) => (pid: number) => pids.includes(pid);
const broker = (pid: number, extra: ConstructorParameters<typeof GpuBroker>[0] = {}) =>
  new GpuBroker({ root: dir, pid, host: "h", alive: alive(1, 2, 3, 4), pollMs: 10, ...extra });

test("1. a non-holder's recycle raises LeaseHeld naming the holder, and nothing is stopped", async () => {
  const a = broker(1);
  const b = broker(2);
  const held = await a.acquire({ tenant: "tenant-a", engine: "comfy", vramGb: 20 });
  let stopped = 0;
  const stop = () => (stopped += 1);
  const err = await b.recycle("comfy", null, stop).catch((e) => e);
  expect(err).toBeInstanceOf(LeaseHeld);
  expect((err as LeaseHeld).holder?.tenant).toBe("tenant-a");
  expect((err as LeaseHeld).message).toContain("tenant-a");
  expect(stopped).toBe(0);
  await held.recycle("comfy", stop);
  expect(stopped).toBe(1);
  await held.release();
});

test("2. a dead holder with a lapsed heartbeat is reclaimed and counted", async () => {
  let t = 1_000_000;
  const now = () => t;
  const a = broker(1, { now, alive: alive(2) }); // pid 1 is dead
  const b = broker(2, { now, alive: alive(2) });
  await a.acquire({ tenant: "tenant-a", engine: "comfy", vramGb: 20, ttlS: 60 });
  t += 61_000;
  const got = await b.acquire({ tenant: "tenant-b", engine: "comfy", vramGb: 20 });
  expect(got.rec.tenant).toBe("tenant-b");
  expect((await b.status()).reclaims).toBe(1);
  const events = readFileSync(path.join(dir, "queue.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(events.filter((e) => e.ev === "reclaim").map((e) => [e.tenant, e.reason])).toEqual([["tenant-a", "pid-dead"]]);
});

test("3. waiters are granted FIFO and a waiter past its wait times out instead of hanging", async () => {
  const [a, b, c, d] = [1, 2, 3, 4].map((p) => broker(p));
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
  const err = await d.acquire({ tenant: "tenant-d", engine: "comfy", vramGb: 20, waitMs: 200 }).catch((e) => e);
  expect(err).toBeInstanceOf(LeaseTimeout);
  expect(Date.now() - t0).toBeLessThan(5_000);
  expect((await a.status()).queue.map((w) => w.tenant)).toEqual(["tenant-b", "tenant-c"]);
  await held.release();
  await Promise.all([pb, pc]);
  expect(order).toEqual(["tenant-b", "tenant-c"]);
});

test("5. recognize while comfy is leased: the trail shows ollama rate-limited and google serves", async () => {
  process.env.OLLAMA_HOST = "http://ollama.probe";
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
  process.env.IMAGING_ENV = "dev";
  process.env.OLLAMA_LEASE_WAIT_MS = "0";
  __resetBudget();

  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    if (url.includes("ollama.probe"))
      return new Response(JSON.stringify({ message: { content: "a local answer" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    return new Response(JSON.stringify({ status: "completed", output_text: "a cloud answer" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  const req = { image: { base64: "AQID", mime: "image/png" as const }, instruction: "describe" };

  const comfy = await new GpuBroker({ root: dir, pid: process.pid }).acquire({
    tenant: "consistency", engine: "comfy", vramGb: 20,
  });
  const served = await recognize(req);
  expect(served.provenance.provider).toBe("google");
  expect(served.provenance.reroutedFrom).toEqual([{ provider: "ollama", why: "rate-limited" }]);
  expect(urls.some((u) => u.includes("ollama.probe"))).toBe(false);
  await comfy.release();

  urls.length = 0;
  const local = await recognize(req);
  expect(local.provenance.provider).toBe("ollama");
  expect(urls.every((u) => u.includes("ollama.probe"))).toBe(true);
  // the eye gave the card back
  expect((await broker(1).status()).holder).toBeNull();
});
