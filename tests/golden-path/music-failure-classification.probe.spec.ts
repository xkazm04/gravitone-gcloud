// LANE — A VENDOR FAILURE IS CLASSIFIED BY WHAT THE VENDOR SAID (dynamic).
//
// lib/music/errors.ts states why the taxonomy matters: `refused` is a routing
// decision - the cue reverts to refused-silence, the cut says so, and NOTHING
// retries it - while `rate-limited` is the one outcome a caller is supposed to
// retry with backoff. They are opposites.
//
// Both call sites in lib/music/elevenlabs.ts used to decide between them like
// this, in this order:
//
//   const refusal = status === 451 || /moderat|policy|not allowed|prohibited/i.test(detail);
//   if (refusal) throw ... "refused"
//   if (status === 429) throw ... "rate-limited"
//
// so a fuzzy word match against the vendor's prose overruled a status the vendor
// had stated outright. "policy" is ordinary vocabulary in a throttling or auth
// body, which makes this reachable with no exotic input at all: a 429 reading
// "quota policy exceeded" was recorded as the model declining the brief,
// permanently, and a 401 reading "your key is not allowed to use this model" as
// the same.
//
// The probe drives the REAL adapter with a stubbed fetch and pins the precedence:
// stated codes first, the heuristic only for a 4xx that named no reason.
import { test, expect } from "@playwright/test";

import { MusicError } from "@/lib/music/errors";
import { composeMusic, MUSIC_KEY_VAR } from "@/lib/music/elevenlabs";
import type { MusicPlan } from "@/lib/music/types";

/** A plan the adapter's own pre-flight validation accepts, so every case below
 *  reaches the fetch rather than being refused before it. */
const PLAN: MusicPlan = {
  positiveGlobalStyles: ["warm"],
  negativeGlobalStyles: ["harsh"],
  sections: [
    {
      name: "bed",
      durationMs: 12_000,
      positiveStyles: ["warm"],
      negativeStyles: ["harsh"],
      directions: ["swell"],
      lyrics: [],
    },
  ],
};

const realFetch = globalThis.fetch;

/** Answer the next vendor call with `status` and `body`. */
function vendorAnswers(status: number, body: string) {
  globalThis.fetch = (async () =>
    new Response(body, { status, headers: { "content-type": "text/plain" } })) as typeof fetch;
}

test.beforeEach(() => {
  process.env[MUSIC_KEY_VAR] = "probe-key";
});
test.afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Run the adapter and return the MusicError kind it threw. */
async function kindFor(status: number, body: string): Promise<string> {
  vendorAnswers(status, body);
  try {
    await composeMusic(PLAN);
  } catch (e) {
    if (e instanceof MusicError) return e.kind;
    throw e;
  }
  throw new Error(`the adapter did not throw for ${status}`);
}

// ── The stated code wins over the prose ──────────────────────────────────────

test("a 429 whose body says 'policy' is rate-limited, not refused", async () => {
  const kind = await kindFor(429, "Quota policy exceeded for this workspace. Retry later.");
  console.log(`[music] 429 + "policy" -> ${kind}`);
  // THE DEFECT: the old ordering returned "refused" here, and a refusal is never
  // retried - so a throttled request was recorded as the model declining.
  expect(kind).toBe("rate-limited");
});

test("a 401 whose body says 'not allowed' is a key problem, not a refusal", async () => {
  const kind = await kindFor(401, "Your API key is not allowed to use model music_v2.");
  console.log(`[music] 401 + "not allowed" -> ${kind}`);
  expect(kind).toBe("no-key");
});

test("a 500 whose body says 'prohibited' is a vendor failure, not a refusal", async () => {
  const kind = await kindFor(500, "internal error: prohibited state in synthesis worker");
  console.log(`[music] 500 + "prohibited" -> ${kind}`);
  expect(kind).toBe("failed");
});

// ── The refusal cases the taxonomy exists for still classify as refusals ─────

test("451 is a refusal by status alone, whatever the body says", async () => {
  expect(await kindFor(451, "")).toBe("refused");
});

test("a 400 that names moderation is a refusal — the heuristic's real job", async () => {
  const kind = await kindFor(400, "The prompt was blocked by our moderation system.");
  console.log(`[music] 400 + "moderation" -> ${kind}`);
  expect(kind).toBe("refused");
});

test("a 400 that names no reason stays a bad request, not a guessed refusal", async () => {
  expect(await kindFor(400, "composition_plan.chunks[0].duration_ms is required")).toBe("bad-request");
});
