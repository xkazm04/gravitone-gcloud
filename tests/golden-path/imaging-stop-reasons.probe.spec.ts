// LANE — NAMED STOP REASONS (dynamic).
//
// Registry standard: media-generation/generative-provider-routing, "Refusal is a
// state" + technique refusal-reroute-hop (revision of 2026-10-31). An empty
// result is a refusal only when the vendor gives no reason; a named reason
// decides. A policy block hops; a protected-material (recitation) block throws
// and is never routed onward; a no-image stop with no policy reason is `failed`;
// an account-level stop throws as an operator-actionable error; the blocking
// stage is kept on the trail.
//
// Drives the dev chain (agy -> google -> leonardo, agy off) with Google's answer
// scripted and Leonardo as the re-route target, so "did it hop" is a count of
// Leonardo POSTs, not an inference. Nothing leaves the process (tests/_seal.ts).

import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";
import { __resetBudget, BUDGET_VAR, WINDOW_VAR, FLOOR_VAR } from "@/lib/imaging/budget";
import { classifyStop, ImagingError, presumedBilled, statusFor } from "@/lib/imaging/errors";
import { generate } from "@/lib/imaging/router";

const realFetch = globalThis.fetch;
const LEONARDO = "https://cloud.leonardo.ai/api/rest/v1";
const PLATE_URL = "https://93.184.216.34/plate.jpg";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

