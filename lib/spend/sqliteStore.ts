// THE SQLITE SPEND STORE — a class's window in the kernel store, through the v1 port.
//
// F2 of docs/next/architecture-review-2026-10-18.md, carried out for ONE class
// as the operator ruled on 2026-10-18 ("text-usd only"): packages/kernel/src/spend
// /v1Port.ts is lib/spend/store.ts's contract over `spend_rows`,
// `spend_reservations` and `spend_counters`, so the class books into the same
// tables the kernel-native ledger writes and the two windows become one.
//
// THE STORE IS THE PROCESS'S KERNEL (lib/kernelProcess.ts `kernel()`): the one
// location every reader and writer already agrees on (GRAVITONE_STORE_PATH, else
// <out>/gravitone.sqlite), opened once per process and migrated on open
// (openKernel runs eventsMigrations, spendMigrations and the rest), which is the
// port's step 2. Resolved PER TRANSACTION, as fileStore resolves its directory:
// a probe that moves GRAVITONE_STORE_PATH closes the old handle, and a port bound
// to a closed store would write nowhere.
//
// Not server-only: the text turns this class counts also run under the
// operator's CLIs, which is why kernelProcess.ts carries no mark either.

import { v1SpendStore, type V1Row } from "@gt/kernel/spend/v1Port";
import type { Store } from "@gt/kernel/store";

import { kernel } from "../kernelProcess";
import { holdTtlMs, managedMarker } from "./fileStore";
import { emptyState, SpendStoreBusy, type SpendState, type SpendStore } from "./store";

export function sqliteStore<R>(cls: string): SpendStore<R> {
  let held: { readonly on: Store; readonly store: SpendStore<R> } | null = null;

  function open(): SpendStore<R> {
    const k = kernel();
    if (!k.ok) throw k.error;
    if (held?.on === k.value.store) return held.store;
    const port = v1SpendStore<V1Row>(k.value.store, cls, {
      busy: (s, ms) => new SpendStoreBusy(s, ms),
      managedMarker: managedMarker(),
      decode: (row) => row,
      holdTtlMs,
    });
    if (!port.ok) throw port.error;
    // The meter books only MeterRow-shaped rows, so what the port reads back is
    // what this class wrote: the same trust fileStore gives its own JSON.
    held = { on: k.value.store, store: port.value as unknown as SpendStore<R> };
    return held.store;
  }

  return {
    kind: "sqlite",
    transact(fn) {
      let store: SpendStore<R>;
      try {
        store = open();
      } catch (e) {
        return Promise.reject(e);
      }
      return store.transact(fn);
    },
    lastSeen: (): Readonly<SpendState<R>> => held?.store.lastSeen?.() ?? emptyState<R>(),
    reset: () => open().reset(),
  };
}
