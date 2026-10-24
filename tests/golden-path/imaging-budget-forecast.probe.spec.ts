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
// 7. RETIRED (Phase 6 wave C, L70): the browser's imagingClient generateImage /
//    ImagingRequestError died with /api/imaging/generate (0 non-test callers).
// 8. The budget body lib/imaging/handlers.ts budgetHandler serves (the v1 GET route
//    is gone; the handler is kept for pipeline/integration-imaging.mts): it answers
//    {ceilingUsd, spentUsd, remainingUsd, windowMs, perImageUsd, quote}, and asking it
//    forty times spends nothing. The route's door and rate-limit isolation retired with it.

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
import { budgetHandler } from "@/lib/imaging/handlers";
import { ACCESS_SECRET_VAR } from "@/lib/apiAuth";

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
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  delete process.env[ACCESS_SECRET_VAR];
  delete process.env.OLLAMA_HOST;
  process.env.LOCAL_BINARIES = "off";
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
});


const book = async (usd: number, at: number) =>
  await recordSpend({
    usd,
    cap: "generate",
    provider: "google",
    model: "probe-model",
    outcome: "served",
    basis: "vendor",
    at,
  });

test("1. budgetQuote({images: 16, now: T}) with $0.72 spent on 2 rows expiring at T+10s and T+20s", async () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "60000";
  const T = 1_000_000;
  // Two rows expiring at T+10s (T+10,000) and T+20s (T+20,000)
  await book(0.36, T - 50_000);
  await book(0.36, T - 40_000);

  const quote = await budgetQuote({ images: 16, now: T });
  expect(quote.remainingUsd).toBe(0.28);
  expect(quote.estimateUsd).toBe(0.72);
  expect(quote.affordableImages).toBe(6);
  expect(quote.verdict).toBe("partial");
  expect(quote.resumeAt).toBe(T + 20_000);
});

test("2. budgetQuote with $0.90 spent on 1 row expiring at T+60s", async () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "120000";
  const T = 1_000_000;
  await book(0.90, T - 60_000);

  const quote = await budgetQuote({ images: 16, now: T });
  expect(quote.remainingUsd).toBe(0.10);
  expect(quote.affordableImages).toBe(2);
  expect(quote.verdict).toBe("partial");
  expect(quote.resumeAt).toBe(T + 60_000);
});

test("3. budgetQuote with $0.99 spent on 1 row expiring at T+30s", async () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "60000";
  const T = 1_000_000;
  await book(0.99, T - 30_000);

  const quote = await budgetQuote({ images: 16, now: T });
  expect(quote.remainingUsd).toBe(0.01);
  expect(quote.affordableImages).toBe(0);
  expect(quote.verdict).toBe("blocked");
  expect(quote.resumeAt).toBe(T + 30_000);
});

test("4. budgetQuote with $0.10 spent on 1 row: fits and resumeAt is null", async () => {
  process.env[BUDGET_VAR] = "1.00";
  process.env[WINDOW_VAR] = "60000";
  const T = 1_000_000;
  await book(0.10, T - 10_000);

  const quote = await budgetQuote({ images: 16, now: T });
  expect(quote.remainingUsd).toBe(0.90);
  expect(quote.affordableImages).toBe(16);
  expect(quote.verdict).toBe("fits");
  expect(quote.resumeAt).toBeNull();
});

test("5. budgetQuote with no priced providers configured: verdict is 'unknown', estimateUsd is null, affordableImages is 16", async () => {
  process.env[BUDGET_VAR] = "1.00";
  const T = 1_000_000;
  const quote = await budgetQuote({
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
  await book(0.50, T - 30_000);

  const err = new ImagingError("budget", "over-budget");
  const res = errorResponse(err, T);
  expect(res.status).toBe(402);
  const json = await res.json();
  expect(json.code).toBe("over-budget");
  expect(typeof json.retryAt).toBe("number");
  expect(typeof res.headers.get("retry-after")).toBe("string");
  expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
});

test("8. budgetHandler answers the window and the quote, and asking it spends nothing", async () => {
  const res = await budgetHandler(new Request("http://localhost/api/imaging/budget?images=16"));
  expect(res.status).toBe(200);
  const json = (await res.json()) as Record<string, unknown>;
  for (const k of ["ceilingUsd", "spentUsd", "remainingUsd", "windowMs", "perImageUsd", "quote"]) expect(json).toHaveProperty(k);
  const before = json["spentUsd"];
  for (let i = 0; i < 40; i++) expect((await budgetHandler(new Request("http://localhost/api/imaging/budget"))).status).toBe(200);
  const after = (await (await budgetHandler(new Request("http://localhost/api/imaging/budget"))).json()) as Record<string, unknown>;
  expect(after["spentUsd"]).toBe(before);
});

test("9. budgetHandler answers a ledger it cannot open in the routes' one error shape, not a thrown promise", async () => {
  const prev = process.env.SPEND_STORE;
  process.env.SPEND_STORE = "probe-not-a-store";
  try {
    const res = await budgetHandler(new Request("http://localhost/api/imaging/budget"));
    expect(res.status).toBe(502);
    expect(((await res.json()) as Record<string, unknown>)["code"]).toBe("failed");
  } finally {
    if (prev === undefined) delete process.env.SPEND_STORE;
    else process.env.SPEND_STORE = prev;
  }
});
