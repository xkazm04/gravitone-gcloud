// THE SPEND METER — reserve → settle → book, one kernel for every paid call.
//
// Lifted out of lib/imaging/budget.ts (card IMG-A, stage 1), where it was
// written, measured and probed first. The rules are that file's, and they are
// unit-neutral, so they live here once:
//
//   · RESERVE BEFORE SPENDING. A call prices itself with a pre-call estimate
//     and takes a hold; the hold counts against the ceiling until it is settled
//     or released, so N concurrent calls cannot each pass against the same
//     un-updated total. The call that would cross the ceiling is refused before
//     any vendor is touched, and the refusal is COUNTED before it is thrown.
//   · SETTLE REPLACES THE HOLD WITH WHAT HAPPENED. Served or failed, every row
//     the call reports is booked; the hold is gone either way, and it is gone
//     even when a row throws while being read.
//   · UNPRICED IS NOT FREE. A figure that is absent, zero, negative or not
//     finite books nothing and is counted, so a total can be read as the lower
//     bound it is.
//   · THE WINDOW IS THE ONLY THING THAT REMOVES SPEND, and it says so: every
//     eviction is counted, sized, and handed to the class's `evicted` hook.
//
// ONE RULE IS NEW HERE: a reservation must be a finite, non-negative number.
// The imaging ledger admitted `reserve(NaN)`, and the NaN hold it left made
// `spent + held + x > ceiling` false for EVERY later call while it lived — one
// unpriceable request switched the ceiling off for everything in flight beside
// it (tests/golden-path/_meterKit.ts, "poison"). It is now the class's
// `invalid` error, thrown before the store is touched.
//
// WHAT THE KERNEL DOES NOT KNOW. Prices, vendors, log formats, error classes.
// The adapter hands those in as hooks, so the lines an operator greps for and
// the HTTP status a refusal maps to stay where they were.

import { ceilingOf, floorOf, windowMsOf, type SpendClassDef } from "./classes";
import { memoryStore, type Hold, type MeterCounters, type SpendState, type SpendStore } from "./store";

export type SpendOutcome = "served" | "failed";

/** The values a row is attributed on, by axis name (see SpendClassDef.axes). */
export type Axes = Record<string, string | undefined>;

/** One booked call. `at` is when it SETTLED; the window is measured against it. */
export interface MeterRow<X extends Axes = Axes, B extends string = string> {
  at: number;
  amount: number;
  outcome: SpendOutcome;
  basis: B;
  axes: X;
}

/** What an adapter's own entry becomes before the meter books it. */
export interface MeterEntry<X extends Axes = Axes, B extends string = string> {
  amount: number | undefined;
  outcome: SpendOutcome;
  basis: B;
  axes: X;
  /** Defaults to now. */
  at?: number;
}

/** A reservation the ceiling refused, with the numbers it was refused on. */
export interface Refusal {
  amount: number;
  spent: number;
  held: number;
  ceiling: number;
  windowMs: number;
  /** The refusal count INCLUDING this one. */
  refusals: number;
}

/** What one prune dropped. */
export interface Eviction {
  dropped: number;
  droppedAmount: number;
  remaining: number;
  windowMs: number;
}

export interface MeterHooks<E, X extends Axes, B extends string> {
  /** The adapter's entry as the meter's. Called before any transaction, so an
   *  entry that throws while being read cannot leave state half-written. */
  entry(e: E): MeterEntry<X, B>;
  /** The error a refusal throws. Already counted when this is called. */
  refuse(r: Refusal): Error;
  /** The error a reservation that is not a finite, non-negative number throws. */
  invalid(amount: number): Error;
  /** The window aged rows out. */
  evicted?(e: Eviction): void;
}

export interface MeterStats {
  ceiling: number;
  floor: number;
  /** A declared band, some traffic, and a total beneath the band's bottom. */
  underFloor: boolean;
  spent: number;
  held: number;
  remaining: number;
  windowMs: number;
  windowStart: number;
  windowEnd: number;
  rows: number;
  counters: MeterCounters;
}

