// LANE — IMAGING-BUDGET-FORECAST (dynamic).
//
// Acceptance probe for Card 7 (Wave 2, Card 2):
// "Frames spends into the budget ceiling blind and stops with no time to resume"
//
// 1. budgetQuote({images: 16, now: T}) with $0.72 spent on 2 rows expiring at T+10s and T+20s, under a $1 ceiling where estimatePerImage is $0.045: remainingUsd is 0.28, estimateUsd is 0.72, affordableImages is 6, verdict is 'partial', and resumeAt is T+20s.
// 2. Same call with $0.90 spent on 1 row expiring at T+60s: affordableImages is 2, verdict is 'partial', resumeAt is T+60s.
// 3. Same call with $0.99 spent on 1 row expiring at T+30s: affordableImages is 0, verdict is 'blocked', resumeAt is T+30s.
// 4. Same call with $0.10 spent on 1 row: affordableImages is 16, verdict is 'fits', resumeAt is null.
// 5. With no priced providers configured: verdict is 'unknown', estimateUsd is null, affordableImages is 16.
// 6. errorResponse(new ImagingError('budget', ...)) has HTTP status 402, JSON body carrying code: 'over-budget', retryAt: number, and header Retry-After: string.
// 7. imagingClient with globalThis.fetch stubbed: a 402 body {detail, code:'over-budget', retryAt:123} -> generateImage rejects with ImagingRequestError {code:'over-budget', status:402, retryAt:123}; a 422 body {code:'refused', provider:'google'} -> the error's provider is 'google' (today both fields are dropped).
// 8. (Critic revision):
//   - renderPlan.planRender({missing:16, quote:{verdict:'partial', affordableImages:4, estimateUsd:0.72, resumeAt:T}}) -> {count:4, label containing '4 of 16', resumeAt:T}; with quote verdict 'unknown' (no per-image rate) -> {count:16} and a label with no '$' figure, never '$0.00'.
//   - renderPlan.afterOutcome('over-budget', retryAt:T) -> {action:'pause-until', until:T}, distinct from afterOutcome('failed') -> {action:'stop'}.
//   - GET handler of app/api/imaging/budget/route.ts uses guardAccessOnly (from lib/apiAuth.ts) instead of guardRequest (apiAuth.ts:422-433: budget check doesn't spend rate limit). Without access header -> 401; with it -> returns 200 with {ceilingUsd, spentUsd, remainingUsd, windowMs, perImageUsd, quote}. 40 authorised GETs in a row leave rateLimit(clientIp) unconsumed so following POST /api/imaging/generate is not 429.

import { test, expect } from "@playwright/test";
import { keepEnv } from "./_helpers";
import {
  BUDGET_VAR,
  WINDOW_VAR,
  recordSpend,
  __resetBudget,
} from "@/lib/imaging/budget";
import { budgetQuote } from "@/lib/imaging/budgetForecast";
import { ImagingError } from "@/lib/imaging/errors";
import { errorResponse } from "@/lib/imaging/api";
import { generateImage, ImagingRequestError } from "@/lib/imagingClient";
import { planRender, afterOutcome } from "@/app/_phases/frames/renderPlan";
import { GET as budgetGET } from "@/app/api/imaging/budget/route";
import { POST as generatePOST } from "@/app/api/imaging/generate/route";
import { ACCESS_SECRET_VAR, __resetRateLimit } from "@/lib/apiAuth";

const realFetch = globalThis.fetch;

keepEnv([
  BUDGET_VAR,
  WINDOW_VAR,
  ACCESS_SECRET_VAR,
  "LOCAL_BINARIES",
  "GOOGLE_AI_API_KEY",
  "OLLAMA_HOST",
]);

