// LANE — BILLED ATTEMPTS (dynamic + one source check).
//
// Acceptance probe for challenge card imaging-service/A (2026-10-10):
// "Only a free call may be retried: one billed-attempt rule for http and router"
//
// The router's meter decides whether a failed vendor attempt cost money
// (`billedOnFailure`: a timeout is billed, a failure the vendor answered is
// billed, a 429 is not). One layer down, http.ts used to answer a different
// question - "is another go worth it" - and re-sent exactly the attempts the
// meter calls billed: a 5xx after the vendor answered, and a timeout it had
// itself marked dispatched. Three dispatches ran under one hold and the ledger
// booked one row, so the meter under-read by up to 3x during an incident.
//
// The invariant pinned here: a vendor work request is never re-sent after an
// attempt the billing rule presumes billed. Retries survive only where they are
// free - a 429 on a work POST, any failure on an idempotent read.
//
// The critic's revision is part of the card: a 503 stays `failed` (dispatched,
// billed, NOT reroutable). Remapping it to `rate-limited` would have opened a
// google -> leonardo reroute edge in dev, which errors.ts argues against.
// Case 7 below guards exactly that edge.

import { test, expect } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keepEnv, stripComments } from "./_helpers";
import { spendRows, __resetBudget, BUDGET_VAR, WINDOW_VAR, FLOOR_VAR } from "@/lib/imaging/budget";
import { ImagingError, presumedBilled } from "@/lib/imaging/errors";
import { leonardoProvider } from "@/lib/imaging/providers/leonardo";
import { ollamaProvider } from "@/lib/imaging/providers/ollama";
import { qwenProvider } from "@/lib/imaging/providers/qwen";
import { billedOnFailure, generate, recognize } from "@/lib/imaging/router";
import { PRICES } from "@/lib/imaging/pricing";

const realFetch = globalThis.fetch;

keepEnv([
  BUDGET_VAR,
  WINDOW_VAR,
  FLOOR_VAR,
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "LEONARDO_API_KEY",
  "OLLAMA_HOST",
  "QWEN_API_KEY",
  "OLLAMA_LEASE_WAIT_MS",
  "GRAVITONE_STORE_PATH",
  "IMAGING_ENV",
]);

const INTERACTIONS = "generativelanguage.googleapis.com";
const LEONARDO = "cloud.leonardo.ai";

/** Every dispatch, by method and URL, so a case can count per endpoint. */
let calls: Array<{ method: string; url: string; model?: string }> = [];
const count = (host: string, method?: string) =>
  calls.filter((c) => c.url.includes(host) && (!method || c.method === method)).length;

/** Install a fetch stub that records each dispatch and answers from `answer`. */
function stubFetch(answer: (n: number, url: string, method: string) => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ method, url });
    return answer(calls.length, url, method);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const status = (code: number) => new Response(`vendor said ${code}`, { status: code, headers: { "content-type": "text/plain" } });
const googleImage = () => json({ status: "completed", output_image: { data: "AQID", mime_type: "image/jpeg" } });
const abort = () => {
  const e = new Error("The operation was aborted.");
  e.name = "AbortError";
  return Promise.reject(e);
};

async function failure(p: Promise<unknown>): Promise<ImagingError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ImagingError);
    return e as ImagingError;
  }
  throw new Error("expected the request to fail");
}

