// LANE — THE MUSIC CEILING HOLDS WHAT IS IN FLIGHT (dynamic).
//
// Card IMG-A stage 2 (docs/concepts/moonshots-2026-10-05/critic-2026-10-07.md,
// "C3 next stage", cases 5-6). lib/music/elevenlabs.ts `metered()` used to ask
// `assertWithinMusicBudget(seconds)` and then book the seconds only when the
// vendor answered. Between the check and the booking nothing was held, so two
// renders that each fit the ceiling on their own were both admitted against the
// same un-updated total, and the window ended above the ceiling. Imaging closed
// the same race with holds; music now reserves on the shared kernel
// (lib/spend/meter.ts) before the vendor is touched.
//
// NO VENDOR CALL IS EVER MADE: `globalThis.fetch` is replaced in every case and
// every replacement counts its invocations.
import { test, expect } from "@playwright/test";

import { keepEnv } from "./_helpers";

import {
  musicBudgetStats,
  musicSpendRows,
  __resetMusicBudget,
  MUSIC_BUDGET_VAR,
  MUSIC_WINDOW_VAR,
} from "@/lib/music/budget";
import { MusicError, statusFor } from "@/lib/music/errors";
import { MUSIC_KEY_VAR, composeMusic, draftPlan } from "@/lib/music/elevenlabs";
import type { MusicPlan } from "@/lib/music/types";

keepEnv([MUSIC_BUDGET_VAR, MUSIC_WINDOW_VAR, MUSIC_KEY_VAR]);

/** 12 seconds of audio: one section the adapter's pre-flight accepts. */
const PLAN: MusicPlan = {
  positiveGlobalStyles: ["warm"],
  negativeGlobalStyles: ["harsh"],
  sections: [{ name: "bed", durationMs: 12_000, positiveStyles: ["warm"], negativeStyles: ["harsh"] }],
};
const PLAN_S = 12;

/** Bytes the adapter accepts as audio (it refuses anything under 1,000). */
const AUDIO = () => new Response(new Uint8Array(2_048), { status: 200, headers: { "content-type": "audio/mpeg" } });

const realFetch = globalThis.fetch;
let fetches = 0;
/** Resolvers for vendor calls the stub is holding open, oldest first. */
let held: Array<(r: Response) => void> = [];

/** Every vendor call is counted and held open until the case answers it. */
function holdVendor() {
  fetches = 0;
  held = [];
  globalThis.fetch = (async () => {
    fetches++;
    return new Promise<Response>((resolve) => held.push(resolve));
  }) as typeof fetch;
}

const until = async (cond: () => boolean, what: string) => {
  for (let i = 0; i < 400 && !cond(); i++) await new Promise((r) => setTimeout(r, 5));
  expect(cond(), what).toBe(true);
};

test.beforeEach(() => {
  __resetMusicBudget();
  delete process.env[MUSIC_BUDGET_VAR];
  delete process.env[MUSIC_WINDOW_VAR];
  process.env[MUSIC_KEY_VAR] = "probe-key-not-a-real-one";
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  __resetMusicBudget();
});

test("(critic 5) two concurrent renders at 60% of the ceiling each: one vendor call, the second is 402 over-budget", async () => {
  process.env[MUSIC_BUDGET_VAR] = String(PLAN_S / 0.6); // 20s: each render is 60% of it
  holdVendor();

  const first = composeMusic(PLAN);
  const pendingSecond = composeMusic(PLAN).catch((e) => e);
  await until(() => fetches >= 1, "the first render reached the vendor");
  // A refused render settles at once; one that slipped through is still waiting
  // on the vendor, and is reported as such rather than waited out.
  const second = await Promise.race([pendingSecond, new Promise((r) => setTimeout(() => r("still in flight"), 50))]);

  console.log(`[music-holds] concurrent -> second=${(second as MusicError)?.kind ?? second} fetches=${fetches}`);
  // Answer whatever reached the vendor before asserting, so a red case still
  // ends with nothing held open.
  for (const answer of held) answer(AUDIO());
  expect(second).toBeInstanceOf(MusicError);
  expect((second as MusicError).kind).toBe("over-budget");
  expect(statusFor((second as MusicError).kind)).toBe(402);
  expect(fetches, "the second render reached the vendor past the ceiling").toBe(1);
  // The refusal sentence is the one the route has always answered with.
  expect((second as MusicError).message).toContain("SECONDS OF AUDIO");

  const served = await first;
  expect(served.audio.b64.length).toBeGreaterThan(0);
  const s = musicBudgetStats();
  expect(s.spentSeconds).toBe(PLAN_S);
  expect(s.spentSeconds).toBeLessThanOrEqual(s.ceilingSeconds);
  expect(s.counters.refusals).toBe(1);
  expect(s.counters.refusedSeconds).toBe(PLAN_S);
  expect(fetches).toBe(1);
});

