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
  estimatePendingUsd,
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
  expect((await budgetStats()).counters.refusals).toBe(1);

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

  const stats = await budgetStats() as { spentUsd: number; heldUsd: number };
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

  const stats = await budgetStats() as { heldUsd: number; remainingUsd: number };
  expect(stats.heldUsd).toBeCloseTo(0.72, 6);
  expect(stats.remainingUsd).toBeCloseTo(0.28, 6);

  await expect.poll(() => pendingResolvers.length).toBe(16); // 8 images each; the vendor is called after the hold commits
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

  const stats = await budgetStats() as { heldUsd: number; spentUsd: number; counters: { booked: number } };
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
  expect((await budgetStats()).spentUsd).toBeCloseTo(0.36, 6);
  expect((await budgetStats() as { heldUsd: number }).heldUsd).toBe(0);
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

  const stats = await budgetStats() as { heldUsd: number; counters: { bookedFailed: number } };
  expect(stats.heldUsd).toBe(0);
  expect(stats.counters.bookedFailed).toBe(1);

  const rows = await spendRows();
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

  const stats = await budgetStats() as { heldUsd: number };
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
  expect((await budgetStats()).spentUsd).toBeCloseTo(0.36, 6);

  const res2 = await generate({ prompt: "probe 2", aspect: "16:9", count: 8 });
  expect(res2.images.length).toBe(8);
  expect((await budgetStats()).spentUsd).toBeCloseTo(0.72, 6);

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
  expect((await budgetStats()).counters.refusals).toBe(1);
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

  const heldWhileInFlight = (await budgetStats()).heldUsd;
  expect(heldWhileInFlight).toBeCloseTo(0.045, 6);

  await expect.poll(() => pendingResolvers.length).toBe(1); // the vendor is called after the hold commits
  for (const r of pendingResolvers) r();
  const rec = await recPromise;
  expect(rec.text).toBe("Recognized plate description");

  const stats = await budgetStats() as { heldUsd: number; spentUsd: number; counters: { unpriced: number; booked: number } };
  expect(stats.heldUsd).toBe(0);
  expect(stats.spentUsd).toBe(0);
  expect(stats.counters.unpriced).toBe(1);
  expect(stats.counters.booked).toBe(0);
});

// ── A BILLED REFUSAL SPENDS THE HOLD; THE NEXT VENDOR NEEDS ITS OWN ─────────
//
// Card IMG-A stage 2 (docs/concepts/moonshots-2026-10-05/critic-2026-10-07.md,
// "C3 next stage"). The router reserved ONE hold per request and, when a vendor
// answered `refused` (billed, because the model read the prompt; reroutable,
// because another vendor may draw it), settled that hold into a failed row and
// walked on to the next vendor holding nothing. That vendor was called with no
// ceiling check, and while it ran `heldUsd` did not include it.
//
// Reach: only the dev chains have a second entry, so these drive dev generate
// (agy → google → leonardo) with agy off (LOCAL_BINARIES=off). Google answers a
// 200 carrying `promptFeedback.blockReason` and no image, which its adapter
// raises as `refused`; Leonardo is the re-route target.