test.beforeEach(() => {
  __resetBudget();
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  delete process.env[FLOOR_VAR];
  delete process.env.OLLAMA_HOST;
  delete process.env.LEONARDO_API_KEY;
  process.env.IMAGING_ENV = "dev";
  process.env.LOCAL_BINARIES = "off"; // agy unavailable: google leads the dev generate chain
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

test("1. google 500 every time -> 1 dispatch, `failed` dispatched, 1 failed estimate row", async () => {
  stubFetch(() => status(500));
  const err = await failure(generate({ prompt: "probe 500", aspect: "16:9", count: 1 }));
  expect(count(INTERACTIONS)).toBe(1);
  expect(err.kind).toBe("failed");
  expect(err.dispatched).toBe(true);
  const rows = await spendRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe("failed");
  expect(rows[0].basis).toBe("estimate");
});

test("2. google times out every time -> 1 dispatch, `timeout`, 1 failed row at $0.045", async () => {
  stubFetch(() => abort());
  const err = await failure(generate({ prompt: "probe timeout", aspect: "16:9", count: 1 }));
  expect(count(INTERACTIONS)).toBe(1);
  expect(err.kind).toBe("timeout");
  const rows = await spendRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe("failed");
  expect(rows[0].usd).toBeCloseTo(0.045, 6);
});

test("3. google 500 then 200 -> booked rows equal billed dispatches: 1 dispatch, 1 failed row, no blind second call", async () => {
  stubFetch((n) => (n === 1 ? status(500) : googleImage()));
  const err = await failure(generate({ prompt: "probe 500 then ok", aspect: "16:9", count: 1 }));
  expect(err.kind).toBe("failed");
  expect(count(INTERACTIONS)).toBe(1);
  const rows = await spendRows();
  expect(rows.map((r) => r.outcome)).toEqual(["failed"]);
  expect(rows).toHaveLength(count(INTERACTIONS));
});

test("4. $0.05 ceiling, google 500 every time -> at most one dispatch under the single $0.045 hold", async () => {
  process.env[BUDGET_VAR] = "0.05";
  stubFetch(() => status(500));
  await failure(generate({ prompt: "probe ceiling", aspect: "16:9", count: 1 }));
  expect(count(INTERACTIONS)).toBe(1);
  const rows = await spendRows();
  expect(rows).toHaveLength(1);
});

test("5. leonardo start POST answers 500 -> exactly 1 POST /generations", async () => {
  delete process.env.GOOGLE_AI_API_KEY; // dev chain: agy (off) -> google (no key) -> leonardo
  process.env.LEONARDO_API_KEY = "probe-leonardo-key";
  stubFetch(() => status(500));
  const err = await failure(generate({ prompt: "probe leonardo", aspect: "16:9", count: 1 }));
  expect(err.provider).toBe("leonardo");
  expect(count(LEONARDO, "POST")).toBe(1);
  expect(await spendRows()).toHaveLength(1);
});

test("6. [guard] google 429 then 200 -> 2 dispatches, served, 1 served row, 0 failed rows", async () => {
  stubFetch((n) => (n === 1 ? status(429) : googleImage()));
  const out = await generate({ prompt: "probe 429", aspect: "16:9", count: 1 });
  expect(out.images).toHaveLength(1);
  expect(count(INTERACTIONS)).toBe(2);
  const rows = await spendRows();
  expect(rows.map((r) => r.outcome)).toEqual(["served"]);
});

test("7. [guard, critic] dev with a Leonardo key, google answers 503 -> 0 Leonardo calls, `failed`, 1 google dispatch", async () => {
  process.env.LEONARDO_API_KEY = "probe-leonardo-key";
  stubFetch(() => status(503));
  const err = await failure(generate({ prompt: "probe 503", aspect: "16:9", count: 1 }));
  expect(count(LEONARDO)).toBe(0);
  expect(err.kind).toBe("failed");
  expect(err.reroutable).toBe(false);
  expect(count(INTERACTIONS)).toBe(1);
});

test("8. [guard] leonardo poll GET with one transient 500 then COMPLETE -> served", async () => {
  test.setTimeout(30_000); // two real 3 s poll intervals
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LEONARDO_API_KEY = "probe-leonardo-key";
  let polls = 0;
  stubFetch((_n, url, method) => {
    if (method === "POST") return json({ sdGenerationJob: { generationId: "gen-probe", apiCreditCost: 10 } });
    if (method === "DELETE") return json({});
    if (url.includes("/generations/gen-probe")) {
      polls++;
      return polls === 1
        ? status(500)
        : json({ generations_by_pk: { status: "COMPLETE", generated_images: [{ url: "https://93.184.216.34/plate.png" }] } });
    }
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
  });
  const out = await generate({ prompt: "probe poll", aspect: "16:9", count: 1 });
  expect(out.images).toHaveLength(1);
  expect(count(LEONARDO, "POST")).toBe(1);
  expect(polls).toBe(2);
});

test("11. google answers 200 and the body breaks mid-read -> `failed` dispatched, 1 failed row, no second dispatch", async () => {
  // The headers arrived, so the vendor took the request and ran it; only the
  // download of its answer failed. That is not "could not be reached".
  stubFetch(
    () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.error(new TypeError("terminated"));
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
  const err = await failure(generate({ prompt: "probe body cut", aspect: "16:9", count: 1 }));
  expect(count(INTERACTIONS)).toBe(1);
  expect(err.kind).toBe("failed");
  expect(err.dispatched, "a request the vendor answered was booked as never sent").toBe(true);
  const rows = await spendRows();
  expect(rows.map((r) => r.outcome)).toEqual(["failed"]);
});

test("12. leonardo started the generation, then its poll reports FAILED -> `failed` dispatched, 1 failed row", async () => {
  // Leonardo charges at the start (the credit figure rides on the start answer), so a
  // generation the poll later reports FAILED was billed. providers/leonardoFlare.ts books
  // the same terminal status as dispatched; the Lucid Origin adapter must agree.
  test.setTimeout(30_000); // one real 3 s poll interval
  delete process.env.GOOGLE_AI_API_KEY;
  process.env.LEONARDO_API_KEY = "probe-leonardo-key";
  stubFetch((_n, url, method) => {
    if (method === "POST") return json({ sdGenerationJob: { generationId: "gen-failed", apiCreditCost: 10 } });
    if (method === "DELETE") return json({});
    return json({ generations_by_pk: { status: "FAILED" } });
  });
  const err = await failure(generate({ prompt: "probe poll failed", aspect: "16:9", count: 1 }));
  expect(err.provider).toBe("leonardo");
  expect(err.kind).toBe("failed");
  expect(err.dispatched, "a generation Leonardo started and charged for was booked as never sent").toBe(true);
  expect(count(LEONARDO, "POST")).toBe(1);
  const rows = await spendRows();
  expect(rows.map((r) => r.outcome)).toEqual(["failed"]);
});

test("19. leonardo started the generation, then every poll answers 401 -> the give-up carries the 401 sentence", async () => {
  // Same rule the video and Flare adapters keep: polls that all failed must not read as a slow vendor.
  process.env.LEONARDO_API_KEY = "probe-leonardo-key";
  stubFetch((_n, url, method) => {
    if (method === "POST") return json({ sdGenerationJob: { generationId: "gen-401", apiCreditCost: 10 } });
    if (method === "DELETE") return json({});
    return json({ error: "Invalid authentication token" }, 401);
  });
  const p = leonardoProvider({ sleep: async () => undefined, pollMs: 1, maxPolls: 3 });
  const err = await failure(p.generate({ prompt: "probe poll 401", aspect: "16:9", count: 1 }));
  expect(err.kind).toBe("timeout");
  expect(err.message, "the polls' own failure was dropped").toMatch(/Invalid authentication token/);
  expect(err.message).toMatch(/last poll failed/);
});

/** The Ollama eye takes the card's lease from the kernel store: a temp store per case. */
async function withLeaseStore(fn: () => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "billed-ollama-"));
  process.env.GRAVITONE_STORE_PATH = join(dir, "gravitone.sqlite");
  process.env.OLLAMA_HOST = "http://ollama.probe";
  process.env.OLLAMA_LEASE_WAIT_MS = "0";
  try {
    await fn();
  } finally {
    const { closeProcessKernel } = await import("@gt/kernel/process");
    closeProcessKernel();
    rmSync(dir, { recursive: true, force: true });
  }
}

const RECOGNIZE = { image: { base64: "AQID", mime: "image/png" as const }, instruction: "describe" };

test("13. ollama daemon unreachable -> 1 dispatch attempt, not a second one without `think`", async () => {
  // The retry without `think` exists for ONE answer: a model with no thinking mode
  // rejecting the key. A host that never answered is not that answer.
  await withLeaseStore(async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    const err = await failure(ollamaProvider().recognize!(RECOGNIZE));
    expect(err.kind).toBe("failed");
    expect(err.dispatched).toBe(false);
    expect(count("ollama.probe"), "an unreachable daemon was asked twice").toBe(1);
  });
});

