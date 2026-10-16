// LANE — GPU-LEASE (dynamic).
//
// The card has ONE holder at a time and the holder is written down. Since
// Phase 4 (L27) that holder is the kernel lease on gpu.local#1 in the store,
// and lib/gpu/lease.ts is v1's broker API as a shim over it. This probe drives
// the ACTUAL router chokepoint against it:
//
//   5. recognize while the card is leased by a comfy tenant: the router's trail
//      shows ollama `rate-limited`, google serves, and the local model was never
//      called. Once the lease is released the local eye serves again.
//
// v1's cases 1-3 (recycle is the holder's alone, a dead holder is reclaimed
// and counted, FIFO with a bounded wait) moved to Vitest with the shim, beside
// the cases the unification adds - a kernel job and a broker tenant exclude
// each other (tests/next-server/gpu-lease.test.ts). Python <-> Node is
// pipeline/gpu/selftest.py case 4 (through pipeline/gpu/interop.mts) and
// packages/kernel/test/job.python.test.ts.
//
// NATIVE_ESM: the shim imports @gt/kernel on first use.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { GpuBroker } from "@/lib/gpu/lease";
import { __resetBudget } from "@/lib/imaging/budget";
import { recognize } from "@/lib/imaging/router";

import { keepEnv } from "./_helpers";

const realFetch = globalThis.fetch;
keepEnv(["GPU_LEASE_DIR", "GRAVITONE_STORE_PATH", "OLLAMA_HOST", "GOOGLE_AI_API_KEY", "IMAGING_ENV", "OLLAMA_LEASE_WAIT_MS"]);

let dir = "";
test.beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "gpu-lease-probe-"));
  process.env.GPU_LEASE_DIR = path.join(dir, "gpu");
  process.env.GRAVITONE_STORE_PATH = path.join(dir, "gravitone.sqlite");
});
test.afterEach(async () => {
  globalThis.fetch = realFetch;
  // The Ollama provider's broker opened the process's kernel on this temp store: close it before the delete.
  const { closeProcessKernel } = await import("@gt/kernel/process");
  closeProcessKernel();
  rmSync(dir, { recursive: true, force: true });
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

  const tenant = new GpuBroker({ store: process.env.GRAVITONE_STORE_PATH, pid: process.pid });
  const comfy = await tenant.acquire({ tenant: "consistency", engine: "comfy", vramGb: 20 });
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
  expect((await tenant.status()).holder).toBeNull();
  await tenant.close();
});
