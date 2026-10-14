import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { eventsMigrations, verify } from "../src/events.ts";
import { migrate } from "../src/migrate.ts";
import { stats, spendMigrations } from "../src/spend/ledger.ts";
import { HOSTED_NOT_BUILT, v1SpendStore, zeroCounters, type Hold, type SpendState, type SpendStore, type V1Row } from "../src/spend/v1Port.ts";
import { openStore, type Store } from "../src/store.ts";
import { must, scratch } from "./helpers.ts";

// THE V1 PORT runs v1's behaviour cases (tests/golden-path/spend-ledger.probe
// .spec.ts and the meter conformance kit's core) against the kernel store.
//
// The meter below is lib/spend/meter.ts's state logic, restated: packages may
// not import lib/, and the port's whole contract is "what the meter does to
// the state through `transact`". Every shared case runs twice - against a
// restatement of v1's memoryStore (the reference) and against the port - so a
// case that passes only on one is a behaviour the port changed.

const tmp = scratch("spend-v1");
const opened: Store[] = [];
afterAll(() => {
  for (const s of opened) s.close();
  tmp.dispose();
});
let n = 0;

class Busy extends Error {}

function file(): string {
  const f = path.join(tmp.dir, `v1-${++n}.sqlite`);
  const s = must(openStore(f));
  must(migrate(s, [eventsMigrations, spendMigrations], { snapshotDir: tmp.dir }));
  s.close();
  return f;
}

function port(f: string, extra: { isAlive?: (pid: number) => boolean; holdTtlMs?: () => number; busyMs?: number } = {}): { store: Store; spend: SpendStore<V1Row> } {
  const store = must(openStore(f, { busyTimeoutMs: extra.busyMs ?? 10_000 }));
  opened.push(store);
  const spend = must(v1SpendStore<V1Row>(store, "spend-kit", { busy: (s, ms) => new Busy(`${s} busy ${ms}`), decode: (r) => r, ...(extra.isAlive ? { isAlive: extra.isAlive } : {}), ...(extra.holdTtlMs ? { holdTtlMs: extra.holdTtlMs } : {}) }));
  return { store, spend };
}

/** v1's memoryStore, restated. */
function memoryStore(): SpendStore<V1Row> {
  let state: SpendState<V1Row> = { rows: [], holds: {}, counters: zeroCounters() };
  return { kind: "memory", transact: async (fn) => fn(state), lastSeen: () => state, reset: () => void (state = { rows: [], holds: {}, counters: zeroCounters() }) };
}

/** lib/spend/meter.ts reserve/settle/release/book/stats over a store. */
function meter(store: SpendStore<V1Row>, ceiling = 1, windowMs = 3_600_000) {
  let seq = 0;
  const prune = (s: SpendState<V1Row>, now: number): void => {
    const kept = s.rows.filter((r) => r.at >= now - windowMs);
    const dropped = s.rows.filter((r) => r.at < now - windowMs);
    if (dropped.length === 0) return;
    s.rows = kept;
    s.counters.evicted += dropped.length;
    s.counters.evictedAmount += dropped.reduce((a, r) => a + r.amount, 0);
    s.counters.lastEvictionAt = now;
  };
  const sum = (s: SpendState<V1Row>) => ({ spent: s.rows.reduce((a, r) => a + r.amount, 0), held: Object.values(s.holds).reduce((a, h) => a + h.amount, 0) });
  const bookIn = (s: SpendState<V1Row>, amount: number | undefined, outcome: "served" | "failed", at: number): void => {
    if (!(typeof amount === "number" && Number.isFinite(amount) && amount > 0)) {
      s.counters.unpriced++;
      return;
    }
    prune(s, at);
    s.rows.push({ at, amount, outcome, basis: "estimate", axes: { cap: "plate", model: undefined } });
    s.counters.booked++;
    if (outcome === "failed") {
      s.counters.bookedFailed++;
      s.counters.failed += amount;
    }
  };
  return {
    reserve: (amount: number, now = Date.now()) =>
      store.transact((s): Hold | null => {
        prune(s, now);
        const { spent, held } = sum(s);
        if (spent + held + amount > ceiling) {
          s.counters.refusals++;
          s.counters.refused += amount;
          return null;
        }
        const hold: Hold = { id: `hold-${process.pid}-${++seq}-${now}`, amount, createdAt: now, pid: process.pid };
        s.holds[hold.id] = hold;
        return hold;
      }),
    settle: (hold: { id: string }, amounts: (number | undefined)[], now = Date.now()) =>
      store.transact((s) => {
        Reflect.deleteProperty(s.holds, hold.id);
        for (const a of amounts) bookIn(s, a, "served", now);
      }),
    release: (hold: { id: string }) => store.transact((s) => void Reflect.deleteProperty(s.holds, hold.id)),
    book: (amount: number | undefined, outcome: "served" | "failed" = "served", now = Date.now()) => store.transact((s) => bookIn(s, amount, outcome, now)),
    stats: (now = Date.now()) =>
      store.transact((s) => {
        prune(s, now);
        const { spent, held } = sum(s);
        return { spent, held, remaining: Math.max(ceiling - spent - held, 0), rows: s.rows.length, counters: { ...s.counters } };
      }),
  };
}