test("14. [guard] ollama rejects `think` with a 400 -> one retry without it, served", async () => {
  await withLeaseStore(async () => {
    const bodies: string[] = [];
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ method: (init?.method ?? "GET").toUpperCase(), url });
      bodies.push(String(init?.body ?? ""));
      return calls.length === 1
        ? json({ error: '"qwen3.8:27b" does not support thinking' }, 400)
        : json({ message: { content: "a local answer" } });
    }) as typeof fetch;
    const out = await ollamaProvider().recognize!(RECOGNIZE);
    expect(out.text).toBe("a local answer");
    expect(count("ollama.probe")).toBe(2);
    expect(JSON.parse(bodies[0]).think).toBe(false);
    expect("think" in JSON.parse(bodies[1])).toBe(false);
  });
});

test("15. qwen rotates SKUs on a 429 or empty content, never on a 400; each SKU is asked once", async () => {
  process.env.QWEN_API_KEY = "probe-qwen-key";
  const QWEN = "aliyuncs.com";
  const asked = () => calls.filter((c) => c.url.includes(QWEN)).map((c) => c.model);
  const stubQwen = (answer: (model: string) => Response) => {
    calls = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const model = String((JSON.parse(String(init?.body ?? "{}")) as { model?: string }).model);
      calls.push({ method: (init?.method ?? "GET").toUpperCase(), url, model });
      return answer(model);
    }) as typeof fetch;
  };
  const answer = (content: string) => json({ choices: [{ message: { content } }] });

  // 429 on the primary, then served by the first fallback.
  stubQwen((m) => (m === "qwen3.8-max" ? status(429) : answer("a qwen answer")));
  const served = await qwenProvider().recognize!(RECOGNIZE);
  expect(served.provenance.model).toBe("qwen3.7-plus");
  expect(asked()).toEqual(["qwen3.8-max", "qwen3.7-plus"]);

  // Empty content is a soft failure: the next SKU is asked.
  stubQwen((m) => (m === "qwen3.6-flash" ? answer("the last SKU") : answer("  ")));
  expect((await qwenProvider().recognize!(RECOGNIZE)).text).toBe("the last SKU");
  expect(asked()).toEqual(["qwen3.8-max", "qwen3.7-plus", "qwen3.6-flash"]);

  // A 400 fails identically on every SKU: thrown at once.
  stubQwen(() => status(400));
  const err = await failure(qwenProvider().recognize!(RECOGNIZE));
  expect(err.kind).toBe("failed");
  expect(asked(), "a malformed request was re-sent to the fallback SKUs").toEqual(["qwen3.8-max"]);
});

