// LANE — THE MUSIC CEILING REFUSES RATHER THAN BILLS (dynamic).
//
// app/api/music/generate/route.ts named this gap honestly and left it open:
// "NOT yet under lib/imaging/budget.ts's spend ceiling: that ledger prices
// per-image USD and a music credit is a different unit … the ceiling on this
// route is the rate limit alone — stated here so nobody mistakes absence for
// coverage." A rate limit bounds requests per minute; it cannot tell thirty
// five-second renders from thirty ten-minute ones.
//
// This probe drives the ACTUAL budget module, the ACTUAL price table and the
// ACTUAL adapter chokepoint (`composeMusic`) and pins:
//
//   · NEVER AN INVENTED PRICE — every row either carries a figure with a source
//     and a checked date, or carries none with the reason recorded;
//   · THE UNIT PROBLEM IS ANSWERED, NOT PAPERED OVER — a quote reports the link
//     of the seconds→credits→USD chain it reached, and today that is SECONDS,
//     with `unpriced` said out loud rather than a dollar figure guessed;
//   · under the ceiling a call proceeds (and, with no key, dies on `no-key` —
//     proving the budget let it through);
//   · over the ceiling it is REFUSED with `over-budget`, thrown BEFORE the
//     vendor is touched — asserted by counting fetches, not by trusting a
//     comment;
//   · the window ROLLS OVER, and says so;
//   · THE METER WATCHES ITSELF — refusals are counted and evictions are
//     observable, so "the ceiling is working" and "the ceiling is strangling
//     something" can be told apart;
//   · a refusal is NOT booked (the vendor never rendered) while a timeout IS
//     (it did, and will bill for it).
//
// NO VENDOR CALL IS EVER MADE: `globalThis.fetch` is replaced before any test
// runs and every replacement counts its invocations.
import { test, expect } from "@playwright/test";

import {
  assertWithinMusicBudget,
  currentMusicSeconds,
  musicBudgetStats,
  musicCeilingSeconds,
  musicSpendByAxis,
  musicSpendRows,
  recordMusicSpend,
  __resetMusicBudget,
  MUSIC_BUDGET_VAR,
  MUSIC_WINDOW_VAR,
} from "@/lib/music/budget";
import { MUSIC_PRICES, estimatePerSecond, priceCall, priceTable } from "@/lib/music/pricing";
import { MusicError, statusFor } from "@/lib/music/errors";
import { BILLED_ON_FAILURE, MUSIC_KEY_VAR, composeMusic } from "@/lib/music/elevenlabs";
import type { MusicPlan } from "@/lib/music/types";
import { costLabel } from "@/lib/musicClient";

/** 13 seconds — Glass Harbor's cue-1, and a plan the adapter's pre-flight
 *  accepts, so every case reaches the meter rather than dying before it. */
const PLAN: MusicPlan = {
  positiveGlobalStyles: ["dark orchestral"],
  negativeGlobalStyles: ["vocals"],
  sections: [
    { name: "sc 1", durationMs: 6_000, positiveStyles: ["a"], negativeStyles: ["b"] },
    { name: "sc 2", durationMs: 7_000, positiveStyles: ["a"], negativeStyles: ["b"] },
  ],
};

const realFetch = globalThis.fetch;
let fetches = 0;

/** Every stub counts. A budget test that "refused before the vendor" and cannot
 *  prove it is a comment, not a test. */
function stubFetch(answer: () => Promise<Response>) {
  fetches = 0;
  globalThis.fetch = (async () => {
    fetches++;
    return answer();
  }) as typeof fetch;
}

const book = (seconds: number | undefined, at?: number, outcome: "served" | "failed" = "served") =>
  recordMusicSpend({ seconds, op: "generate", model: "music_v2", outcome, at });

test.beforeEach(() => {
  __resetMusicBudget();
  delete process.env[MUSIC_BUDGET_VAR];
  delete process.env[MUSIC_WINDOW_VAR];
  delete process.env[MUSIC_KEY_VAR];
  stubFetch(async () => new Response("nope", { status: 500 }));
});

test.afterEach(() => {
  globalThis.fetch = realFetch;
  __resetMusicBudget();
  delete process.env[MUSIC_BUDGET_VAR];
  delete process.env[MUSIC_WINDOW_VAR];
  delete process.env[MUSIC_KEY_VAR];
});