export interface MeterAxes {
  total: number;
  byOutcome: Record<SpendOutcome, number>;
  /** One record per axis the class declares, keyed by axis name. */
  byAxis: Record<string, Record<string, number>>;
  /** Spend on rows with no value on the class's attribution axis. */
  unattributed: number;
}

export interface Meter<E, X extends Axes = Axes, B extends string = string> {
  readonly def: SpendClassDef;
  readonly store: SpendStore<MeterRow<X, B>>;
  ceiling(): number;
  floor(): number;
  windowMs(): number;
  /** Booked spend inside the window (prunes first). */
  spent(now?: number): number;
  /** Total currently reserved across live holds. */
  held(): number;
  reserve(amount: number, now?: number): Hold;
  /** Drop a hold without booking. A hold already settled or released is a no-op. */
  release(hold: { readonly id: string }): void;
  settle(hold: { readonly id: string }, entries: E | E[]): void;
  book(entry: E): void;
  stats(now?: number): MeterStats;
  byAxis(now?: number): MeterAxes;
  /** The window's rows, oldest first, as copies. */
  rows(now?: number): MeterRow<X, B>[];
  reset(): void;
}

const sumRows = (rows: readonly { amount: number }[]): number => rows.reduce((a, r) => a + r.amount, 0);

const sumHolds = (holds: Record<string, Hold>): number => {
  let total = 0;
  for (const h of Object.values(holds)) total += h.amount;
  return total;
};