const stores: [string, () => SpendStore<V1Row>][] = [
  ["v1 memoryStore (reference)", memoryStore],
  ["kernel v1 port", () => port(file()).spend],
];

for (const [name, make] of stores) {
  describe(`v1 behaviour cases - ${name}`, () => {
    it("holds: a hold counts, the reservation that would cross is refused and counted, release frees it", async () => {
      const m = meter(make());
      const h = await m.reserve(0.6);
      expect(h).not.toBeNull();
      expect(await m.reserve(0.6)).toBeNull();
      expect((await m.stats()).counters).toMatchObject({ refusals: 1, refused: 0.6 });
      if (h !== null) await m.release(h);
      expect((await m.stats()).held).toBe(0);
      expect(await m.reserve(0.6)).not.toBeNull();
    });

    it("settle replaces the hold with what happened; unpriced books nothing and is counted", async () => {
      const m = meter(make());
      const h = await m.reserve(0.5);
      if (h === null) throw new Error("refused");
      await m.settle(h, [0.2, undefined, Number.NaN, 0]);
      const s = await m.stats();
      expect(s).toMatchObject({ spent: 0.2, held: 0, rows: 1 });
      expect(s.counters).toMatchObject({ booked: 1, unpriced: 3 });
      await m.book(0.1, "failed");
      expect((await m.stats()).counters).toMatchObject({ booked: 2, bookedFailed: 1, failed: 0.1 });
    });

    it("the window is the only thing that removes spend, it says so, and it says so once", async () => {
      const m = meter(make());
      await m.book(0.3, "served", 1_000);
      await m.book(0.2);
      const s = await m.stats();
      expect(s).toMatchObject({ spent: 0.2, rows: 1 });
      expect(s.counters).toMatchObject({ evicted: 1, evictedAmount: 0.3 });
      expect((await m.stats()).counters.evicted).toBe(1);
    });
  });
}

describe("v1 behaviour cases - the kernel port's file-store edges", () => {
  it("case 1/2: two processes on one ledger share one window; a restart forgets nothing", async () => {
    const f = file();
    const a = meter(port(f).spend);
    const b = meter(port(f).spend);
    expect(await a.reserve(0.6)).not.toBeNull();
    expect(await b.reserve(0.6), "the second process sees the first one's hold").toBeNull();
    await b.book(0.25);
    const after = meter(port(f).spend);
    expect(await after.stats()).toMatchObject({ spent: 0.25, held: 0.6 });
  });

  it("case 5: a dead owner's hold is reclaimed after its TTL, counted, never booked; inside its TTL it still counts", async () => {
    const f = file();
    const p = port(f);
    await p.spend.transact((s) => void (s.holds["h-dead"] = { id: "h-dead", amount: 0.3, createdAt: Date.now() - 60_000, pid: 999_999 }));
    const young = await meter(port(f, { isAlive: () => false, holdTtlMs: () => 3_600_000 }).spend).stats();
    expect(young).toMatchObject({ held: 0.3, counters: { expiredHolds: 0 } });
    const old = await meter(port(f, { isAlive: () => false, holdTtlMs: () => 1 }).spend).stats();
    expect(old).toMatchObject({ held: 0, spent: 0, remaining: 1, counters: { expiredHolds: 1, expiredAmount: 0.3, booked: 0 } });
  });

  it("a hold this process owns is never reclaimed, however old", async () => {
    const m = meter(port(file(), { holdTtlMs: () => 1 }).spend);
    await m.reserve(0.4, 1);
    expect((await m.stats()).held).toBe(0.4);
  });

  it("a held lock throws the port's busy error and runs nothing", async () => {
    const f = file();
    const holder = new DatabaseSync(f);
    holder.exec("BEGIN IMMEDIATE");
    const m = meter(port(f, { busyMs: 50 }).spend);
    await expect(m.reserve(0.1)).rejects.toBeInstanceOf(Busy);
    holder.exec("ROLLBACK");
    holder.close();
    expect((await m.stats()).held).toBe(0);
  });

  it("refuses the managed posture with v1's sentence", () => {
    const s = must(openStore(file()));
    const r = v1SpendStore<V1Row>(s, "spend-kit", { busy: () => new Busy(), decode: (x) => x, managedMarker: "K_SERVICE" });
    expect(!r.ok && r.error.code).toBe("refused");
    expect(!r.ok && r.error.message).toContain(HOSTED_NOT_BUILT);
    s.close();
  });

  it("is ONE window with the kernel-native ledger, and every change it makes is on the ledger chain", async () => {
    const p = port(file());
    const m = meter(p.spend);
    const h = await m.reserve(0.5);
    if (h === null) throw new Error("refused");
    await m.settle(h, [0.2]);
    const k = must(p.store.read((r) => stats(r, { id: "spend-kit", unit: "usd", windowMs: 3_600_000, ceiling: 1 })));
    expect(k).toMatchObject({ spent: 0.2, held: 0, counters: { booked: 1 } });
    expect(must(p.store.read((r) => r.all("SELECT type FROM events ORDER BY seq").map((e) => e["type"])))).toEqual(["spend.reserved", "spend.settled"]);
    expect(must(verify(p.store)).state).toBe("intact");
  });
});
