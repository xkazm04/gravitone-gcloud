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
// EVERY METHOD THAT TOUCHES STATE IS ASYNC (card IMG-A stage 3a), because a
// store another process can share sits behind an async lock. Each check and
// the write that depends on it still run inside ONE transaction: `reserve`
// decides and holds in one, and `check` (what assertWithinBudget always was, a
// reserve released at once) decides without holding in one, so no await can
// let a second reservation slip between a verdict and its effect.
//
// A LOCK THAT CANNOT BE HAD (`SpendStoreBusy`) means two different things:
//   · on a reservation, the call is refused with its own sentence (the class's
//     `busy` hook) before any vendor is touched. Nothing is spent.
//   · on a write that records what a vendor did (settle, book, release), the
//     vendor has already been asked. Dropping the row would under-read the
//     window, so it is logged, kept in this process, and applied at the head of
//     the next transaction that gets the lock, which counts it in
//     `counters.lateWrites`. The caller is never failed for it.
//
// WHAT THE KERNEL DOES NOT KNOW. Prices, vendors, log formats, error classes.
// The adapter hands those in as hooks, so the lines an operator greps for and
// the HTTP status a refusal maps to stay where they were.

import { ceilingOf, floorOf, isCountOnly, windowMsOf, type AnySpendClassDef, type CountOnlyClassDef, type SpendClassDef } from "./classes";
import { memoryStore, SpendStoreBusy, type Hold, type MeterCounters, type SpendState, type SpendStore } from "./store";

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
  /** The error a reservation throws when the store's lock could not be had.
   *  `message` is the kernel's sentence (busySentence). Defaults to a plain
   *  Error named SpendStoreBusy carrying it. */
  busy?(message: string): Error;
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
  spent(now?: number): Promise<number>;
  /** Total currently reserved across live holds. */
  held(): Promise<number>;
  reserve(amount: number, now?: number): Promise<Hold>;
  /** The verdict `reserve` would give, counted the same way, holding nothing.
   *  One transaction, so nothing can slip between a verdict and a release. */
  check(amount: number, now?: number): Promise<void>;
  /** Drop a hold without booking. A hold already settled or released is a no-op. */
  release(hold: { readonly id: string }): Promise<void>;
  settle(hold: { readonly id: string }, entries: E | E[]): Promise<void>;
  book(entry: E): Promise<void>;
  stats(now?: number): Promise<MeterStats>;
  byAxis(now?: number): Promise<MeterAxes>;
  /** The window's rows, oldest first, as copies. */
  rows(now?: number): Promise<MeterRow<X, B>[]>;
  /** The rows as this process last saw them, unpruned, as copies, read without
   *  a lock (SpendStore.lastSeen), for a caller that cannot await. */
  seenRows(): MeterRow<X, B>[];
  reset(): void;
}

/** What a count-only class reports: the stats without any figure that needs a
 *  ceiling. There is no `reserve`, `ceiling` or `remaining` to misread. */
export type CountStats = Omit<MeterStats, "ceiling" | "floor" | "underFloor" | "remaining" | "held">;

/** The meter over a class with no ceiling (`text-usd`): book and read, never
 *  hold or refuse. `reserve` is absent from the type and throws if reached. */
export type CountMeter<E, X extends Axes = Axes, B extends string = string> = Omit<
  Meter<E, X, B>,
  "def" | "reserve" | "check" | "ceiling" | "floor" | "held" | "stats" | "settle"
> & { readonly def: CountOnlyClassDef; stats(now?: number): Promise<CountStats> };

/** The sentence a reservation is refused with when the ledger's lock is held
 *  past its wait. Adapters wrap it in their own error type. */
export const busySentence = (cls: string, waitMs: number): string =>
  `The ${cls} spend ledger is locked by another process and did not free in ${waitMs} ms. ` +
  `Refused before any vendor was called; nothing was spent.`;

const sumRows = (rows: readonly { amount: number }[]): number => rows.reduce((a, r) => a + r.amount, 0);

const sumHolds = (holds: Record<string, Hold>): number => {
  let total = 0;
  for (const h of Object.values(holds)) total += h.amount;
  return total;
};