test.beforeEach(() => {
  __resetBudget();
  __resetRateLimit();
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  delete process.env[ACCESS_SECRET_VAR];
  delete process.env.OLLAMA_HOST;
  process.env.LOCAL_BINARIES = "off";
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

const book = (usd: number, at: number) =>
  recordSpend({
    usd,
    cap: "generate",
    provider: "google",
    model: "probe-model",
    outcome: "served",
    basis: "vendor",
    at,
  });

test("1. budgetQuote({images: 16, now: T}) with $0.72 spent on 2 rows expiring at T+10s and T+20s", () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "60000";
  const T = 1_000_000;
  // Two rows expiring at T+10s (T+10,000) and T+20s (T+20,000)
  book(0.36, T - 50_000);
  book(0.36, T - 40_000);

  const quote = budgetQuote({ images: 16, now: T });
  expect(quote.remainingUsd).toBe(0.28);
  expect(quote.estimateUsd).toBe(0.72);
  expect(quote.affordableImages).toBe(6);
  expect(quote.verdict).toBe("partial");
  expect(quote.resumeAt).toBe(T + 20_000);
});

test("2. budgetQuote with $0.90 spent on 1 row expiring at T+60s", () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "120000";
  const T = 1_000_000;
  book(0.90, T - 60_000);

  const quote = budgetQuote({ images: 16, now: T });
  expect(quote.remainingUsd).toBe(0.10);
  expect(quote.affordableImages).toBe(2);
  expect(quote.verdict).toBe("partial");
  expect(quote.resumeAt).toBe(T + 60_000);
});

test("3. budgetQuote with $0.99 spent on 1 row expiring at T+30s", () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "60000";
  const T = 1_000_000;
  book(0.99, T - 30_000);

  const quote = budgetQuote({ images: 16, now: T });
  expect(quote.remainingUsd).toBe(0.01);
  expect(quote.affordableImages).toBe(0);
  expect(quote.verdict).toBe("blocked");
  expect(quote.resumeAt).toBe(T + 30_000);
});

test("4. budgetQuote with $0.10 spent on 1 row: fits and resumeAt is null", () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "60000";
  const T = 1_000_000;
  book(0.10, T - 10_000);

  const quote = budgetQuote({ images: 16, now: T });
  expect(quote.remainingUsd).toBe(0.90);
  expect(quote.affordableImages).toBe(16);
  expect(quote.verdict).toBe("fits");
  expect(quote.resumeAt).toBeNull();
});

test("5. budgetQuote with no priced providers configured: verdict is 'unknown', estimateUsd is null, affordableImages is 16", () => {
  process.env[BUDGET_VAR] = "1.00";
  const T = 1_000_000;
  const quote = budgetQuote({
    images: 16,
    now: T,
    overrideEstimate: { basis: "unpriced", note: "No priced providers configured" },
  });
  expect(quote.verdict).toBe("unknown");
  expect(quote.estimateUsd).toBeNull();
  expect(quote.affordableImages).toBe(16);
});

test("6. errorResponse(new ImagingError('budget', ...)) has HTTP status 402, code 'over-budget', retryAt, and Retry-After header", async () => {
  process.env[WINDOW_VAR] = "60000";
  const T = 1_000_000;
  book(0.50, T - 30_000);

  const err = new ImagingError("budget", "over-budget");
  const res = errorResponse(err, T);
  expect(res.status).toBe(402);
  const json = await res.json();
  expect(json.code).toBe("over-budget");
  expect(typeof json.retryAt).toBe("number");
  expect(typeof res.headers.get("retry-after")).toBe("string");
  expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
});

