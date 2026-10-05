// LANE — METER CONFORMANCE (dynamic).
//
// Runs the one meter kit (./_meterKit.ts) against every spend meter this repo
// has. Today that is the imaging USD ceiling, read through its PUBLIC exports
// (lib/imaging/budget.ts) — the same names the router and the routes call — so
// this file proves the adapter, not an internal.
//
// Card IMG-A (docs/concepts/moonshots-2026-10-05/06-imaging-music.md), stage 1:
// the kit was written against today's imaging API before the kernel existed, so
// every case that must not change was seen green first. One case was red on that
// tree and is the reason the kernel validates its input: `reserve(NaN)` was
// ADMITTED, and the NaN hold it left made `spent + held + x > ceiling` false for
// every later call while it lived — one unpriceable request switched the ceiling
// off for everybody in flight beside it.

import { test, expect } from "@playwright/test";
import { keepEnv } from "./_helpers";
import { meterConformance, type KitRow, type MeterUnderTest } from "./_meterKit";
import {
  BUDGET_VAR,
  FLOOR_VAR,
  WINDOW_VAR,
  __resetBudget,
  budgetStats,
  recordSpend,
  release,
  reserve,
  settle,
  spendByAxis,
  spendRows,
  type Hold,
  type SpendEntry,
  type SpendRow,
} from "@/lib/imaging/budget";
import { ImagingError } from "@/lib/imaging/errors";
import { generate } from "@/lib/imaging/router";
import { SPEND_CLASSES, type SpendClassDef } from "@/lib/spend/classes";
import { createMeter } from "@/lib/spend/meter";

/** A kit row as the imaging ledger's own entry. The amount is read LAZILY, so
 *  a row that throws on read throws inside the meter, not inside this handle. */
const entry = (r: KitRow): SpendEntry => ({
  get usd() {
    return r.amount;
  },
  cap: (r.attributed === false ? undefined : "generate") as SpendEntry["cap"],
  provider: "google",
  model: "kit-model",
  outcome: r.outcome,
  basis: "estimate",
  at: r.at,
});

const imaging: MeterUnderTest = {
  name: "imaging-usd (lib/imaging/budget)",
  ceilingVar: BUDGET_VAR,
  windowVar: WINDOW_VAR,
  floorVar: FLOOR_VAR,
  defaultCeiling: 5,
  defaultWindowMs: 3_600_000,
  attributionAxis: "cap",
  reset: __resetBudget,
  reserve: (amount, now) => reserve(amount, now),
  release: (h) => release(h as Hold),
  settle: (h, rows) => settle(h as Hold, rows.map(entry)),
  book: (r) => recordSpend(entry(r)),
  stats: (now) => {
    const s = budgetStats(now);
    const c = s.counters;
    return {
      ceiling: s.ceilingUsd,
      floor: s.floorUsd,
      underFloor: s.underFloor,
      spent: s.spentUsd,
      held: s.heldUsd,
      remaining: s.remainingUsd,
      windowMs: s.windowMs,
      windowStart: s.windowStart,
      windowEnd: s.windowEnd,
      rows: s.rows,
      counters: {
        refusals: c.refusals,
        refused: c.refusedUsd,
        booked: c.booked,
        bookedFailed: c.bookedFailed,
        failed: c.failedUsd,
        unpriced: c.unpriced,
        evicted: c.evicted,
        evictedAmount: c.evictedUsd,
        lastEvictionAt: c.lastEvictionAt,
      },
    };
  },
  byAxis: (now) => {
    const a = spendByAxis(now);
    return {
      total: a.totalUsd,
      served: a.byOutcome.served,
      failed: a.byOutcome.failed,
      unattributed: a.unattributedUsd,
      axes: { cap: a.byCapability, provider: a.byProvider, model: a.byModel },
    };
  },
  rows: (now) => spendRows(now).map((r) => ({ at: r.at, amount: r.usd, outcome: r.outcome })),
  tamper: () => {
    const s = budgetStats();
    s.counters.booked = 0;
    s.spentUsd = 999;
    for (const r of spendRows() as SpendRow[]) r.usd = 999;
    const a = spendByAxis();
    a.totalUsd = 999;
    for (const axis of [a.byCapability, a.byProvider, a.byModel, a.byOutcome] as Record<string, number>[])
      for (const k of Object.keys(axis)) axis[k] = 999;
  },
  isOverBudget: (e) => e instanceof ImagingError && e.kind === "over-budget",
  isInvalid: (e) => e instanceof ImagingError && e.kind === "invalid-request",
};

meterConformance(imaging);

