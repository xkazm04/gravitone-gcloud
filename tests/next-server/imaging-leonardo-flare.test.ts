// LEONARDO FLARE, OFFLINE (plan humble-soaring-wave WP-A) - the adapter over a stubbed global
// fetch and a fake resolver: no network, no key of the operator's, no sleeping. What it pins: the
// v2 body (model, LOW, the size by aspect, no style ids), the v1 poll to COMPLETE, the three
// grades of cost (reported credits, balance delta, the table's fallback), a vendor's 4xx sentence
// kept and redacted, a FAILED and a timed-out generation named by id, and the router reaching
// `leonardo-flare` only when a request names it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ImagingError } from "../../lib/imaging/errors.ts";
import { FLARE_MODEL, FLARE_PX, flareBody, flareCreditsOf, leonardoFlareProvider, type FlareProvenance } from "../../lib/imaging/providers/leonardoFlare.ts";
import { isPreferOnly, orderFor, planFor } from "../../lib/imaging/router.ts";
import { USD_PER_CREDIT } from "../../lib/imaging/video/pricing.ts";
import { TABLES } from "@gt/kernel/router/tables";

const KEY = "lk-test-0123456789abcdef-SECRET";
const API = "https://cloud.leonardo.ai/api/rest";
const IMG = "https://cdn.leonardo.ai/users/u/generations/g-1/flare.png";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const resolve = async (): Promise<{ address: string }[]> => [{ address: "93.184.216.34" }];

type Call = { method: string; url: string; body?: Record<string, unknown> };
type Reply = { status?: number; json?: unknown; text?: string; bytes?: Uint8Array<ArrayBuffer>; type?: string };

/** A scripted Leonardo: each url+method answers from its queue, the last answer repeating. */
function fakeLeonardo(script: Record<string, Reply[]>): { calls: Call[]; fetch: typeof fetch } {
  const calls: Call[] = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? "GET";
    calls.push({ method, url, ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) as Record<string, unknown> } : {}) });
    const q = script[`${method} ${url}`];
    const r = q === undefined ? { status: 404, text: "no such route" } : q.length > 1 ? (q.shift() as Reply) : (q[0] as Reply);
    if (r.bytes !== undefined) return new Response(r.bytes, { status: r.status ?? 200, headers: { "content-type": r.type ?? "image/png" } });
    return new Response(r.text ?? JSON.stringify(r.json ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetch: fetchFn };
}

const pending = { json: { generations_by_pk: { status: "PENDING", generated_images: [] } } };
const complete = { json: { generations_by_pk: { status: "COMPLETE", generated_images: [{ id: "i-1", url: IMG }] } } };
const started = (extra: Record<string, unknown> = {}) => ({ json: { generate: { generationId: "g-1", ...extra } } });

function happy(start: Reply, me: Reply[] = [{ json: { user_details: [{ subscriptionTokens: 1000, paidTokens: 50, apiPaidTokens: 200 }] } }]): Record<string, Reply[]> {
  return {
    [`GET ${API}/v1/me`]: me,
    [`POST ${API}/v2/generations`]: [start],
    [`GET ${API}/v1/generations/g-1`]: [pending, complete],
    [`DELETE ${API}/v1/generations/g-1`]: [{ json: { delete_generations_by_pk: { id: "g-1" } } }],
    [`GET ${IMG}`]: [{ bytes: PNG }],
  };
}

const provider = (limitMs?: number) => leonardoFlareProvider({ resolve, sleep: async () => undefined, pollMs: 5_000, ...(limitMs === undefined ? {} : { limitMs }) });
const REQ = { prompt: "a lighthouse on a cliff at dusk, flat colour poster", aspect: "16:9" as const, count: 1, seed: 7 };

async function failure(p: Promise<unknown>): Promise<ImagingError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ImagingError) return e;
    throw e;
  }
  throw new Error("expected the call to fail");
}

beforeEach(() => {
  vi.stubEnv("LEONARDO_API_KEY", KEY);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the v2 body", () => {
  it("names the model, sends LOW at the API's smallest listed sizes, OFF enhance, one image, the seed, and no style ids", () => {
    const b = flareBody({ ...REQ, negativePrompt: "text, watermark" });
    expect(b).toEqual({
      model: "openai/gpt-image-2.5-flare",
      public: false,
      parameters: { width: 1376, height: 768, prompt_enhance: "OFF", quality: "LOW", quantity: 1, seed: 7, prompt: `${REQ.prompt}\n\nAvoid: text, watermark.` },
    });
    expect(JSON.stringify(b)).not.toMatch(/style_ids/);
    expect(FLARE_PX).toEqual({ "16:9": { w: 1376, h: 768 }, "9:16": { w: 768, h: 1376 }, "1:1": { w: 1024, h: 1024 }, "4:5": { w: 1024, h: 1280 } });
    // Every side is one the API lists (its VALIDATION_ERROR of 2026-10-22 named the set).
    const LISTED = new Set([640, 672, 768, 832, 848, 864, 896, 928, 1024, 1136, 1152, 1184, 1200, 1248, 1264, 1280, 1344, 1376, 1536]);
    for (const { w, h } of Object.values(FLARE_PX)) expect([LISTED.has(w), LISTED.has(h)]).toEqual([true, true]);
    expect("seed" in (flareBody({ prompt: "p", aspect: "1:1" }).parameters as object)).toBe(false);
  });
});

