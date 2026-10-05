// A vendor that answers 200 and then stalls mid-body is a TIMEOUT, on every
// ElevenLabs call - not a handler that sits until the platform's maxDuration.
//
// composeCall learned this first (its comment: "THE TIMER SPANS THE BODY, NOT
// JUST THE HEADERS"). The three raw-surface calls the Sound lab renders through
// - plan drafting, detailed compose, SFX - went through vendorFetch, which
// cleared its timer as soon as the response HEAD arrived, so their body reads
// had no deadline at all (2026-10-05, moonshot backlog Q2).
//
// The adapter's deadline is 240 s; the probe shortens exactly that one timer
// (setTimeout called with 240_000) and leaves every other timer alone. The
// stubbed vendor sends headers, then holds the body open until the request's
// own AbortSignal fires - the behaviour of a real fetch body under abort.
import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";

import { MusicError } from "@/lib/music/errors";
import { composeDetailed, composeMusic, draftPlan, generateSfx, MUSIC_KEY_VAR } from "@/lib/music/elevenlabs";
import type { MusicPlan } from "@/lib/music/types";

keepEnv([MUSIC_KEY_VAR]);

const ADAPTER_TIMEOUT_MS = 240_000;
const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;

const PLAN: MusicPlan = {
  positiveGlobalStyles: ["warm"],
  negativeGlobalStyles: ["harsh"],
  sections: [{ name: "bed", durationMs: 12_000, positiveStyles: ["warm"], negativeStyles: ["harsh"], directions: [], lyrics: [] }],
};

/** Headers now, a few body bytes, then nothing until the request is aborted. */
function stallingVendor(contentType: string) {
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(ctrl) {
        ctrl.enqueue(new TextEncoder().encode(contentType.includes("json") ? '{"chunks":' : "ID3"));
        signal?.addEventListener("abort", () => ctrl.error(new DOMException("aborted", "AbortError")));
      },
    });
    return new Response(body, { status: 200, headers: { "content-type": contentType } });
  }) as typeof fetch;
}

test.beforeEach(() => {
  process.env[MUSIC_KEY_VAR] = "probe-key";
  globalThis.setTimeout = ((fn: (...a: unknown[]) => void, ms?: number, ...rest: unknown[]) =>
    realSetTimeout(fn, ms === ADAPTER_TIMEOUT_MS ? 50 : ms, ...rest)) as typeof setTimeout;
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
});

/** The MusicError kind the call ended with, or "hung" if it outlived the deadline by far. */
async function outcome(call: () => Promise<unknown>): Promise<string> {
  const hung = new Promise<string>((resolve) => realSetTimeout(() => resolve("hung"), 3_000));
  const ran = call().then(
    () => "resolved",
    (e) => (e instanceof MusicError ? e.kind : `threw ${(e as Error).name}`),
  );
  return Promise.race([ran, hung]);
}

test("control: composeMusic's stalled body is a timeout (the shape the others must match)", async () => {
  stallingVendor("audio/mpeg");
  expect(await outcome(() => composeMusic(PLAN))).toBe("timeout");
});

test("generateSfx: a stalled body is a timeout, not a hang", async () => {
  stallingVendor("audio/mpeg");
  expect(await outcome(() => generateSfx({ text: "door slam", durationSeconds: 2 }))).toBe("timeout");
});

test("composeDetailed: a stalled body is a timeout, not a hang", async () => {
  stallingVendor("audio/mpeg");
  expect(await outcome(() => composeDetailed({ prompt: "warm bed", lengthMs: 12_000 }))).toBe("timeout");
});

test("draftPlan: a stalled body is a timeout, not a hang", async () => {
  stallingVendor("application/json");
  expect(await outcome(() => draftPlan({ prompt: "warm bed" }))).toBe("timeout");
});
