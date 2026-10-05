// LANE — BUDGET-HOLDS (dynamic).
//
// Acceptance probe for Card 2:
// "The spend ceiling checks but never reserves, so a concurrent burst overshoots it ($10.80 vs $5)"
//
// Under a spend ceiling, concurrent calls that arrive before any call finishes
// could all pass assertWithinBudget(estimate) against the same un-updated spend,
// dispatching far more spend than the ceiling permits.
//
// Budget holds reserve estimated spend at the gate before dispatching work to vendors,
// keep held spend visible in budgetStats() and remainingUsd, settle held spend to
// actual recorded spend upon completion, and release holds without spend on failure
// or cancellation, ensuring no hold ever leaks.

import { test, expect } from "@playwright/test";
import { keepEnv } from "./_helpers";
import {
  budgetStats,
  spendRows,
  __resetBudget,
  BUDGET_VAR,
  WINDOW_VAR,
  FLOOR_VAR,
} from "@/lib/imaging/budget";
import { ImagingError } from "@/lib/imaging/errors";
import { generate, recognize } from "@/lib/imaging/router";

const realFetch = globalThis.fetch;

keepEnv([
  BUDGET_VAR,
  WINDOW_VAR,
  FLOOR_VAR,
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "OLLAMA_HOST",
]);