const priced = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export type CountMeterHooks<E, X extends Axes, B extends string> = Omit<MeterHooks<E, X, B>, "refuse" | "invalid" | "busy">;

export function createMeter<E, X extends Axes = Axes, B extends string = string>(
  def: SpendClassDef,
  hooks: MeterHooks<E, X, B>,
  store?: SpendStore<MeterRow<X, B>>,
): Meter<E, X, B>;
export function createMeter<E, X extends Axes = Axes, B extends string = string>(
  def: CountOnlyClassDef,
  hooks: CountMeterHooks<E, X, B>,
  store?: SpendStore<MeterRow<X, B>>,
): CountMeter<E, X, B>;
export function createMeter<E, X extends Axes = Axes, B extends string = string>(
  def: AnySpendClassDef,
  hooks: MeterHooks<E, X, B> | CountMeterHooks<E, X, B>,
  store: SpendStore<MeterRow<X, B>> = memoryStore<MeterRow<X, B>>(),
): Meter<E, X, B> | CountMeter<E, X, B> {
  // The overloads are the contract; inside, one body serves both shapes.
  const full = hooks as MeterHooks<E, X, B>;
  const counting = isCountOnly(def);
  const limits = def as SpendClassDef;
  type Row = MeterRow<X, B>;
  type State = SpendState<Row>;

  // Hold ids are unique per meter instance and never reused, reset or not.
  // They carry the pid, so two processes on one shared store never mint the
  // same id.
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
    if (e) full.evicted?.(e);
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
    const e = full.entry(entry);
    return {
      amount: e.amount,
      outcome: e.outcome,
      basis: e.basis,
      axes: { ...e.axes },
      at: e.at ?? Date.now(),
    };
  }

  const copyRow = (r: Row): Row => ({ ...r, axes: { ...r.axes } });

  /** Writes that missed the lock, oldest first, each applied at the head of
   *  the next transaction that gets it. Per process, never persisted. */
  let late: ((s: State) => (Eviction | null)[])[] = [];

  /** One transaction: late writes first, then `fn`, which returns its value
   *  and any evictions to announce once the store has committed. */
  async function run<T>(fn: (s: State) => { value: T; evs: (Eviction | null)[] }): Promise<T> {
    let taken: typeof late = [];
    try {
      const out = await store.transact((s) => {
        // Taken INSIDE the transaction, so two runs in flight cannot both
        // apply the same late write.
        taken = late;
        late = [];
        const evs: (Eviction | null)[] = [];
        for (const w of taken) {
          evs.push(...w(s));
          s.counters.lateWrites++;
        }
        const r = fn(s);
        return { value: r.value, evs: [...evs, ...r.evs] };
      });
      for (const ev of out.evs) announce(ev);
      return out.value;
    } catch (e) {
      // Nothing committed: whatever was taken goes back to the head.
      late = [...taken, ...late];
      throw e;
    }
  }

  /** A read that prunes first, so the counters it returns are current. */
  const read = <T>(now: number, fn: (s: State) => T): Promise<T> =>
    run((s) => {
      const ev = prune(s, now);
      return { value: fn(s), evs: [ev] };
    });

  /** A write that records what a vendor did. A held lock defers it; nothing
   *  else is swallowed. */
  async function write(what: string, amount: number, apply: (s: State) => (Eviction | null)[]): Promise<void> {
    try {
      await run((s) => ({ value: undefined, evs: apply(s) }));
    } catch (e) {
      if (!(e instanceof SpendStoreBusy)) throw e;
      late.push(apply);
      console.log(
        `[spend] ${def.id} ${what} missed the ledger lock (${e.waitMs} ms); kept in this process for the ` +
          `next transaction amount=${amount} pending=${late.length}`,
      );
    }
  }

  /** The ceiling's verdict, in one transaction. `take` holds what it admits. */
  async function gate(amount: number, now: number, take: boolean): Promise<Hold | undefined> {
    // A count-only class has nothing to hold against. Admitting would be a
    // silent "yes" from a gate that does not exist, so it is a loud bug.
    // (`reserve` throws this synchronously before reaching here.)
    if (counting) throw new Error(`spend class ${def.id} is count-only: it has no ceiling and cannot be reserved against`);
    if (!(Number.isFinite(amount) && amount >= 0)) throw full.invalid(amount);
    const ceiling = ceilingOf(limits);
    let out: { hold?: Hold; refusal?: Refusal };
    try {
      out = await read(now, (s): { hold?: Hold; refusal?: Refusal } => {
        const spent = sumRows(s.rows);
        const held = sumHolds(s.holds);
        if (spent + held + amount > ceiling) {
          // Counted BEFORE the throw, so a refusal cannot leave unrecorded down
          // the one path that does not return.
          s.counters.refusals++;
          s.counters.refused += amount;
          return { refusal: { amount, spent, held, ceiling, windowMs: windowMsOf(def), refusals: s.counters.refusals } };
        }
        if (!take) return {};
        const hold: Hold = { id: `hold-${process.pid}-${++holdSeq}-${now}`, amount, createdAt: now, pid: process.pid };
        s.holds[hold.id] = hold;
        return { hold };
      });
    } catch (e) {
      if (!(e instanceof SpendStoreBusy)) throw e;
      const sentence = busySentence(def.id, e.waitMs);
      console.log(`[spend] ${def.id} reserve refused: ledger lock held past ${e.waitMs} ms amount=${amount}`);
      throw full.busy ? full.busy(sentence) : Object.assign(new Error(sentence), { name: "SpendStoreBusy" });
    }
    if (out.refusal) throw full.refuse(out.refusal);
    return out.hold ? { ...out.hold } : undefined;
  }

  const meter: Meter<E, X, B> = {
    def: limits,
    store,
    ceiling: () => ceilingOf(limits),
    floor: () => floorOf(limits),
    windowMs: () => windowMsOf(def),

    spent: (now = Date.now()) => read(now, (s) => sumRows(s.rows)),

    held: () => run((s) => ({ value: sumHolds(s.holds), evs: [] })),

    reserve(amount, now = Date.now()) {
      // Thrown, not rejected: reserving against a count-only class is a
      // programming error, and it stays loud at the call that made it.
      if (counting) throw new Error(`spend class ${def.id} is count-only: it has no ceiling and cannot be reserved against`);
      return gate(amount, now, true) as Promise<Hold>;
    },

    async check(amount, now = Date.now()) {
      await gate(amount, now, false);
    },

    release: (hold) =>
      write("release", 0, (s) => {
        delete s.holds[hold.id];
        return [];
      }),

    async settle(hold, entries) {
      let list: (MeterEntry<X, B> & { at: number })[];
      try {
        list = (Array.isArray(entries) ? entries : [entries]).map(normalize);
      } catch (e) {
        // A row that cannot be read must not strand the reservation it was
        // meant to replace: the hold goes, and the caller hears why.
        await meter.release(hold);
        throw e;
      }
      const amount = list.reduce((a, e) => a + (priced(e.amount) ? e.amount : 0), 0);
      await write("settle", amount, (s) => {
        delete s.holds[hold.id];
        return list.map((e) => bookIn(s, e));
      });
    },

    async book(entry) {
      const e = normalize(entry);
      await write("book", priced(e.amount) ? e.amount : 0, (s) => [bookIn(s, e)]);
    },

    stats(now = Date.now()) {
      const windowMs = windowMsOf(def);
      // ONE transaction: prune first, so the counters are current, then read.
      if (counting)
        return read(now, (s) => ({
          spent: sumRows(s.rows),
          windowMs,
          windowStart: now - windowMs,
          windowEnd: now,
          rows: s.rows.length,
          counters: { ...s.counters },
        })) as Promise<MeterStats>;
      const ceiling = ceilingOf(limits);
      const floor = floorOf(limits);
      return read(now, (s) => {
        const spent = sumRows(s.rows);
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

    byAxis: (now = Date.now()) =>
      read(now, (s) => {
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
        return { total, byOutcome, byAxis, unattributed };
      }),

    rows: (now = Date.now()) => read(now, (s) => s.rows.map(copyRow)),

    seenRows: () => (store.lastSeen?.().rows ?? []).map(copyRow),

    reset: () => {
      late = [];
      store.reset();
    },
  };
  return meter as Meter<E, X, B>;
}
