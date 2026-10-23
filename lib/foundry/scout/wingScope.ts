// The ACTIVE wing (spark scout-muse), per async call chain. The CLI runs its whole dispatch inside
// `withWing(--wing)`; a Board or ledger read runs each wing's work inside `withWing(w)`; a kernel job
// for a muse night runs its steps inside the wing its request names. Outside any scope the wing is
// `scout`, so every caller written before the wings existed keeps reading the scout root.
//
// AsyncLocalStorage, not a module variable: the Next server answers two Board requests at once, and
// a global would let one request's wing leak into the other's reads.

import { AsyncLocalStorage } from "node:async_hooks";

import { DEFAULT_WING, type ScoutWing } from "./wing";

const scope = new AsyncLocalStorage<ScoutWing>();

export function withWing<T>(wing: ScoutWing, fn: () => T): T {
  return scope.run(wing, fn);
}

export function activeWing(): ScoutWing {
  return scope.getStore() ?? DEFAULT_WING;
}