test("16. an estimate-basis row names the price row it was costed with (served and failed)", async () => {
  // A row booked at basis `estimate` must stay explicable after PRICES is
  // repriced and re-dated: it records provider/model@checked of the row used.
  const rowOf = (ref: string | undefined) => PRICES.find((p) => `${p.provider}/${p.model}@${p.checked}` === ref);

  stubFetch(() => googleImage());
  await generate({ prompt: "probe served", aspect: "16:9", count: 1 });
  let rows = await spendRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].basis).toBe("estimate");
  const served = rowOf(rows[0].price);
  expect(served, `served estimate row names no PRICES row: ${rows[0].price}`).toBeDefined();
  expect([served?.provider, served?.model]).toEqual([rows[0].provider, rows[0].model]);

  __resetBudget();
  stubFetch(() => status(500));
  await failure(generate({ prompt: "probe 500", aspect: "16:9", count: 1 }));
  rows = await spendRows();
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe("failed");
  const standIn = rowOf(rows[0].price);
  expect(standIn, `failed estimate row names no PRICES row: ${rows[0].price}`).toBeDefined();
  expect(standIn?.usdPerImage).toBe(rows[0].usd);
});

test("17. google count 3, one call refused or 500 -> the 2 paid images are kept and the provenance names the loss", async () => {
  const refused = () => json({ status: "failed", error: { message: "blocked by safety" } });
  stubFetch((n) => (n === 2 ? refused() : googleImage()));
  const out = await generate({ prompt: "probe batch", aspect: "16:9", count: 3 });
  expect(count(INTERACTIONS)).toBe(3);
  expect(out.images, "a refusal on one call discarded the images the others returned").toHaveLength(2);
  expect(out.provenance.shortBatch).toEqual({ asked: 3, returned: 2, refused: 1, failed: 0 });
  expect(out.provenance.reroutedFrom?.map((r) => r.provider) ?? [], "a short batch was re-routed to a second vendor").not.toContain("google");

  __resetBudget();
  stubFetch((n) => (n === 3 ? status(500) : googleImage()));
  const out2 = await generate({ prompt: "probe batch 500", aspect: "16:9", count: 3 });
  expect(out2.images).toHaveLength(2);
  expect(out2.provenance.shortBatch).toEqual({ asked: 3, returned: 2, refused: 0, failed: 1 });

  // The whole batch refused is still a refusal, not an empty success.
  __resetBudget();
  stubFetch(() => refused());
  await failure(generate({ prompt: "probe all refused", aspect: "16:9", count: 3 }));
  expect(count(INTERACTIONS), "the refused batch was re-sent").toBe(3);
});