describe("one generation, offline", () => {
  it("creates, polls to COMPLETE, downloads, deletes, and books the credits the API reported", async () => {
    const w = fakeLeonardo(happy(started({ cost: { amount: 4, unit: "CREDITS" } })));
    vi.stubGlobal("fetch", w.fetch);
    const out = await provider().generate!(REQ);
    const post = w.calls.find((c) => c.method === "POST");
    expect(post?.url).toBe(`${API}/v2/generations`);
    expect(post?.body).toEqual(flareBody(REQ));
    expect(w.calls.filter((c) => c.url === `${API}/v1/generations/g-1` && c.method === "GET")).toHaveLength(2);
    expect(w.calls.some((c) => c.method === "DELETE")).toBe(true);
    // A reported figure needs no second balance read.
    expect(w.calls.filter((c) => c.url.endsWith("/v1/me"))).toHaveLength(1);
    expect(out.images).toEqual([{ base64: Buffer.from(PNG).toString("base64"), mime: "image/png", width: 1376, height: 768 }]);
    const p = out.provenance as FlareProvenance;
    expect(p).toMatchObject({ provider: "leonardo-flare", model: FLARE_MODEL, modelBasis: "requested", remoteIds: ["g-1"], costBasis: "vendor-reported", cleanup: "deleted", credits: 4, creditsSource: "api" });
    expect(p.costUsd).toBeCloseTo(4 * USD_PER_CREDIT, 10);
    expect(flareCreditsOf(p)).toBe(4);
    expect(JSON.stringify(out.provenance)).not.toContain(KEY);
  });

  it("without a reported figure, books the balance delta across the call, labelled an estimate", async () => {
    const me = (n: number): Reply => ({ json: { user_details: [{ subscriptionTokens: n, apiPaidTokens: 100, email: "x" }] } });
    const w = fakeLeonardo(happy(started(), [me(1000), me(997)]));
    vi.stubGlobal("fetch", w.fetch);
    const p = (await provider().generate!(REQ)).provenance as FlareProvenance;
    expect(p).toMatchObject({ credits: 3, creditsSource: "balance", costBasis: "estimated" });
    expect(p.costUsd).toBeCloseTo(3 * USD_PER_CREDIT, 10);
  });

  it("with neither, falls back to the pricing table's 6 credits, labelled an estimate", async () => {
    const w = fakeLeonardo(happy(started(), [{ status: 500, text: "down" }]));
    vi.stubGlobal("fetch", w.fetch);
    const p = (await provider().generate!(REQ)).provenance as FlareProvenance;
    expect(p).toMatchObject({ credits: 6, creditsSource: "fallback", costBasis: "estimated" });
    expect(p.costUsd).toBeCloseTo(6 * USD_PER_CREDIT, 10);
  });

  it("a 4xx keeps the vendor's own sentence, with the key redacted from the message and the detail", async () => {
    const w = fakeLeonardo({
      ...happy(started()),
      [`POST ${API}/v2/generations`]: [{ status: 400, json: { error: `quality MEDIUM is not on this plan (key ${KEY})` } }],
    });
    vi.stubGlobal("fetch", w.fetch);
    const e = await failure(provider().generate!(REQ));
    expect(e.kind).toBe("failed");
    expect(e.provider).toBe("leonardo-flare");
    expect(e.dispatched).toBe(true);
    expect(e.message).toContain("Leonardo said: quality MEDIUM is not on this plan (key [redacted])");
    expect(e.message).not.toContain(KEY);
    expect(JSON.stringify(e.detail)).not.toContain(KEY);
    // One POST: a refused start is not re-sent.
    expect(w.calls.filter((c) => c.method === "POST")).toHaveLength(1);
  });

  it("a 200 carrying a validation error array is the vendor's sentence, dug out of its nesting", async () => {
    const body = [{ message: "Bad Request", extensions: { code: "BadRequestException", details: { code: "VALIDATION_ERROR", errors: [{ code: "VALIDATION_ERROR", message: "parameters.height must be one of: 640, 672, 768" }] } } }];
    const w = fakeLeonardo({ ...happy(started()), [`POST ${API}/v2/generations`]: [{ json: body }] });
    vi.stubGlobal("fetch", w.fetch);
    const e = await failure(provider().generate!(REQ));
    expect(e.kind).toBe("failed");
    expect(e.message).toBe("Leonardo Flare refused the request: Bad Request | parameters.height must be one of: 640, 672, 768");
    expect(w.calls.some((c) => c.method === "DELETE" || c.url.includes("/v1/generations/"))).toBe(false);
  });

  it("a FAILED generation is the vendor's sentence and its id; the generation is still deleted", async () => {
    const w = fakeLeonardo({ ...happy(started()), [`GET ${API}/v1/generations/g-1`]: [{ json: { generations_by_pk: { status: "FAILED", error: "upstream model error" } } }] });
    vi.stubGlobal("fetch", w.fetch);
    const e = await failure(provider().generate!(REQ));
    expect(e.kind).toBe("failed");
    expect(e.message).toBe("Leonardo Flare reported generation g-1 FAILED: upstream model error");
    expect(w.calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("gives up at the limit with a sentence naming the generation id", async () => {
    const w = fakeLeonardo({ ...happy(started()), [`GET ${API}/v1/generations/g-1`]: [pending] });
    vi.stubGlobal("fetch", w.fetch);
    const e = await failure(provider(15_000).generate!(REQ));
    expect(e.kind).toBe("timeout");
    expect(e.message).toBe("Leonardo Flare did not finish generation g-1 within 15 s.");
    expect(w.calls.filter((c) => c.url === `${API}/v1/generations/g-1` && c.method === "GET")).toHaveLength(3);
    // The default limit is bp's 180 s at a 5 s poll.
    const w2 = fakeLeonardo({ ...happy(started()), [`GET ${API}/v1/generations/g-1`]: [pending] });
    vi.stubGlobal("fetch", w2.fetch);
    expect((await failure(provider().generate!(REQ))).message).toBe("Leonardo Flare did not finish generation g-1 within 180 s.");
  });

  it("when every poll errors, the give-up carries the last poll's sentence, key redacted", async () => {
    const w = fakeLeonardo({ ...happy(started()), [`GET ${API}/v1/generations/g-1`]: [{ status: 401, json: { error: `Invalid authentication token ${KEY}` } }] });
    vi.stubGlobal("fetch", w.fetch);
    const e = await failure(provider(15_000).generate!(REQ));
    expect(e.kind).toBe("timeout");
    expect(e.message).toMatch(/^Leonardo Flare did not finish generation g-1 within 15 s\./);
    expect(e.message).toMatch(/Invalid authentication token/);
    expect(e.message).not.toContain(KEY);
  });

  it("refuses more than one image and an over-long prompt before anything is sent", async () => {
    const w = fakeLeonardo(happy(started()));
    vi.stubGlobal("fetch", w.fetch);
    expect((await failure(provider().generate!({ ...REQ, count: 2 }))).kind).toBe("invalid-request");
    expect((await failure(provider().generate!({ ...REQ, prompt: "x".repeat(2001) }))).kind).toBe("invalid-request");
    expect(w.calls).toEqual([]);
  });
});

describe("the router", () => {
  it("serves leonardo-flare only when a request names it, and alone; the plans are unchanged", () => {
    expect(isPreferOnly("leonardo-flare")).toBe(true);
    for (const env of ["dev", "prod"] as const) {
      for (const cap of ["generate", "edit", "recognize"] as const) {
        expect(planFor(cap, env)).not.toContain("leonardo-flare");
        expect(orderFor(cap, {}, env)).not.toContain("leonardo-flare");
        expect(orderFor(cap, { prefer: "google" }, env)).not.toContain("leonardo-flare");
      }
      expect(orderFor("generate", { prefer: "leonardo-flare" }, env)).toEqual(["leonardo-flare"]);
    }
    expect(planFor("generate", "dev")).toEqual(["agy", "google", "leonardo"]);
    expect(planFor("generate", "prod")).toEqual(["google"]);
    expect(orderFor("generate", { prefer: "leonardo-flare", avoid: "leonardo-flare" }, "dev")).not.toContain("leonardo-flare");
  });

  it("the kernel table carries the same row, prefer-only on Leonardo's lane, out of every plan", () => {
    const row = TABLES.image.candidates.find((c) => c.provider === "leonardo-flare");
    expect(row).toMatchObject({ capabilities: ["generate"], lane: "cloud.leonardo", preferOnly: true, models: { generate: FLARE_MODEL }, bills: { generate: "image" }, credential: "LEONARDO_API_KEY" });
    expect(TABLES.image.plans).toEqual({
      dev: { generate: ["agy", "google", "leonardo"], edit: ["google"], recognize: ["ollama", "google"] },
      prod: { generate: ["google"], edit: ["google"], recognize: ["google"] },
    });
  });
});