test.beforeEach(() => {
  __resetBudget();
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  delete process.env[FLOOR_VAR];
  delete process.env.OLLAMA_HOST;
  process.env.LOCAL_BINARIES = "off";
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("1. concurrent burst: 3 calls under $1 ceiling, first two dispatch 16 fetches and third is refused", async () => {
  process.env[BUDGET_VAR] = "1.00";
  let fetchesIssued = 0;
  const pendingResolvers: Array<() => void> = [];

  globalThis.fetch = (async () => {
    fetchesIssued++;
    return new Promise<Response>((resolve) => {
      pendingResolvers.push(() => {
        resolve(
          new Response(
            JSON.stringify({
              status: "completed",
              output_image: { data: "AQID", mime_type: "image/jpeg" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      });
    });
  }) as typeof fetch;

  const p1 = generate({ prompt: "probe 1", aspect: "16:9", count: 8 });
  const p2 = generate({ prompt: "probe 2", aspect: "16:9", count: 8 });
  let p3Error: unknown;
  const p3 = generate({ prompt: "probe 3", aspect: "16:9", count: 8 }).catch((e) => {
    p3Error = e;
  });

  // p3 is expected to reject at the gate before any fetch is made.
  await Promise.race([p3, new Promise((resolve) => setTimeout(resolve, 50))]);
  expect(p3Error).toBeInstanceOf(ImagingError);
  expect((p3Error as ImagingError).kind).toBe("over-budget");
  expect(fetchesIssued).toBe(16);
  expect(budgetStats().counters.refusals).toBe(1);

  // Clean up pending fetches
  for (const r of pendingResolvers) r();
  await Promise.all([p1, p2, p3]);
});

test("2. resolving pending calls settles spend and clears holds", async () => {
  process.env[BUDGET_VAR] = "1.00";
  const pendingResolvers: Array<() => void> = [];

  globalThis.fetch = (async () => {
    return new Promise<Response>((resolve) => {
      pendingResolvers.push(() => {
        resolve(
          new Response(
            JSON.stringify({
              status: "completed",
              output_image: { data: "AQID", mime_type: "image/jpeg" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      });
    });
  }) as typeof fetch;

  const p1 = generate({ prompt: "probe 1", aspect: "16:9", count: 8 });
  const p2 = generate({ prompt: "probe 2", aspect: "16:9", count: 8 });
  const p3 = generate({ prompt: "probe 3", aspect: "16:9", count: 8 }).catch(() => {});

  await Promise.race([p3, new Promise((resolve) => setTimeout(resolve, 50))]);
  for (const r of pendingResolvers) r();
  await Promise.all([p1, p2, p3]);

  const stats = budgetStats() as { spentUsd: number; heldUsd: number };
  expect(stats.spentUsd).toBeCloseTo(0.72, 6);
  expect(stats.heldUsd).toBe(0);
});

test("3. while two $0.36 calls are in flight under $1 ceiling, heldUsd is 0.72 and remainingUsd is 0.28", async () => {
  process.env[BUDGET_VAR] = "1.00";
  const pendingResolvers: Array<() => void> = [];

  globalThis.fetch = (async () => {
    return new Promise<Response>((resolve) => {
      pendingResolvers.push(() => {
        resolve(
          new Response(
            JSON.stringify({
              status: "completed",
              output_image: { data: "AQID", mime_type: "image/jpeg" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      });
    });
  }) as typeof fetch;

  const p1 = generate({ prompt: "probe 1", aspect: "16:9", count: 8 });
  const p2 = generate({ prompt: "probe 2", aspect: "16:9", count: 8 });

  const stats = budgetStats() as { heldUsd: number; remainingUsd: number };
  expect(stats.heldUsd).toBeCloseTo(0.72, 6);
  expect(stats.remainingUsd).toBeCloseTo(0.28, 6);

  for (const r of pendingResolvers) r();
  await Promise.all([p1, p2]);
});

test("4. transport failure (TypeError) releases hold without booking spend and admits subsequent call", async () => {
  process.env[BUDGET_VAR] = "0.50";

  globalThis.fetch = (async () => {
    throw new TypeError("transport failure (Failed to fetch)");
  }) as typeof fetch;

  let err: unknown;
  try {
    await generate({ prompt: "probe fail", aspect: "16:9", count: 8 });
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ImagingError);
  expect((err as ImagingError).kind).toBe("failed");
  expect((err as ImagingError).dispatched).toBe(false);

  const stats = budgetStats() as { heldUsd: number; spentUsd: number; counters: { booked: number } };
  expect(stats.heldUsd).toBe(0);
  expect(stats.spentUsd).toBe(0);
  expect(stats.counters.booked).toBe(0);

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        status: "completed",
        output_image: { data: "AQID", mime_type: "image/jpeg" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const served = await generate({ prompt: "probe succeed", aspect: "16:9", count: 8 });
  expect(served.images.length).toBeGreaterThan(0);
  expect(budgetStats().spentUsd).toBeCloseTo(0.36, 6);
  expect((budgetStats() as { heldUsd: number }).heldUsd).toBe(0);
});

test("5. HTTP 500 failure replaces hold with one 'failed' ledger row and releases hold", async () => {
  process.env[BUDGET_VAR] = "1.00";

  globalThis.fetch = (async () => {
    return new Response("Internal Server Error", {
      status: 500,
      headers: { "content-type": "text/plain" },
    });
  }) as typeof fetch;

  let err: unknown;
  try {
    await generate({ prompt: "probe 500", aspect: "16:9", count: 1 });
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ImagingError);
  expect((err as ImagingError).dispatched).toBe(true);

  const stats = budgetStats() as { heldUsd: number; counters: { bookedFailed: number } };
  expect(stats.heldUsd).toBe(0);
  expect(stats.counters.bookedFailed).toBe(1);

  const rows = spendRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe("failed");
  expect(rows[0].basis).toBe("estimate");
});

test("6. non-ImagingError mid-call releases hold so no hold outlives request", async () => {
  process.env[BUDGET_VAR] = "1.00";

  const throwingReq = {
    get prompt(): string {
      throw new Error("unexpected internal provider crash");
    },
    aspect: "16:9" as const,
    count: 8,
  };

  let err: unknown;
  try {
    await generate(throwingReq);
  } catch (e) {
    err = e;
  }
  expect(err).toBeDefined();

  const stats = budgetStats() as { heldUsd: number };
  expect(stats.heldUsd).toBe(0);
});

test("7. GUARD: three sequential awaited $0.36 calls under $1 ceiling admit two and refuse third with identical message", async () => {
  process.env[BUDGET_VAR] = "1.00";

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        status: "completed",
        output_image: { data: "AQID", mime_type: "image/jpeg" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const res1 = await generate({ prompt: "probe 1", aspect: "16:9", count: 8 });
  expect(res1.images.length).toBe(8);
  expect(budgetStats().spentUsd).toBeCloseTo(0.36, 6);

  const res2 = await generate({ prompt: "probe 2", aspect: "16:9", count: 8 });
  expect(res2.images.length).toBe(8);
  expect(budgetStats().spentUsd).toBeCloseTo(0.72, 6);

  let err3: unknown;
  try {
    await generate({ prompt: "probe 3", aspect: "16:9", count: 8 });
  } catch (e) {
    err3 = e;
  }

  expect(err3).toBeInstanceOf(ImagingError);
  expect((err3 as ImagingError).kind).toBe("over-budget");

  const expectedMessage =
    `Imaging spend ceiling reached: this call is estimated at $0.3600 and ` +
    `$0.7200 has already been spent in the last ~60 min, which would ` +
    `exceed the $1.00 ceiling (${BUDGET_VAR}). Refused before any vendor was ` +
    `called; wait for the window to roll over or raise the ceiling.`;
  expect((err3 as ImagingError).message).toBe(expectedMessage);
  expect(budgetStats().counters.refusals).toBe(1);
});

test("8. recognize() under hold takes hold at estimate and releases at settle with counters.unpriced +1", async () => {
  process.env[BUDGET_VAR] = "1.00";
  const pendingResolvers: Array<() => void> = [];

  globalThis.fetch = (async () => {
    return new Promise<Response>((resolve) => {
      pendingResolvers.push(() => {
        resolve(
          new Response(
            JSON.stringify({
              status: "completed",
              output_text: "Recognized plate description",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        );
      });
    });
  }) as typeof fetch;

  const recPromise = recognize({
    instruction: "describe this plate",
    image: { base64: "AQID", mime: "image/png" },
  });

  const heldWhileInFlight = budgetStats().heldUsd;
  expect(heldWhileInFlight).toBeCloseTo(0.045, 6);

  for (const r of pendingResolvers) r();
  const rec = await recPromise;
  expect(rec.text).toBe("Recognized plate description");

  const stats = budgetStats() as { heldUsd: number; spentUsd: number; counters: { unpriced: number; booked: number } };
  expect(stats.heldUsd).toBe(0);
  expect(stats.spentUsd).toBe(0);
  expect(stats.counters.unpriced).toBe(1);
  expect(stats.counters.booked).toBe(0);
});