test("17b. [guard] a full batch carries no shortBatch", async () => {
  stubFetch(() => googleImage());
  const out = await generate({ prompt: "probe full", aspect: "16:9", count: 2 });
  expect(out.images).toHaveLength(2);
  expect(out.provenance.shortBatch).toBeUndefined();
});

test("18. an empty Ollama recognition is not a served judgement and is not re-sent to a billed eye", async () => {
  // google.ts refuses an empty recognition and qwen rotates on one; the local eye
  // used to resolve text "" as a green, empty judgement. `bad-response` is not
  // reroutable, so the empty local read stops here instead of spending on Google.
  await withLeaseStore(async () => {
    stubFetch(() => json({ message: { content: "  " } }));
    const err = await failure(ollamaProvider().recognize!(RECOGNIZE));
    expect(err.kind).toBe("bad-response");
    expect(err.reroutable).toBe(false);

    stubFetch((_n, url) => (url.includes("ollama.probe") ? json({ message: { content: "" } }) : googleImage()));
    const viaRouter = await failure(recognize(RECOGNIZE));
    expect(viaRouter.kind).toBe("bad-response");
    expect(count("ollama.probe")).toBe(1);
    expect(count(INTERACTIONS), "an empty local read was sent to the billed cloud eye").toBe(0);
  });
});

test("9. one authority: the router's billing predicate IS errors.ts's presumedBilled", () => {
  expect(billedOnFailure).toBe(presumedBilled);
});

test("10. wiring: http.ts consults presumedBilled; every vendor work POST is marked billable", () => {
  const src = (p: string) => stripComments(readFileSync(join(process.cwd(), p), "utf8"));
  const http = src("lib/imaging/http.ts");
  expect(http).toMatch(/import\s*\{[^}]*\bpresumedBilled\b[^}]*\}\s*from\s*"\.\/errors"/);
  expect(http).toMatch(/billable\s*&&\s*presumedBilled\(/);

  // google: generate/edit share one POST (runImage), recognize has its own.
  const google = src("lib/imaging/providers/google.ts");
  const googlePosts = google.match(/requestJson<[^>]*>\("google",\s*ENDPOINT,\s*\{[\s\S]*?\}\)/g) ?? [];
  expect(googlePosts.length).toBe(2);
  for (const call of googlePosts) expect(call).toMatch(/billable:\s*true/);

  // leonardo: the start POST is billable; the poll GET and cleanup DELETE are not.
  const leonardo = src("lib/imaging/providers/leonardo.ts");
  const start = leonardo.match(/requestJson<StartResponse>\([\s\S]*?\n\s*\}\);/)?.[0] ?? "";
  expect(start).toMatch(/billable:\s*true/);
  expect(leonardo.match(/billable:\s*true/g) ?? []).toHaveLength(1);
});
