// WHICH STORE A SPEND CLASS IS ON — the one place that decides.
//
// Card IMG-A stage 3a (operator 2026-10-07, ask c4c3335e: "Local now, hosted
// later"). Every adapter (lib/imaging/budget.ts, lib/music/budget.ts,
// lib/imaging/video/budget.ts, lib/text/spend.ts) hands its meter
// `spendStoreFor(class)`, so the rule lives here once:
//
//   · SPEND_STORE=memory      → the in-process store. The node test lane pins
//                               this (playwright.config.ts), so no probe but
//                               the one that opts in ever writes a ledger file.
//   · a managed marker is set → the in-process store, and the class's stats
//                               say why: on the managed posture instances share
//                               no disk, and the hosted store is not built.
//   · otherwise               → the file store (./fileStore.ts): one window per
//                               class per machine, and a restart forgets nothing.
//                               EXCEPT `text-usd`, which is on the kernel store
//                               (./sqliteStore.ts) - F2 of docs/next/architecture-
//                               review-2026-10-18.md, operator 2026-10-18: "text-usd
//                               only". It is count-only, so the move refuses
//                               nothing; every enforcing class stays on the file
//                               until the operator moves it. SPEND_STORE=file asks
//                               for "the machine's durable store", which for it is
//                               this one.
//
// SPEND_STORE=file on the managed posture is a contradiction and is refused
// loudly (HostedSpendStoreNotBuilt) rather than quietly downgraded: whoever set
// it believes the window is shared, and it would not be. Any other value of
// SPEND_STORE is refused the same way, so a typo cannot pick a store.
//
// DECIDED PER CALL, not at import, for the reason lib/sound/store.ts resolves
// its directory per call: a module that loaded before the environment was
// complete must not keep a stale answer. The memory store is one instance per
// class for the life of the process, so switching away and back loses nothing.

import { fileStore, HOSTED_NOT_BUILT, HostedSpendStoreNotBuilt, managedMarker } from "./fileStore";
import { sqliteStore } from "./sqliteStore";
import { memoryStore, type SpendState, type SpendStore, type SpendStoreKind } from "./store";

export const SPEND_STORE_VAR = "SPEND_STORE";

/** The classes on the kernel store. One, until the operator moves another. */
export const SQLITE_CLASSES: ReadonlySet<string> = new Set(["text-usd"]);

interface Pick<R> {
  store: SpendStore<R>;
  reason?: string;
}

/** The store `cls` spends from, resolved per call. Its `kind` and `reason()`
 *  name the store the next transaction will use, and why when it is not the
 *  one this machine would otherwise get. */
export function spendStoreFor<R>(cls: string): SpendStore<R> {
  const memory = memoryStore<R>();
  let durable: SpendStore<R> | null = null;
  let last: SpendStore<R> = memory;

  function pick(): Pick<R> {
    const want = process.env[SPEND_STORE_VAR]?.trim();
    if (want === "memory") return { store: memory };
    if (want && want !== "file")
      throw new Error(`${SPEND_STORE_VAR}=${want} is not a spend store: it is "memory" or "file", or unset.`);
    const marker = managedMarker();
    if (marker) {
      if (want === "file") throw new HostedSpendStoreNotBuilt(marker);
      return { store: memory, reason: HOSTED_NOT_BUILT };
    }
    // Built once, lazily: constructing it is what refuses the managed posture,
    // and its directory (or kernel store) is resolved per call inside it.
    return { store: (durable ??= SQLITE_CLASSES.has(cls) ? sqliteStore<R>(cls) : fileStore<R>(cls)) };
  }

  return {
    get kind(): SpendStoreKind {
      return pick().store.kind;
    },
    reason: () => pick().reason,
    transact(fn) {
      let store: SpendStore<R>;
      try {
        store = pick().store;
      } catch (e) {
        return Promise.reject(e);
      }
      last = store;
      return store.transact(fn);
    },
    // What this process last saw, on whichever store it last used: a sync
    // reader answering a refusal wants the state that refusal was read from.
    lastSeen: (): Readonly<SpendState<R>> => last.lastSeen?.() ?? memory.lastSeen!(),
    reset: () => pick().store.reset(),
  };
}
