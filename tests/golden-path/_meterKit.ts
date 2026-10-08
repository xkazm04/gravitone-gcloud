// THE METER CONFORMANCE KIT — one set of named cases every spend meter must pass.
//
// WHY A KIT AND NOT A PROBE. Imaging, music and text each grew their own
// ceiling, and each grew its own probe restating the same laws: the ceiling
// refuses before a vendor is touched, a refusal is counted, an unpriced call is
// counted rather than booked as zero, the window is the only thing that removes
// spend and it says so. Restated three times, the laws drift three ways — which
// is exactly how music ended up checking the ceiling with no hold while imaging
// reserved one (docs/concepts/moonshots-2026-10-05, cluster C3).
//
// So the laws live here ONCE, written against a unit-neutral handle, and a meter
// proves itself by being handed to `meterConformance`. The case names are
// stable: a meter that passes "holds: release frees the reservation" passes the
// same sentence every other meter passes. A new vendor registers a meter and
// inherits the whole suite without writing a test.
//
// THE HANDLE IS THE ONLY PER-METER CODE. It maps the meter's own vocabulary
// (`usd`, `refusedUsd`, `byCapability`) onto the kit's (`amount`, `refused`,
// `axes`). It must not add behaviour: a handle that clamps or validates on the
// meter's behalf proves the handle, not the meter.
//
// The amounts below are chosen on a ceiling of 1 so the same figures read
// sensibly as dollars or as seconds.

import { test, expect } from "@playwright/test";
import { keepEnv } from "./_helpers";

export type KitOutcome = "served" | "failed";

/** One row handed to `book` or `settle`. `attributed: false` books it with no
 *  value on the meter's attribution axis, which is what `unattributed` counts. */
export interface KitRow {
  amount: number | undefined;
  outcome: KitOutcome;
  at?: number;
  attributed?: boolean;
}

export interface KitHold {
  readonly id: string;
}

export interface KitCounters {
  refusals: number;
  refused: number;
  booked: number;
  bookedFailed: number;
  failed: number;
  unpriced: number;
  evicted: number;
  evictedAmount: number;
  lastEvictionAt: number | null;
}

export interface KitStats {
  ceiling: number;
  floor: number;
  underFloor: boolean;
  spent: number;
  held: number;
  remaining: number;
  windowMs: number;
  windowStart: number;
  windowEnd: number;
  rows: number;
  counters: KitCounters;
}

export interface KitAxes {
  total: number;
  served: number;
  failed: number;
  unattributed: number;
  /** Every attribution axis the row carries, by name. */
  axes: Record<string, Record<string, number>>;
}

export interface MeterUnderTest {
  /** Shown in every case title, so a red line names the meter. */
  name: string;
  ceilingVar: string;
  windowVar: string;
  floorVar: string;
  defaultCeiling: number;
  defaultWindowMs: number;
  /** The axis whose absence makes a row `unattributed`. */
  attributionAxis: string;
  /** Any other env var the meter's surroundings read, held still per case. */
  extraEnv?: readonly string[];
  reset(): void;
  reserve(amount: number, now?: number): KitHold | Promise<KitHold>;
  release(hold: KitHold): void | Promise<void>;
  settle(hold: KitHold, rows: KitRow[]): void | Promise<void>;
  book(row: KitRow): void | Promise<void>;
  stats(now?: number): KitStats | Promise<KitStats>;
  byAxis(now?: number): KitAxes | Promise<KitAxes>;
  rows(now?: number): ReadonlyArray<{ at: number; amount: number; outcome: string }> | Promise<ReadonlyArray<{ at: number; amount: number; outcome: string }>>;
  /** Mutate everything the meter's OWN exports hand out — the stats object, its
   *  counters, the rows, the axis records — as a careless reader would. It must
   *  touch the raw return values, not this handle's mapped copies, or the case
   *  proves nothing. */
  tamper(): void | Promise<void>;
  isOverBudget(e: unknown): boolean;
  /** The meter's own "this reservation is not a number I can hold" error. */
  isInvalid(e: unknown): boolean;
}

/** What `reserve` threw, or a marker that it did not throw at all. */
async function thrown(fn: () => unknown): Promise<unknown> {
  try {
    await fn();
  } catch (e) {
    return e;
  }
  return NOT_THROWN;
}
const NOT_THROWN = Symbol("did not throw");

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