const priced = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export function createMeter<E, X extends Axes = Axes, B extends string = string>(
  def: SpendClassDef,
  hooks: MeterHooks<E, X, B>,
  store: SpendStore<MeterRow<X, B>> = memoryStore<MeterRow<X, B>>(),
): Meter<E, X, B> {
  type Row = MeterRow<X, B>;
  type State = SpendState<Row>;

  // Hold ids are unique per meter instance and never reused, reset or not.
  let holdSeq = 0;

  function prune(s: State, now: number): Eviction | null {
    const windowMs = windowMsOf(def);
    const cutoff = now - windowMs;
    const kept: Row[] = [];
    let droppedAmount = 0;
    let dropped = 0;
    for (const r of s.rows) {
      if (r.at >= cutoff) kept.push(r);
      else {
        dropped++;
        droppedAmount += r.amount;
      }
    }
    if (dropped === 0) return null; // nothing rolled over; stay silent
    s.rows = kept;
    s.counters.evicted += dropped;
    s.counters.evictedAmount += droppedAmount;
    s.counters.lastEvictionAt = now;
    return { dropped, droppedAmount, remaining: sumRows(kept), windowMs };
  }

  const announce = (e: Eviction | null): void => {
    if (e) hooks.evicted?.(e);
  };

  function bookIn(s: State, e: MeterEntry<X, B> & { at: number }): Eviction | null {
    if (!priced(e.amount)) {
      s.counters.unpriced++;
      return null;
    }
    const ev = prune(s, e.at);
    s.rows.push({ at: e.at, amount: e.amount, outcome: e.outcome, basis: e.basis, axes: e.axes });
    s.counters.booked++;
    if (e.outcome === "failed") {
      s.counters.bookedFailed++;
      s.counters.failed += e.amount;
    }
    return ev;
  }

  /** The adapter's entry, read ONCE into plain data outside any transaction. */
  function normalize(entry: E): MeterEntry<X, B> & { at: number } {
    const e = hooks.entry(entry);
    return {
      amount: e.amount,
      outcome: e.outcome,
      basis: e.basis,
      axes: { ...e.axes },
      at: e.at ?? Date.now(),
    };
  }

  const meter: Meter<E, X, B> = {
    def,
    store,
    ceiling: () => ceilingOf(def),
    floor: () => floorOf(def),
    windowMs: () => windowMsOf(def),

    spent(now = Date.now()) {
      const { ev, spent } = store.transact((s) => ({ ev: prune(s, now), spent: sumRows(s.rows) }));
      announce(ev);
      return spent;
    },

    held: () => store.transact((s) => sumHolds(s.holds)),

    reserve(amount, now = Date.now()) {
      if (!(Number.isFinite(amount) && amount >= 0)) throw hooks.invalid(amount);
      const ceiling = ceilingOf(def);
      const out = store.transact((s): { ev: Eviction | null; hold?: Hold; refusal?: Refusal } => {
        const ev = prune(s, now);
        const spent = sumRows(s.rows);
        const held = sumHolds(s.holds);
        if (spent + held + amount > ceiling) {
          // Counted BEFORE the throw, so a refusal cannot leave unrecorded down
          // the one path that does not return.
          s.counters.refusals++;
          s.counters.refused += amount;
          return {
            ev,
            refusal: { amount, spent, held, ceiling, windowMs: windowMsOf(def), refusals: s.counters.refusals },
          };
        }
        const hold: Hold = { id: `hold-${++holdSeq}-${now}`, amount, createdAt: now };
        s.holds[hold.id] = hold;
        return { ev, hold };
      });
      announce(out.ev);
      if (out.refusal) throw hooks.refuse(out.refusal);
      return { ...out.hold! };
    },

    release(hold) {
      store.transact((s) => {
        delete s.holds[hold.id];
      });
    },

    settle(hold, entries) {
      let list: (MeterEntry<X, B> & { at: number })[];
      try {
        list = (Array.isArray(entries) ? entries : [entries]).map(normalize);
      } catch (e) {
        // A row that cannot be read must not strand the reservation it was
        // meant to replace: the hold goes, and the caller hears why.
        meter.release(hold);
        throw e;
      }
      const evs = store.transact((s) => {
        delete s.holds[hold.id];
        return list.map((e) => bookIn(s, e));
      });
      for (const ev of evs) announce(ev);
    },

    book(entry) {
      const e = normalize(entry);
      announce(store.transact((s) => bookIn(s, e)));
    },

    stats(now = Date.now()) {
      const spent = meter.spent(now); // prunes first, so the counters are current
      const ceiling = ceilingOf(def);
      const floor = floorOf(def);
      const windowMs = windowMsOf(def);
      return store.transact((s) => {
        const held = sumHolds(s.holds);
        return {
          ceiling,
          floor,
          // Rows must be non-zero: an idle window is not a thrifty one.
          underFloor: floor > 0 && s.rows.length > 0 && spent < floor,
          spent,
          held,
          remaining: Math.max(ceiling - spent - held, 0),
          windowMs,
          windowStart: now - windowMs,
          windowEnd: now,
          rows: s.rows.length,
          counters: { ...s.counters },
        };
      });
    },

    byAxis(now = Date.now()) {
      const { ev, out } = store.transact((s) => {
        const ev = prune(s, now);
        const byAxis: Record<string, Record<string, number>> = {};
        for (const a of def.axes) byAxis[a] = {};
        const byOutcome: Record<SpendOutcome, number> = { served: 0, failed: 0 };
        let total = 0;
        let unattributed = 0;
        for (const r of s.rows) {
          total += r.amount;
          byOutcome[r.outcome] += r.amount;
          for (const a of def.axes) {
            const v = r.axes[a];
            if (v) byAxis[a][v] = (byAxis[a][v] ?? 0) + r.amount;
            else if (a === def.attributionAxis) unattributed += r.amount;
          }
        }
        return { ev, out: { total, byOutcome, byAxis, unattributed } };
      });
      announce(ev);
      return out;
    },

    rows(now = Date.now()) {
      const { ev, rows } = store.transact((s) => ({
        ev: prune(s, now),
        rows: s.rows.map((r) => ({ ...r, axes: { ...r.axes } })),
      }));
      announce(ev);
      return rows;
    },

    reset: () => store.reset(),
  };
  return meter;
}
