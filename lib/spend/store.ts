// SPEND STORE — where a meter's window, holds and counters live.
//
// The meter (./meter.ts) never touches state except through `transact`, so the
// place the state lives is one swap. Today there is one adapter, in memory and
// per process — exactly what lib/imaging/budget.ts always had. A durable store
// shared across processes (the Next server, pipeline scripts, a second Cloud
// Run instance) is the next adapter, and it is the reason this seam exists:
// until then every process spends from a private window the others cannot see.
//
// THE CONTRACT A STORE KEEPS.
//   · `transact(fn)` runs `fn` against the state as ONE unit: a check and the
//     write that depends on it (reserve's "does it fit" and "hold it") cannot
//     be split by another writer. In memory that is free — JavaScript runs a
//     synchronous function to completion. A shared store must lock across the
//     read, `fn`, and the write.
//   · `fn` is synchronous and does not throw on caller input: the meter reads
//     and checks every caller-supplied value BEFORE it enters a transaction, so
//     a store that rolls back on a throw and one that commits in place behave
//     the same.
//   · The state is plain data (arrays, records, numbers), so a store that has
//     to serialise it can.

/** A reservation of estimated spend held while a call is in flight. */
export interface Hold {
  readonly id: string;
  readonly amount: number;
  readonly createdAt: number;
}

/**
 * What the meter has done to itself. Every field counts an event the gate
 * would otherwise have performed silently; none of them is read by the gate,
 * so none of them can change who is refused.
 */
export interface MeterCounters {
  /** Reservations the ceiling refused. The budget system's health metric. */
  refusals: number;
  /** The amount those refusals would have spent — what the ceiling saved. */
  refused: number;
  /** Rows actually booked. */
  booked: number;
  /** Of those, rows for a call that FAILED after reaching the vendor. */
  bookedFailed: number;
  /** What those failed rows carried — spend with nothing to show for it. */
  failed: number;
  /** Bookings that booked NOTHING because the figure was absent, non-finite or
   *  non-positive. Unpriced is not free: counted, never dropped. */
  unpriced: number;
  /** Rows the rolling window aged out — the ONLY way spend leaves a window. */
  evicted: number;
  /** What those aged-out rows carried. */
  evictedAmount: number;
  /** When the window last dropped anything, or null if it never has. */
  lastEvictionAt: number | null;
}

export const zeroCounters = (): MeterCounters => ({
  refusals: 0,
  refused: 0,
  booked: 0,
  bookedFailed: 0,
  failed: 0,
  unpriced: 0,
  evicted: 0,
  evictedAmount: 0,
  lastEvictionAt: null,
});

export interface SpendState<R> {
  /** Booked rows, oldest first. Only the window's eviction removes one. */
  rows: R[];
  /** Live holds by id, in the order they were taken. */
  holds: Record<string, Hold>;
  counters: MeterCounters;
}

export interface SpendStore<R> {
  /** Which adapter this is, for a stats surface to say where its numbers live. */
  readonly kind: "memory";
  transact<T>(fn: (state: SpendState<R>) => T): T;
  /** Test hook: empty rows, holds and counters. */
  reset(): void;
}

const emptyState = <R>(): SpendState<R> => ({ rows: [], holds: {}, counters: zeroCounters() });

/** Per-process, in memory. What every meter had before the kernel existed. */
export function memoryStore<R>(): SpendStore<R> {
  let state: SpendState<R> = emptyState<R>();
  return {
    kind: "memory",
    transact: (fn) => fn(state),
    reset: () => {
      state = emptyState<R>();
    },
  };
}