test("(critic 6) a render in flight is held; a 401 releases it with nothing booked", async () => {
  holdVendor();

  const pending = composeMusic(PLAN).catch((e) => e);
  await until(() => fetches === 1, "the render reached the vendor");

  const during = musicBudgetStats();
  console.log(`[music-holds] in flight -> held=${during.heldSeconds}s spent=${during.spentSeconds}s`);
  expect(during.heldSeconds).toBe(PLAN_S);
  expect(during.spentSeconds).toBe(0);
  expect(during.remainingSeconds).toBe(during.ceilingSeconds - PLAN_S);

  // The vendor rejected the key: nothing rendered, nothing to bill.
  held[0](new Response("invalid api key", { status: 401 }));
  const err = await pending;
  expect(err).toBeInstanceOf(MusicError);
  expect((err as MusicError).kind).toBe("no-key");

  const after = musicBudgetStats();
  expect(after.heldSeconds).toBe(0);
  expect(after.spentSeconds).toBe(0);
  expect(after.counters.booked).toBe(0);
  expect(after.counters.unmetered).toBe(0);
  expect(musicSpendRows()).toHaveLength(0);
});

test("(critic 6) a render that times out mid-body books one failed row and holds nothing afterwards", async () => {
  fetches = 0;
  globalThis.fetch = ((_u: string, init?: RequestInit) => {
    fetches++;
    const signal = init?.signal;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64));
        signal?.addEventListener("abort", () => controller.error(signal.reason));
      },
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  }) as unknown as typeof fetch;

  const pending = composeMusic(PLAN, 300).catch((e) => e);
  await until(() => fetches === 1, "the render reached the vendor");
  expect(musicBudgetStats().heldSeconds).toBe(PLAN_S);

  const err = await pending;
  expect(err).toBeInstanceOf(MusicError);
  expect((err as MusicError).kind).toBe("timeout");

  const s = musicBudgetStats();
  const rows = musicSpendRows();
  console.log(`[music-holds] timeout -> rows=${rows.map((r) => `${r.seconds}s:${r.outcome}`)} held=${s.heldSeconds}s`);
  expect(s.heldSeconds).toBe(0);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ seconds: PLAN_S, op: "generate", outcome: "failed", basis: "unpriced" });
  expect(s.counters.bookedFailed).toBe(1);
  expect(s.counters.failedSeconds).toBe(PLAN_S);
});

test("a released hold frees its room: after a 401, the next render is admitted", async () => {
  process.env[MUSIC_BUDGET_VAR] = String(PLAN_S / 0.6);
  holdVendor();

  const first = composeMusic(PLAN).catch((e) => e);
  await until(() => fetches === 1, "the first render reached the vendor");
  held[0](new Response("invalid api key", { status: 401 }));
  expect(((await first) as MusicError).kind).toBe("no-key");

  const second = composeMusic(PLAN);
  await until(() => fetches === 2, "the second render reached the vendor");
  held[1](AUDIO());
  await second;
  const s = musicBudgetStats();
  expect(s.spentSeconds).toBe(PLAN_S);
  expect(s.heldSeconds).toBe(0);
  expect(s.counters.refusals).toBe(0);
});

test("a free plan draft holds nothing and books nothing, and a ceiling of 0 still admits it", async () => {
  process.env[MUSIC_BUDGET_VAR] = "0";
  fetches = 0;
  globalThis.fetch = (async () => {
    fetches++;
    return new Response(JSON.stringify({ chunks: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  const plan = await draftPlan({ prompt: "probe" });
  expect(plan.chunks).toEqual([]);
  expect(fetches).toBe(1);
  const s = musicBudgetStats();
  expect(s.heldSeconds).toBe(0);
  expect(s.counters.booked).toBe(0);
  // Zero seconds is a declared-free call, not an unmetered one.
  expect(s.counters.unmetered).toBe(0);
  expect(s.counters.refusals).toBe(0);
});