test("7. imagingClient attaches retryAt and provider to ImagingRequestError", async () => {
  // a 402 body {detail, code:'over-budget', retryAt:123} -> generateImage rejects with ImagingRequestError {code:'over-budget', status:402, retryAt:123}
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({ detail: "Over budget limit", code: "over-budget", retryAt: 123 }),
      { status: 402, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  let err1: unknown;
  try {
    await generateImage({ prompt: "test", aspect: "16:9" });
  } catch (e) {
    err1 = e;
  }
  expect(err1).toBeInstanceOf(ImagingRequestError);
  expect((err1 as ImagingRequestError).code).toBe("over-budget");
  expect((err1 as ImagingRequestError).status).toBe(402);
  expect((err1 as ImagingRequestError).retryAt).toBe(123);

  // a 422 body {code:'refused', provider:'google'} -> the error's provider is 'google'
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({ detail: "Safety policy refused prompt", code: "refused", provider: "google" }),
      { status: 422, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  let err2: unknown;
  try {
    await generateImage({ prompt: "test", aspect: "16:9" });
  } catch (e) {
    err2 = e;
  }
  expect(err2).toBeInstanceOf(ImagingRequestError);
  expect((err2 as ImagingRequestError).code).toBe("refused");
  expect((err2 as ImagingRequestError).status).toBe(422);
  expect((err2 as ImagingRequestError).provider).toBe("google");
});

test("8. renderPlan and GET /api/imaging/budget route rate-limit isolation", async () => {
  const T = 1_000_000;
  // Part 1: renderPlan.planRender
  const planPartial = planRender({
    missing: 16,
    quote: { verdict: "partial", affordableImages: 4, estimateUsd: 0.72, resumeAt: T },
  });
  expect(planPartial.count).toBe(4);
  expect(planPartial.label).toContain("4 of 16");
  expect(planPartial.resumeAt).toBe(T);

  const planUnknown = planRender({
    missing: 16,
    quote: { verdict: "unknown", affordableImages: 16, estimateUsd: null, resumeAt: null },
  });
  expect(planUnknown.count).toBe(16);
  expect(planUnknown.label).not.toContain("$");
  expect(planUnknown.label).not.toContain("$0.00");

  // Part 2: renderPlan.afterOutcome
  const outcomeBudget = afterOutcome("over-budget", T);
  expect(outcomeBudget).toEqual({ action: "pause-until", until: T });
  const outcomeFailed = afterOutcome("failed");
  expect(outcomeFailed).toEqual({ action: "stop" });

  // Part 3: GET /api/imaging/budget route
  // Without access header -> 401
  const unauthedReq = new Request("http://localhost/api/imaging/budget", { method: "GET" });
  const resUnauth = await budgetGET(unauthedReq);
  expect(resUnauth.status).toBe(401);

  // With access header -> 200 with {ceilingUsd, spentUsd, remainingUsd, windowMs, perImageUsd, quote}
  process.env[ACCESS_SECRET_VAR] = "probe-secret";
  const authedReq = new Request("http://localhost/api/imaging/budget?images=16", {
    method: "GET",
    headers: { authorization: "Bearer probe-secret", "x-forwarded-for": "198.51.100.1" },
  });
  const resAuth = await budgetGET(authedReq);
  expect(resAuth.status).toBe(200);
  const jsonAuth = await resAuth.json();
  expect(jsonAuth).toHaveProperty("ceilingUsd");
  expect(jsonAuth).toHaveProperty("spentUsd");
  expect(jsonAuth).toHaveProperty("remainingUsd");
  expect(jsonAuth).toHaveProperty("windowMs");
  expect(jsonAuth).toHaveProperty("perImageUsd");
  expect(jsonAuth).toHaveProperty("quote");

  // 40 authorised GETs in a row leave rateLimit(clientIp) unconsumed so following POST /api/imaging/generate is not 429
  const ip = "198.51.100.2";
  for (let i = 0; i < 40; i++) {
    const r = new Request("http://localhost/api/imaging/budget", {
      method: "GET",
      headers: { authorization: "Bearer probe-secret", "x-forwarded-for": ip },
    });
    const res = await budgetGET(r);
    expect(res.status).toBe(200);
  }

  // Follow with POST /api/imaging/generate from same IP
  const postReq = new Request("http://localhost/api/imaging/generate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer probe-secret",
      "x-forwarded-for": ip,
    },
    body: JSON.stringify({}),
  });
  const postRes = await generatePOST(postReq);
  expect(postRes.status).not.toBe(429);
  expect(postRes.status).toBe(400);
});