test.describe("a billed refusal re-reserves before the next vendor", () => {
  keepEnv(["LEONARDO_API_KEY"]);

  const LEONARDO = "https://cloud.leonardo.ai/api/rest/v1";
  // An IP literal, so the download guard (lib/imaging/safeUrl.ts) decides it
  // without asking DNS: nothing here may leave the process.
  const PLATE_URL = "https://93.184.216.34/plate.jpg";
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  interface Chain {
    google: number;
    leonardoPost: number;
    /** Resolves the held Leonardo POST, when the stub was told to hold it. */
    releasePost?: (r: Response) => void;
  }

  /** Google refuses; Leonardo answers its POST with `post()` (or holds it until
   *  `releasePost`), then completes on the first poll. Every call is counted. */
  function stubChain(post: "hold" | (() => Response)): Chain {
    const chain: Chain = { google: 0, leonardoPost: 0 };
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const method = init?.method ?? "GET";
      if (url.startsWith("https://generativelanguage.googleapis.com/")) {
        chain.google++;
        return json({ promptFeedback: { blockReason: "SAFETY" } });
      }
      if (url === `${LEONARDO}/generations` && method === "POST") {
        chain.leonardoPost++;
        if (post !== "hold") return post();
        return new Promise<Response>((resolve) => {
          chain.releasePost = resolve;
        });
      }
      if (url.startsWith(`${LEONARDO}/generations/`) && method === "DELETE") return json({});
      if (url.startsWith(`${LEONARDO}/generations/`))
        return json({ generations_by_pk: { status: "COMPLETE", generated_images: [{ id: "img-1", url: PLATE_URL }] } });
      if (url === PLATE_URL)
        return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        });
      throw new TypeError(`unexpected fetch in probe: ${method} ${url}`);
    }) as typeof fetch;
    return chain;
  }

  const until = async (cond: () => boolean, what: string) => {
    for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(cond(), what).toBe(true);
  };

  /** A start response with no generation id: Leonardo's adapter raises
   *  `bad-response` at once, so a case that only needs the POST counted
   *  finishes without waiting out a poll. */
  const noGeneration = () => json({ sdGenerationJob: {} });

  test.beforeEach(() => {
    process.env.LEONARDO_API_KEY = "probe-leonardo-key";
  });

  test("9. (critic 1) while the re-route target is in flight, its estimate is held", async () => {
    const estimate = estimatePendingUsd(1);
    const chain = stubChain("hold");

    const pending = generate({ prompt: "probe refused", aspect: "16:9", count: 1 }).catch((e) => e);
    await until(() => chain.leonardoPost === 1, "the Leonardo POST was dispatched");

    const s = await budgetStats();
    console.log(`[holds] google refused, leonardo in flight -> held=$${s.heldUsd} spent=$${s.spentUsd}`);
    expect(chain.google).toBe(1);
    // The refused call is booked (it ran); the call now in flight is HELD.
    expect(s.spentUsd).toBeCloseTo(estimate, 9);
    expect(s.heldUsd).toBeCloseTo(estimate, 9);

    chain.releasePost!(noGeneration());
    await pending;
    expect((await budgetStats()).heldUsd).toBe(0);
  });

  test("10. (critic 2) room for one estimate: the refusal is booked and the re-route is over-budget, never dispatched", async () => {
    const estimate = estimatePendingUsd(1);
    process.env[BUDGET_VAR] = String(estimate * 1.5);
    const chain = stubChain(noGeneration);

    let err: unknown;
    try {
      await generate({ prompt: "probe refused", aspect: "16:9", count: 1 });
    } catch (e) {
      err = e;
    }
    const s = await budgetStats();
    console.log(
      `[holds] ceiling=$${s.ceilingUsd} -> kind=${(err as ImagingError)?.kind} leonardoPost=${chain.leonardoPost} spent=$${s.spentUsd}`,
    );
    expect(err).toBeInstanceOf(ImagingError);
    expect((err as ImagingError).kind).toBe("over-budget");
    expect(chain.google).toBe(1);
    expect(chain.leonardoPost, "the re-route target was called past the ceiling").toBe(0);
    // The window never ends above the ceiling, and nothing is left held.
    expect(s.spentUsd).toBeLessThanOrEqual(s.ceilingUsd);
    expect(s.heldUsd).toBe(0);
    expect(s.counters.refusals).toBe(1);
    expect((await spendRows()).map((r) => `${r.provider}:${r.outcome}`)).toEqual(["google:failed"]);
  });

  test("11. (critic 3) refused → re-routed → served: one failed row, one served row, no hold left", async () => {
    stubChain(() => json({ sdGenerationJob: { generationId: "gen-1" } }));

    const served = await generate({ prompt: "probe refused", aspect: "16:9", count: 1 });
    expect(served.provenance.provider).toBe("leonardo");
    expect(served.provenance.reroutedFrom?.map((s) => `${s.provider}:${s.why}`)).toContain("google:refused");

    const s = await budgetStats();
    const rows = await spendRows();
    console.log(`[holds] refused→served -> rows=${rows.map((r) => `${r.provider}:${r.outcome}`)} held=$${s.heldUsd}`);
    expect(s.heldUsd).toBe(0);
    expect(rows.map((r) => `${r.provider}:${r.outcome}`)).toEqual(["google:failed", "leonardo:served"]);
    expect(s.counters.booked).toBe(2);
    expect(s.counters.bookedFailed).toBe(1);
  });

  test("12. (critic 4) refused, then a chain with no keys left: the honest error, nothing held, nothing refused", async () => {
    // Room for ONE estimate, so a re-reserve taken eagerly (before knowing a
    // vendor is left to call) would be refused and would replace the true
    // headline with a made-up `over-budget`.
    process.env[BUDGET_VAR] = String(estimatePendingUsd(1) * 1.5);
    delete process.env.LEONARDO_API_KEY;
    const chain = stubChain(noGeneration);

    let err: unknown;
    try {
      await generate({ prompt: "probe refused", aspect: "16:9", count: 1 });
    } catch (e) {
      err = e;
    }
    const s = await budgetStats();
    console.log(`[holds] refused then no keys -> kind=${(err as ImagingError)?.kind} refusals=${s.counters.refusals}`);
    expect(err).toBeInstanceOf(ImagingError);
    expect((err as ImagingError).kind).not.toBe("over-budget");
    expect((err as ImagingError).kind).toBe("no-key");
    expect(chain.leonardoPost).toBe(0);
    expect(s.heldUsd).toBe(0);
    expect(s.counters.refusals).toBe(0);
    expect((await spendRows()).map((r) => `${r.provider}:${r.outcome}`)).toEqual(["google:failed"]);
  });
});
