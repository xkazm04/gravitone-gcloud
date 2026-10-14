import { afterAll, describe, expect, it } from "vitest";
import { eventsMigrations, verify } from "../src/events.ts";
import type { SpendClass } from "../src/spend/core.ts";
import { book, lapseOwner, release, reservationOf, reserve, settle, stats, spendMigrations, type SettleEntry } from "../src/spend/ledger.ts";
import type { Store } from "../src/store.ts";
import { must, templateStores } from "./helpers.ts";

// The kernel-native spend ledger: lib/spend's semantics on the store, plus the
// one upgrade - a reservation whose owner died LAPSES and keeps counting.

let clockMs = Date.parse("2026-10-15T12:00:00.000Z");
const tpl = templateStores([eventsMigrations, spendMigrations], { clock: () => new Date(clockMs) });
afterAll(() => tpl.dispose());

const HOUR = 3_600_000;
const imaging: SpendClass = { id: "imaging-usd", unit: "usd", windowMs: HOUR, ceiling: 1 };
const text: SpendClass = { id: "text-usd", unit: "usd", windowMs: HOUR, ceiling: null };
const served = (amount: number | undefined, basis = "vendor"): SettleEntry => ({ amount, outcome: "served", basis, axes: { cap: "plate", provider: "leonardo" } });

const st = (s: Store, c = imaging) => must(s.read((r) => stats(r, c)));
const hold = (s: Store, id: string, amount: number, c = imaging) => must(s.tx((t) => reserve(t, c, { id, amount, owner: "boot-1:4412" })));

describe("kernel/spend - reserve -> settle -> book", () => {
  it("a hold counts against the ceiling until settled; settle replaces it with what the vendor reported", () => {
    const s = tpl.fresh();
    expect(hold(s, "r1", 0.6).ok).toBe(true);
    expect(st(s)).toMatchObject({ spent: 0, held: 0.6, remaining: 0.4 });
    const r = must(must(s.tx((t) => settle(t, imaging, { id: "r1", entries: [served(0.25)] }))));
    expect(r.booked).toBe(1);
    expect(st(s)).toMatchObject({ spent: 0.25, held: 0, remaining: 0.75, rows: 1 });
    expect(must(verify(s)).state).toBe("intact");
  });

  it("the call that would cross is refused with `budget` and the numbers, and the refusal COMMITS its count", () => {
    const s = tpl.fresh();
    hold(s, "r1", 0.6);
    const r = hold(s, "r2", 0.6);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("budget");
    expect(r.refusal).toEqual({ spent: 0, held: 0.6, lapsed: 0, amount: 0.6, ceiling: 1, windowMs: HOUR, refusals: 1, scope: "period-ceiling" });
    expect(r.error.message).toContain("nothing was spent");
    expect(st(s).counters).toMatchObject({ refusals: 1, refused: 0.6 });
    expect(must(s.read((x) => x.all("SELECT type FROM events ORDER BY seq").map((e) => e["type"])))).toEqual(["spend.reserved", "spend.refused"]);
  });

  it("refuses NaN, Infinity and negatives before the store is touched; 0 is a ceiling, not 'disabled'", () => {
    const s = tpl.fresh();
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const r = hold(s, `bad-${bad}`, bad);
      expect(!r.ok && r.error.code, String(bad)).toBe("invalid");
    }
    expect(st(s).counters).toEqual({});
    const zero = { ...imaging, id: "zero-usd", ceiling: 0 };
    expect(hold(s, "z0", 0, zero).ok).toBe(true);
    expect(!hold(s, "z1", 0.01, zero).ok).toBe(true);
  });

  it("a count-only class has no ceiling: reserve is refused, book counts, remaining is null", () => {
    const s = tpl.fresh();
    const r = hold(s, "t1", 0.1, text);
    expect(!r.ok && r.error.code).toBe("refused");
    must(s.tx((t) => book(t, text, served(0.31), "seat.text")));
    must(s.tx((t) => book(t, text, served(undefined, "unpriced"), "seat.text")));
    expect(st(s, text)).toMatchObject({ spent: 0.31, ceiling: null, remaining: null, counters: { booked: 1, unpriced: 1 } });
  });

  it("unpriced is not free and not zero: absent, zero, negative or NaN books nothing and is counted", () => {
    const s = tpl.fresh();
    hold(s, "r1", 0.5);
    must(s.tx((t) => settle(t, imaging, { id: "r1", entries: [served(undefined), served(0), served(-2), served(Number.NaN), { ...served(0.2), outcome: "failed" }] })));
    expect(st(s)).toMatchObject({ spent: 0.2, rows: 1, counters: { unpriced: 4, booked: 1, bookedFailed: 1, failed: 0.2 } });
  });

  it("reserve and settle are idempotent on the caller's id; the first report is final", () => {
    const s = tpl.fresh();
    hold(s, "r1", 0.3);
    expect(hold(s, "r1", 0.3).ok).toBe(true);
    expect(st(s).held).toBe(0.3);
    const other = must(s.tx((t) => reserve(t, imaging, { id: "r1", amount: 0.9, owner: "boot-1:4412" })));
    expect(!other.ok && other.error.code).toBe("conflict");
    must(s.tx((t) => settle(t, imaging, { id: "r1", entries: [served(0.1)] })));
    const again = must(must(s.tx((t) => settle(t, imaging, { id: "r1", entries: [served(0.9)] }))));
    expect(again.already).toBe(true);
    expect(st(s).spent).toBeCloseTo(0.1, 12);
  });

  it("the window is the only thing that removes spend, and it removes nothing from the table", () => {
    const s = tpl.fresh();
    hold(s, "r1", 0.4);
    must(s.tx((t) => settle(t, imaging, { id: "r1", entries: [served(0.4)] })));
    clockMs += HOUR + 1;
    expect(st(s)).toMatchObject({ spent: 0, rows: 0, remaining: 1 });
    expect(must(s.read((r) => r.get("SELECT count(*) AS n FROM spend_rows")?.["n"]))).toBe(1);
    expect(s.tx((t) => t.run("DELETE FROM spend_rows")).ok).toBe(false);
    expect(s.tx((t) => t.run("UPDATE spend_rows SET amount = 0.01")).ok).toBe(false);
  });
});