// ── Never an invented price ─────────────────────────────────────────────────

test("every price row carries a source and a checked date", () => {
  expect(MUSIC_PRICES.length).toBeGreaterThan(0);
  for (const row of MUSIC_PRICES) {
    expect(row.source.length, `${row.op} has a stub source`).toBeGreaterThan(60);
    expect(row.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // A row that declares a figure must declare a unit it is a figure OF.
    if (row.creditsPerSecond !== undefined) expect(["credits", "none"]).toContain(row.bills);
  }
  const unpriced = MUSIC_PRICES.filter((r) => r.bills === "credits" && r.creditsPerSecond === undefined);
  console.log(`[music-budget] ${MUSIC_PRICES.length} rows, ${unpriced.length} deliberately unpriced`);
  // The standard a prior wave set for imaging: an unmeasured rate is left
  // unpriced WITH THE REASON, never filled in with a plausible-looking number.
  expect(unpriced.length).toBeGreaterThan(0);
  for (const r of unpriced) expect(r.source.toLowerCase()).toMatch(/measur|checked|fill this row/);
});

test("a render quote reports SECONDS and says `unpriced` — it never invents money", () => {
  const q = priceCall({ op: "generate", model: "music_v2", seconds: 13 });
  console.log(`[music-budget] generate 13s -> basis=${q.basis} note=${q.note.slice(0, 70)}…`);
  expect(q.seconds).toBe(13);
  expect(q.basis).toBe("unpriced");
  // THE UNIT PROBLEM, ANSWERED: the exact link of the chain is reported, and the
  // undeclared ones are absent rather than defaulted.
  expect(q.usd).toBeUndefined();
  expect(q.credits).toBeUndefined();
  expect(q.note.toLowerCase()).toContain("credit");
});

test("the DECLARED-free plan endpoint is free, which is not the same as unpriced", () => {
  const q = priceCall({ op: "plan", model: "music_v2", seconds: 0 });
  console.log(`[music-budget] plan -> basis=${q.basis}`);
  expect(q.basis).toBe("free");
  expect(q.usd).toBe(0);
  // An unmeasured rate and a measured zero must never collapse into one state.
  expect(priceCall({ op: "generate", seconds: 1 }).basis).toBe("unpriced");
});

test("an operation with no row is unpriced with an instruction, not a guess", () => {
  // @ts-expect-error — deliberately outside MusicOp: the table must degrade
  // honestly for an operation somebody adds and forgets to price.
  const q = priceCall({ op: "mastering", seconds: 10 });
  expect(q.basis).toBe("unpriced");
  expect(q.note).toContain("lib/music/pricing.ts");
  expect(q.usd).toBeUndefined();
});

test("the public table leaks nothing beyond the committed literals", () => {
  const t = priceTable();
  const body = JSON.stringify(t);
  expect(t.perSecond.basis).toBe(estimatePerSecond().basis);
  expect(t.prices).toHaveLength(MUSIC_PRICES.length);
  // The route's audit rests on pricing.ts reading no env; if a key or a ceiling
  // ever reached the table this is where it would show up.
  expect(body).not.toContain("ELEVENLABS_API_KEY");
  expect(body).not.toContain(MUSIC_BUDGET_VAR);
});

// ── The ceiling refuses, before the vendor ──────────────────────────────────

test("gate: under the ceiling the call proceeds and reaches the key check", async () => {
  process.env[MUSIC_BUDGET_VAR] = "100";
  let kind: string | null = null;
  try {
    await composeMusic(PLAN);
  } catch (e) {
    if (e instanceof MusicError) kind = e.kind;
    else throw e;
  }
  console.log(`[music-budget] under ceiling -> ${kind}, fetches=${fetches}`);
  // `no-key`, not `over-budget`: the budget let it through, and the adapter
  // then stopped for the reason it should have.
  expect(kind).toBe("no-key");
  expect(fetches).toBe(0);
});

test("gate: over the ceiling the call is REFUSED before any vendor request", async () => {
  process.env[MUSIC_BUDGET_VAR] = "20";
  process.env[MUSIC_KEY_VAR] = "probe-key-not-a-real-one";
  book(10); // 10s already rendered; this cue asks 13 more -> 23 > 20.

  let err: unknown;
  try {
    await composeMusic(PLAN);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(MusicError);
  const me = err as MusicError;
  console.log(`[music-budget] refused -> ${me.kind} (HTTP ${statusFor(me.kind)}), fetches=${fetches}`);
  expect(me.kind).toBe("over-budget");
  expect(statusFor(me.kind)).toBe(402);
  // THE WHOLE POINT: it refuses rather than bills. Proven by counting, with a
  // real key present so nothing else could have stopped the request.
  expect(fetches, "the vendor was called on a refused render").toBe(0);
  // The refusal explains its own unit, because "20" means nothing on its own.
  expect(me.message).toContain("SECONDS OF AUDIO");
});

test("gate: the refusal is COUNTED — a ceiling with no refusal count is unreadable", () => {
  process.env[MUSIC_BUDGET_VAR] = "10";
  expect(musicBudgetStats().counters.refusals).toBe(0);
  expect(() => assertWithinMusicBudget(13)).toThrow(MusicError);
  expect(() => assertWithinMusicBudget(13)).toThrow(MusicError);
  const c = musicBudgetStats().counters;
  console.log(`[music-budget] refusals=${c.refusals} refusedSeconds=${c.refusedSeconds}`);
  expect(c.refusals).toBe(2);
  expect(c.refusedSeconds).toBe(26);
  // Zero refusals forever is indistinguishable from a gate that is not on the
  // spending path; this is the number that tells them apart.
});

test("default ceiling is a real bound, not unlimited", () => {
  delete process.env[MUSIC_BUDGET_VAR];
  expect(musicCeilingSeconds()).toBe(600);
  book(600);
  expect(() => assertWithinMusicBudget(13)).toThrow(MusicError);
});

test("a ceiling of 0 means render nothing — not `disabled`", () => {
  process.env[MUSIC_BUDGET_VAR] = "0";
  expect(musicCeilingSeconds()).toBe(0);
  expect(() => assertWithinMusicBudget(1)).toThrow(MusicError);
  // …and a free call still passes, because it asks for no audio at all.
  expect(() => assertWithinMusicBudget(0)).not.toThrow();
});

// ── The window rolls over, observably ───────────────────────────────────────

test("window: audio older than the window no longer counts, and the reset is announced", () => {
  process.env[MUSIC_BUDGET_VAR] = "100";
  process.env[MUSIC_WINDOW_VAR] = "60000"; // 1-minute window
  const t0 = 5_000_000;

  book(90, t0);
  expect(currentMusicSeconds(t0)).toBe(90);
  expect(() => assertWithinMusicBudget(20, t0)).toThrow(MusicError);

  const later = t0 + 61_000;
  expect(currentMusicSeconds(later)).toBe(0);
  expect(() => assertWithinMusicBudget(20, later)).not.toThrow();

  const c = musicBudgetStats(later).counters;
  console.log(`[music-budget] evicted=${c.evicted} evictedSeconds=${c.evictedSeconds}`);
  // A total that fell without an eviction recorded is a bug, not a roll — this
  // is the field that makes the difference legible.
  expect(c.evicted).toBe(1);
  expect(c.evictedSeconds).toBe(90);
  expect(c.lastEvictionAt).not.toBeNull();
});

test("stats hand out the window boundary WITH the total", () => {
  process.env[MUSIC_BUDGET_VAR] = "100";
  const now = 9_000_000;
  book(30, now);
  const s = musicBudgetStats(now);
  expect(s.spentSeconds).toBe(30);
  expect(s.remainingSeconds).toBe(70);
  expect(s.windowEnd - s.windowStart).toBe(s.windowMs);
});

// ── Booking: what the vendor actually bills for ─────────────────────────────

test("a refusal is not booked; a timeout is — the vendor rendered one of them", async () => {
  process.env[MUSIC_BUDGET_VAR] = "600";
  process.env[MUSIC_KEY_VAR] = "probe-key-not-a-real-one";
  console.log(`[music-budget] billed-on-failure = ${[...BILLED_ON_FAILURE].join(",")}`);
  expect(BILLED_ON_FAILURE.has("refused")).toBe(false);
  expect(BILLED_ON_FAILURE.has("rate-limited")).toBe(false);
  expect(BILLED_ON_FAILURE.has("timeout")).toBe(true);

  // A 451 refusal: the model declined, no renderer ran, nothing to bill.
  stubFetch(async () => new Response("declined", { status: 451 }));
  await expect(composeMusic(PLAN)).rejects.toThrow(MusicError);
  expect(currentMusicSeconds()).toBe(0);

  // A body that starts and stalls: the render RAN and the vendor will charge.
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
  await expect(composeMusic(PLAN, 300)).rejects.toThrow(MusicError);
  console.log(`[music-budget] after stall: spent=${currentMusicSeconds()}s`);
  expect(currentMusicSeconds()).toBe(13);
  const c = musicBudgetStats().counters;
  expect(c.bookedFailed).toBe(1);
  expect(c.failedSeconds).toBe(13);
});

test("an unmetered booking is counted, not silently dropped", () => {
  book(undefined);
  book(0);
  book(Number.NaN);
  expect(currentMusicSeconds()).toBe(0);
  const c = musicBudgetStats().counters;
  console.log(`[music-budget] unmetered=${c.unmetered}`);
  expect(c.unmetered).toBe(3);
  expect(c.booked).toBe(0);
});

test("the ledger answers by axis, in the same vocabulary the log line uses", () => {
  const now = 7_000_000;
  book(13, now);
  book(5, now, "failed");
  recordMusicSpend({ seconds: 8, op: "sfx", model: "eleven_text_to_sound_v2", outcome: "served", at: now });
  const a = musicSpendByAxis(now);
  console.log(`[music-budget] byOp=${JSON.stringify(a.byOp)} unpricedSeconds=${a.unpricedSeconds}`);
  expect(a.totalSeconds).toBe(26);
  expect(a.byOp.generate).toBe(18);
  expect(a.byOp.sfx).toBe(8);
  expect(a.byOutcome.failed).toBe(5);
  // Every row is unpriced today, and the ledger says so rather than letting a
  // duration be read as a bill.
  expect(a.unpricedSeconds).toBe(26);
  expect(musicSpendRows(now)).toHaveLength(3);
  expect(musicSpendRows(now).every((r) => r.usd === undefined)).toBe(true);
});

// ── What the SURFACE may say about the cost, before and after the click ─────
//
// The Score step spends on one click and used to say nothing about it, ever.
// `costLabel` is the whole decision about what may be claimed; it lives in
// lib/musicClient.ts rather than inside the component precisely so it can be
// driven here, and every branch below has the same duty: NEVER print $0.00 for
// a price nobody measured.

test("surface: an unpriced quote shows the SECONDS and the word unpriced", () => {
  const label = costLabel(priceCall({ op: "generate", model: "music_v2", seconds: 13 }), 13);
  console.log(`[music-budget] pre-click label -> ${label.text}`);
  expect(label.text).toBe("13s of audio · unpriced");
  expect(label.text).not.toContain("$");
  // The reason travels with it, so a user who hovers learns why rather than
  // being told a number is missing.
  expect(label.title.toLowerCase()).toContain("credit");
});

test("surface: the three ways of not knowing stay apart, and none is a zero", () => {
  expect(costLabel(null, 13).text).toContain("checking");
  expect(costLabel("unknown", 13).text).toContain("price unknown");
  // Even with the route unreachable the seconds are exact — they are the length
  // of picture this cue covers, and they do not depend on any vendor.
  expect(costLabel("unknown", 13).text).toContain("13s");
  for (const p of [null, "unknown" as const])
    expect(costLabel(p, 13).text).not.toContain("$0.00");
});

test("surface: a DECLARED-free call says free; credits print as credits", () => {
  expect(costLabel(priceCall({ op: "plan", model: "music_v2", seconds: 0 }), 0).text).toBe("free");
  const withRate = costLabel(
    { seconds: 1, credits: 2, basis: "estimated", note: "hypothetical rate" },
    13,
  );
  console.log(`[music-budget] credit label -> ${withRate.text}`);
  expect(withRate.text).toBe("est. 26.0 credits");
  // A credit is not a dollar and is never quietly turned into one.
  expect(withRate.text).not.toContain("$");
  expect(withRate.title).toContain("no USD conversion is declared");
});