// ── The bare kernel, on a class of its own ────────────────────────────────
//
// The same kit against lib/spend directly: a meter with no imaging around it,
// on probe-only env vars. A later adapter (music, text) that fails a case the
// kernel passes has a bug in its adapter, and this run is what says so.

class KitInvalid extends Error {}
class KitOverBudget extends Error {}
type KitAxes = { cap?: string };
type KitEntry = KitRow;

const KERNEL_DEF: SpendClassDef = {
  ...SPEND_CLASSES["imaging-usd"],
  ceilingVar: "SPEND_KIT_CEILING",
  windowVar: "SPEND_KIT_WINDOW_MS",
  floorVar: "SPEND_KIT_FLOOR",
  defaultCeiling: 3,
  defaultWindowMs: 120_000,
};
const kernel = createMeter<KitEntry, KitAxes, "estimate">(KERNEL_DEF, {
  entry: (r) => ({
    amount: r.amount,
    outcome: r.outcome,
    basis: "estimate",
    axes: { cap: r.attributed === false ? undefined : "kit" },
    at: r.at,
  }),
  refuse: (r) => new KitOverBudget(`refused ${r.amount}`),
  invalid: (a) => new KitInvalid(`invalid ${a}`),
});

meterConformance({
  name: "kernel (lib/spend/meter, in-memory store)",
  ceilingVar: KERNEL_DEF.ceilingVar,
  windowVar: KERNEL_DEF.windowVar,
  floorVar: KERNEL_DEF.floorVar,
  defaultCeiling: KERNEL_DEF.defaultCeiling,
  defaultWindowMs: KERNEL_DEF.defaultWindowMs,
  attributionAxis: KERNEL_DEF.attributionAxis,
  reset: () => kernel.reset(),
  reserve: (a, now) => kernel.reserve(a, now),
  release: (h) => kernel.release(h),
  settle: (h, rows) => kernel.settle(h, rows),
  book: (r) => kernel.book(r),
  stats: (now) => {
    const s = kernel.stats(now);
    return { ...s, counters: { ...s.counters } };
  },
  byAxis: (now) => {
    const a = kernel.byAxis(now);
    return { total: a.total, served: a.byOutcome.served, failed: a.byOutcome.failed, unattributed: a.unattributed, axes: a.byAxis };
  },
  rows: (now) => kernel.rows(now),
  tamper: () => {
    const s = kernel.stats();
    s.counters.booked = 0;
    s.spent = 999;
    for (const r of kernel.rows()) {
      r.amount = 999;
      r.axes.cap = "tampered";
    }
    const a = kernel.byAxis();
    a.total = 999;
    a.byOutcome.served = 999;
    for (const axis of Object.values(a.byAxis)) for (const k of Object.keys(axis)) axis[k] = 999;
  },
  isOverBudget: (e) => e instanceof KitOverBudget,
  isInvalid: (e) => e instanceof KitInvalid,
});

// ── The imaging chokepoint, end to end ────────────────────────────────────
//
// The kit proves the meter. This proves the router hands the meter's verdict
// on: a batch whose size is not a number is refused at the gate, before any
// vendor is asked. The HTTP route validates `count` (lib/imaging/api.ts), but
// pipeline scripts call lib/imaging/router directly and nothing between them and
// the meter did.

test.describe("imaging chokepoint", () => {
  const realFetch = globalThis.fetch;
  keepEnv([BUDGET_VAR, WINDOW_VAR, FLOOR_VAR, "LOCAL_BINARIES", "GOOGLE_AI_API_KEY", "OLLAMA_HOST"]);

  test.beforeEach(() => {
    __resetBudget();
    delete process.env[WINDOW_VAR];
    delete process.env[FLOOR_VAR];
    delete process.env.OLLAMA_HOST;
    process.env.LOCAL_BINARIES = "off";
    process.env.GOOGLE_AI_API_KEY = "probe-google-key";
  });
  test.afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("a batch of NaN images is refused before any vendor is called", async () => {
    process.env[BUDGET_VAR] = "0"; // spend nothing
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches++;
      return new Response(
        JSON.stringify({ status: "completed", output_image: { data: "AQID", mime_type: "image/jpeg" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    let err: unknown;
    try {
      await generate({ prompt: "probe", aspect: "16:9", count: Number.NaN });
    } catch (e) {
      err = e;
    }
    console.log(`[meter] count=NaN under a $0 ceiling -> fetches=${fetches} err=${(err as Error)?.message}`);
    expect(fetches).toBe(0);
    expect(err).toBeInstanceOf(ImagingError);
    expect((err as ImagingError).kind).toBe("invalid-request");
    expect(budgetStats().heldUsd).toBe(0);
  });
});