keepEnv([BUDGET_VAR, WINDOW_VAR, FLOOR_VAR, "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "OLLAMA_HOST", "LEONARDO_API_KEY", "IMAGING_ENV"]);

test.beforeEach(() => {
  __resetBudget();
  delete process.env[BUDGET_VAR];
  delete process.env[WINDOW_VAR];
  delete process.env[FLOOR_VAR];
  delete process.env.OLLAMA_HOST;
  process.env.LOCAL_BINARIES = "off";
  process.env.GOOGLE_AI_API_KEY = "probe-google-key";
  process.env.LEONARDO_API_KEY = "probe-leonardo-key";
  process.env.IMAGING_ENV = "dev";
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Google answers with `google()`; Leonardo serves one plate. Counts both. */
function stubChain(google: () => Response): { google: number; leonardoPost: number } {
  const n = { google: 0, leonardoPost: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const method = init?.method ?? "GET";
    if (url.startsWith("https://generativelanguage.googleapis.com/")) {
      n.google++;
      return google();
    }
    if (url === `${LEONARDO}/generations` && method === "POST") {
      n.leonardoPost++;
      return json({ sdGenerationJob: { generationId: "gen-1" } });
    }
    if (url.startsWith(`${LEONARDO}/generations/`) && method === "DELETE") return json({});
    if (url.startsWith(`${LEONARDO}/generations/`))
      return json({ generations_by_pk: { status: "COMPLETE", generated_images: [{ id: "img-1", url: PLATE_URL }] } });
    if (url === PLATE_URL)
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), { status: 200, headers: { "content-type": "image/jpeg" } });
    throw new TypeError(`unexpected fetch in probe: ${method} ${url}`);
  }) as typeof fetch;
  return n;
}

/** The dev chain opens with agy, which is off here and trails as `no-key`. */
const googleSteps = (trail: readonly { provider: string }[] | undefined) => (trail ?? []).filter((s) => s.provider === "google");

async function generateErr(): Promise<ImagingError> {
  try {
    await generate({ prompt: "probe stop", aspect: "16:9", count: 1 });
  } catch (e) {
    expect(e).toBeInstanceOf(ImagingError);
    return e as ImagingError;
  }
  throw new Error("generate served; a stop was expected");
}

test("named_reason_decides_not_the_empty_default: the classifier reads only published vocabulary", () => {
  expect(classifyStop("IMAGE_RECITATION")).toEqual({ kind: "protected-material", token: "IMAGE_RECITATION", stage: "output" });
  expect(classifyStop("RECITATION")?.kind).toBe("protected-material");
  expect(classifyStop(undefined, '{"reason":"CONSUMER_SUSPENDED"}')?.kind).toBe("account-blocked");
  expect(classifyStop("BILLING_DISABLED")?.kind).toBe("account-blocked");
  expect(classifyStop("IMAGE_SAFETY")).toEqual({ kind: "refused", token: "IMAGE_SAFETY", stage: "output" });
  expect(classifyStop("PROHIBITED_CONTENT")).toEqual({ kind: "refused", token: "PROHIBITED_CONTENT" });
  expect(classifyStop("NO_IMAGE")?.kind).toBe("failed");
  // Nothing named: the caller's own default (empty = refusal) applies.
  expect(classifyStop(undefined, "", "something went wrong")).toBeUndefined();
  // Whole tokens only: IMAGE_SAFETY is not read as a bare SAFETY plus noise.
  expect(classifyStop("IMAGE_SAFETY_X")).toBeUndefined();
});

test("recitation_block_does_not_reroute", async () => {
  const n = stubChain(() => json({ status: "failed", error: { reason: "IMAGE_RECITATION", message: "blocked" } }));
  const err = await generateErr();
  console.log(`[stops] recitation -> kind=${err.kind} stage=${err.stage} leonardoPost=${n.leonardoPost}`);
  expect(err.kind).toBe("protected-material");
  expect(err.stage).toBe("output");
  expect(err.reroutable).toBe(false);
  expect(n.google).toBe(1);
  expect(n.leonardoPost, "a protected-material block was laundered to the next vendor").toBe(0);
  expect(presumedBilled(err)).toBe(true);
});

test("account_suspension_does_not_reroute_and_surfaces_to_the_operator", async () => {
  const n = stubChain(() =>
    json({ error: { code: 403, status: "PERMISSION_DENIED", details: [{ reason: "CONSUMER_SUSPENDED" }] } }, 403),
  );
  const err = await generateErr();
  console.log(`[stops] suspended -> kind=${err.kind} status=${statusFor(err.kind)} leonardoPost=${n.leonardoPost}`);
  expect(err.kind).toBe("account-blocked");
  expect(err.reroutable).toBe(false);
  expect(statusFor(err.kind)).toBe(503);
  expect(n.leonardoPost, "a suspended account was walked past like a missing key").toBe(0);
  expect(presumedBilled(err)).toBe(false);
});

test("plain_403_is_still_no_key_not_account_blocked", async () => {
  const n = stubChain(() => json({ error: { code: 403, status: "PERMISSION_DENIED", message: "API key not valid" } }, 403));
  const served = await generate({ prompt: "probe stop", aspect: "16:9", count: 1 });
  expect(googleSteps(served.provenance.reroutedFrom)).toEqual([{ provider: "google", why: "no-key" }]);
  expect(n.leonardoPost).toBe(1);
});

test("no_image_stop_without_policy_reason_is_failed_not_refused", async () => {
  const n = stubChain(() => json({ status: "completed", error: { reason: "NO_IMAGE" } }));
  const err = await generateErr();
  expect(err.kind).toBe("failed");
  expect(n.leonardoPost, "a no-image stop hopped as if it were a refusal").toBe(0);
});

test("policy_block_still_hops_and_keeps_its_stage_on_the_trail", async () => {
  const n = stubChain(() => json({ status: "failed", error: { reason: "IMAGE_SAFETY", message: "blocked" } }));
  const served = await generate({ prompt: "probe stop", aspect: "16:9", count: 1 });
  expect(served.provenance.provider).toBe("leonardo");
  expect(googleSteps(served.provenance.reroutedFrom)).toEqual([{ provider: "google", why: "refused", stage: "output" }]);
  expect(n.leonardoPost).toBe(1);
});

test("empty_result_without_reason_is_still_a_refusal_that_hops", async () => {
  const n = stubChain(() => json({ status: "completed" }));
  const served = await generate({ prompt: "probe stop", aspect: "16:9", count: 1 });
  expect(googleSteps(served.provenance.reroutedFrom)).toEqual([{ provider: "google", why: "refused" }]);
  expect(n.leonardoPost).toBe(1);
});