describe("kernel/spend - a dead owner's reservation lapses and keeps counting (the upgrade over v1)", () => {
  it("lapsed counts at its estimate, ages with the window from the lapse, and blocks the ceiling meanwhile", () => {
    const s = tpl.fresh();
    hold(s, "r1", 0.7);
    expect(must(s.tx((t) => lapseOwner(t, imaging, "boot-1:4412")))).toBe(1);
    expect(st(s)).toMatchObject({ held: 0, lapsed: 0.7, remaining: 0.30000000000000004, counters: { lapsed: 1, lapsedAmount: 0.7 } });
    expect(hold(s, "r2", 0.5).ok).toBe(false);
    clockMs += HOUR + 1;
    expect(st(s).lapsed).toBe(0);
  });

  it("a late settle replaces the lapse with the vendor's figure (deferred finalization); release says nothing was spent", () => {
    const s = tpl.fresh();
    hold(s, "r1", 0.7);
    hold(s, "r2", 0.2);
    must(s.tx((t) => lapseOwner(t, imaging, "boot-1:4412")));
    must(s.tx((t) => settle(t, imaging, { id: "r1", entries: [served(0.45)] })));
    must(s.tx((t) => release(t, imaging, { id: "r2", by: "op-kazda" })));
    expect(st(s)).toMatchObject({ spent: 0.45, lapsed: 0, held: 0 });
    expect(must(s.read((r) => reservationOf(r, "r1")))?.state).toBe("settled");
    const twice = must(s.tx((t) => release(t, imaging, { id: "r2", by: "op-kazda" })));
    expect(!twice.ok && twice.error.code).toBe("refused");
  });
});