export function meterConformance(m: MeterUnderTest): void {
  test.describe(`meter conformance: ${m.name}`, () => {
    keepEnv([m.ceilingVar, m.windowVar, m.floorVar, ...(m.extraEnv ?? [])]);

    test.beforeEach(() => {
      m.reset();
      delete process.env[m.floorVar];
      process.env[m.ceilingVar] = "1";
      process.env[m.windowVar] = "60000";
    });

    const served = (amount: number | undefined, at?: number): KitRow => ({ amount, outcome: "served", at });

    // ── the ceiling ───────────────────────────────────────────────────────

    test("ceiling: a reservation that fits is admitted and held", async () => {
      const h = await m.reserve(0.4);
      expect(typeof h.id).toBe("string");
      const s = await m.stats();
      close(s.held, 0.4);
      close(s.remaining, 0.6);
      expect(s.spent).toBe(0);
    });

    test("ceiling: exactly reaching it is admitted, crossing it is refused with the over-budget error", async () => {
      await m.book(served(0.5));
      await m.reserve(0.5); // 0.5 + 0.5 == 1: reaching the ceiling is not crossing it
      const e = await thrown(() => m.reserve(0.01));
      expect(e).not.toBe(NOT_THROWN);
      expect(m.isOverBudget(e)).toBe(true);
    });

    test("ceiling: 0 means spend nothing, not disabled", async () => {
      process.env[m.ceilingVar] = "0";
      expect((await m.stats()).ceiling).toBe(0);
      expect(m.isOverBudget(await thrown(() => m.reserve(0.01)))).toBe(true);
      // A zero-amount reservation (an unpriceable call) still passes: it cannot
      // be gated on cost, and its real figure is booked afterwards.
      expect(await thrown(() => m.reserve(0))).toBe(NOT_THROWN);
    });

    test("ceiling: unset, negative or unreadable falls back to the safe default", async () => {
      for (const v of [undefined, "-1", "not-a-number"]) {
        if (v === undefined) delete process.env[m.ceilingVar];
        else process.env[m.ceilingVar] = v;
        expect((await m.stats()).ceiling, `ceiling var = ${String(v)}`).toBe(m.defaultCeiling);
      }
      expect(Number.isFinite(m.defaultCeiling)).toBe(true);
      for (const v of [undefined, "0", "-5", "soon"]) {
        if (v === undefined) delete process.env[m.windowVar];
        else process.env[m.windowVar] = v;
        expect((await m.stats()).windowMs, `window var = ${String(v)}`).toBe(m.defaultWindowMs);
      }
    });

    test("refusal: counted with what it saved, before the throw, and nothing else moves", async () => {
      await m.book(served(0.9));
      for (const _ of [0, 1]) expect(m.isOverBudget(await thrown(() => m.reserve(0.2)))).toBe(true);
      const s = await m.stats();
      expect(s.counters.refusals).toBe(2);
      close(s.counters.refused, 0.4);
      expect(s.held).toBe(0);
      close(s.spent, 0.9);
      expect(s.counters.booked).toBe(1);
      // The counters read; they never decide. A small call still passes.
      expect(await thrown(() => m.reserve(0.05))).toBe(NOT_THROWN);
      expect((await m.stats()).counters.refusals).toBe(2);
    });

    // ── holds ─────────────────────────────────────────────────────────────

    test("holds: held amount counts against the ceiling and against remaining", async () => {
      await m.reserve(0.36);
      await m.reserve(0.36);
      const s = await m.stats();
      close(s.held, 0.72);
      close(s.remaining, 0.28);
      expect(m.isOverBudget(await thrown(() => m.reserve(0.36)))).toBe(true);
    });

    test("holds: release frees the reservation and books nothing", async () => {
      const h = await m.reserve(0.7);
      await m.release(h);
      const s = await m.stats();
      expect(s.held).toBe(0);
      expect(s.spent).toBe(0);
      expect(s.counters.booked).toBe(0);
      expect(await thrown(() => m.reserve(0.9))).toBe(NOT_THROWN);
    });

    test("holds: settle swaps the hold for every row it was handed", async () => {
      const h = await m.reserve(0.5);
      await m.settle(h, [served(0.2), { amount: 0.1, outcome: "failed" }]);
      const s = await m.stats();
      expect(s.held).toBe(0);
      close(s.spent, 0.3);
      expect(s.counters.booked).toBe(2);
      expect(s.counters.bookedFailed).toBe(1);
      expect(s.rows).toBe(2);
    });

    test("holds: release after settle is a no-op, and so is a second release", async () => {
      const keep = await m.reserve(0.25);
      const h = await m.reserve(0.25);
      await m.settle(h, [served(0.25)]);
      await m.release(h);
      await m.release(h);
      const s = await m.stats();
      close(s.held, 0.25); // the OTHER hold is untouched
      close(s.spent, 0.25);
      await m.release(keep);
      expect((await m.stats()).held).toBe(0);
    });

    test("holds: a settle whose row throws still frees its hold", async () => {
      const h = await m.reserve(0.6);
      const poisoned = {
        get amount(): number {
          throw new Error("row exploded while being read");
        },
        outcome: "served" as const,
      };
      expect(await thrown(() => m.settle(h, [poisoned]))).not.toBe(NOT_THROWN);
      expect((await m.stats()).held).toBe(0);
    });

    // ── booking ───────────────────────────────────────────────────────────

    test("booking: an absent, zero, negative or non-finite figure books nothing and is counted unpriced", async () => {
      await m.book(served(0.05));
      for (const a of [undefined, 0, -0.2, Number.NaN, Number.POSITIVE_INFINITY]) await m.book(served(a));
      const s = await m.stats();
      expect(s.counters.booked).toBe(1);
      expect(s.counters.unpriced).toBe(5);
      close(s.spent, 0.05);
      expect(s.rows).toBe(1);
    });

    test("booking: a failed row is in the total and counted apart", async () => {
      await m.book(served(0.1));
      await m.book({ amount: 0.045, outcome: "failed" });
      const s = await m.stats();
      close(s.spent, 0.145);
      expect(s.counters.bookedFailed).toBe(1);
      close(s.counters.failed, 0.045);
    });

    // ── the window ────────────────────────────────────────────────────────

    test("window: aged-out rows leave only by eviction, which is counted and sized", async () => {
      const t0 = 5_000_000;
      await m.book(served(0.3, t0));
      await m.book(served(0.4, t0));
      expect((await m.stats(t0)).counters.evicted).toBe(0);
      const later = t0 + 61_000;
      const s = await m.stats(later);
      expect(s.spent).toBe(0);
      expect(s.counters.evicted).toBe(2);
      close(s.counters.evictedAmount, 0.7);
      expect(s.counters.lastEvictionAt).toBe(later);
      expect(await thrown(() => m.reserve(0.9, later))).toBe(NOT_THROWN);
    });

    test("window: the boundary travels with the total", async () => {
      process.env[m.ceilingVar] = "2.5";
      const now = 9_000_000;
      await m.book(served(0.5, now));
      const s = await m.stats(now);
      expect(s.windowEnd - s.windowStart).toBe(s.windowMs);
      expect(s.windowEnd).toBe(now);
      expect(s.ceiling).toBe(2.5);
      close(s.remaining, 2.0);
      expect(s.rows).toBe(1);
    });

    test("stats: every snapshot is a copy — a reader cannot reset or edit the meter", async () => {
      await m.book(served(0.5));
      await m.tamper();
      const s = await m.stats();
      expect(s.counters.booked).toBe(1);
      close(s.spent, 0.5);
      close((await m.byAxis()).total, 0.5);
      close((await m.rows())[0].amount, 0.5);
    });

    test("floor: reported only with a declared floor and real traffic, and it never refuses", async () => {
      process.env[m.floorVar] = "0.5";
      expect((await m.stats()).underFloor).toBe(false); // idle is not thrifty
      await m.book(served(0.1));
      expect((await m.stats()).underFloor).toBe(true);
      await m.book(served(0.5));
      expect((await m.stats()).underFloor).toBe(false);
      delete process.env[m.floorVar];
      m.reset();
      await m.book(served(0.1));
      expect((await m.stats()).underFloor).toBe(false);
      // A floor above the ceiling still admits what the ceiling admits.
      process.env[m.floorVar] = "50";
      expect(await thrown(() => m.reserve(0.5))).toBe(NOT_THROWN);
    });

    // ── one window, every view of it ──────────────────────────────────────

    test("byAxis: every view of the window sums to the total stats() reports", async () => {
      const t0 = 7_000_000;
      await m.book(served(0.9, t0 - 61_000)); // ages out: in neither view
      await m.book(served(0.1, t0));
      await m.book(served(0.2, t0));
      await m.book({ amount: 0.05, outcome: "failed", at: t0 });
      await m.book({ amount: 0.07, outcome: "served", at: t0, attributed: false });
      const s = await m.stats(t0);
      const a = await m.byAxis(t0);
      close(a.total, s.spent);
      close(a.total, 0.42);
      close(a.served + a.failed, a.total);
      close(a.failed, 0.05);
      close(a.unattributed, 0.07);
      const primary = a.axes[m.attributionAxis];
      expect(primary, `axis ${m.attributionAxis} is reported`).toBeTruthy();
      close(Object.values(primary).reduce((x, y) => x + y, 0) + a.unattributed, a.total);
      for (const [name, axis] of Object.entries(a.axes)) {
        const sum = Object.values(axis).reduce((x, y) => x + y, 0);
        expect(sum, `axis ${name} cannot exceed the total`).toBeLessThanOrEqual(a.total + 1e-9);
      }
      close((await m.rows(t0)).reduce((x, r) => x + r.amount, 0), s.spent);
    });

    // ── a reservation the meter cannot hold ───────────────────────────────

    test("poison: a non-finite or negative reservation is refused as invalid and never held", async () => {
      for (const a of [Number.NaN, -0.5, Number.POSITIVE_INFINITY]) {
        const e = await thrown(() => m.reserve(a));
        expect(e, `reserve(${a}) must not be admitted`).not.toBe(NOT_THROWN);
        expect(m.isInvalid(e), `reserve(${a}) is a caller error, not a budget verdict`).toBe(true);
      }
      const s = await m.stats();
      expect(s.held).toBe(0);
      expect(s.counters.refusals).toBe(0);
      expect(s.counters.refused).toBe(0);
      // And the ceiling is still a ceiling afterwards.
      await m.book(served(0.9));
      expect(m.isOverBudget(await thrown(() => m.reserve(0.2)))).toBe(true);
    });
  });
}
