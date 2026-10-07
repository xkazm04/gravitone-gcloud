// SPEND STORE — where a meter's window, holds and counters live.
//
// The meter (./meter.ts) never touches state except through `transact`, so the
// place the state lives is one swap. The first adapter is in memory and per
// process — exactly what lib/imaging/budget.ts always had. A durable store
// shared across processes (the Next server, pipeline scripts, a second Cloud
// Run instance) is the reason this seam exists: without one every process
// spends from a private window the others cannot see.
//
// `transact` RETURNS A PROMISE (card IMG-A stage 3a, 2026-10-07). Every lock
// that another process can see is async (lib/diskTx.ts acquireLock), so a
// synchronous transact left a shared store two bad choices: spin-wait on the
// hot path, or not exist. The memory store resolves at once; the meter awaits
// both the same way.
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
//   · A store whose lock cannot be had throws `SpendStoreBusy` and runs nothing.
//     The meter decides what that means: a reservation is refused, a write that
//     records a vendor's result is deferred, never dropped.

/** A reservation of estimated spend held while a call is in flight. */
export interface Hold {
  readonly id: string;
  readonly amount: number;
  readonly createdAt: number;
  /** The process that took it. A store shared across processes reclaims a
   *  hold whose owner died (./fileStore.ts); one without a pid never is. */
  readonly pid?: number;
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
  /** Holds reclaimed because their owner process died and their TTL ran out.
   *  Never booked: a hold is an estimate, not a bill. Only a shared store can
   *  hold another process's reservation, so in memory this stays 0. */
  expiredHolds: number;
  /** What those reclaimed holds were reserving. */
  expiredAmount: number;
  /** Writes that carried a vendor's result (a settle, a booking, a release)
   *  which missed the store's lock and were applied by a later transaction. */
  lateWrites: number;
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
  expiredHolds: 0,
  expiredAmount: 0,
  lateWrites: 0,
});

export interface SpendState<R> {
  /** Booked rows, oldest first. Only the window's eviction removes one. */
  rows: R[];
  /** Live holds by id, in the order they were taken. */
  holds: Record<string, Hold>;
  counters: MeterCounters;
}

/** The kinds of store there are. The hosted adapter (a shared ledger for the
 *  managed posture, where instances share no disk) is the next kind. */
export type SpendStoreKind = "memory" | "file";

export interface SpendStore<R> {
  /** Which adapter this is, for a stats surface to say where its numbers live. */
  readonly kind: SpendStoreKind;
  transact<T>(fn: (state: SpendState<R>) => T): Promise<T>;
  /** The state as this process last saw it, read without a lock: live for the
   *  memory store, the last read or write for a shared one. For a caller that
   *  cannot await and only needs what the refusal it is answering just read
   *  (lib/imaging/budgetForecast.ts earliestExpiry). Never write through it.
   *  Optional: a store without it reads as having seen nothing. */
  lastSeen?(): Readonly<SpendState<R>>;
  /** Test hook: empty rows, holds and counters. */
  reset(): void;
}

/** The store's lock could not be had in time. Nothing ran. */
export class SpendStoreBusy extends Error {
  constructor(
    readonly store: string,
    readonly waitMs: number,
  ) {
    super(`The spend ledger at ${store} is locked by another process and did not free in ${waitMs} ms.`);
    this.name = "SpendStoreBusy";
  }
}

export const emptyState = <R>(): SpendState<R> => ({ rows: [], holds: {}, counters: zeroCounters() });

/** Per-process, in memory. What every meter had before the kernel existed. */
export function memoryStore<R>(): SpendStore<R> {
  let state: SpendState<R> = emptyState<R>();
  return {
    kind: "memory",
    transact: async (fn) => fn(state),
    lastSeen: () => state,
    reset: () => {
      state = emptyState<R>();
    },
  };
}
