import type { Result } from "@gt/domain/errors";
import type { BlobRef, BlobStore } from "./blob.ts";
import type { NotPromise, Store, Tx } from "./store.ts";

// THE EFFECT PORT - everything a driver does to the world, one call at a time.
//
// A kernel driver (job, lease, decision, spend) performs exactly three kinds of
// effect: a store transaction, a blob write, and a call to something outside
// (a provider, a GPU worker, a channel). Routing all three through this port is
// what lets crash.ts stop the driver after any one of them and ask whether what
// is left on disk is still a state the recovery path understands.
//
// Absorbed from v1's foundry fs port (lib/foundry/fsPort.ts, `__setFoundryFsPort`)
// and its effect-log harness (tests/golden-path/foundry-catalogue-tx.probe.spec.ts),
// which enumerated crash points by swapping the module's file writer. Upgraded:
// v1's port was a module-level mutable singleton a probe swapped in and had to
// remember to restore; this one is a value passed to the driver, so two tests
// cannot see each other's port and there is nothing to restore.

export type Effects = {
  /** A store transaction; `name` labels it in a recorded effect list. */
  tx<T>(name: string, fn: (t: Tx) => NotPromise<T>): Result<T>;
  blob(bytes: Uint8Array, mime: string): Promise<Result<BlobRef>>;
  /** Anything outside the machine. A driver never calls out except through here. */
  call<T>(name: string, fn: () => Promise<T>): Promise<T>;
};

export function liveEffects(store: Store, blobs: BlobStore): Effects {
  return {
    tx: (_name, fn) => store.tx(fn),
    blob: (bytes, mime) => blobs.put(bytes, mime),
    call: (_name, fn) => fn(),
  };
}
