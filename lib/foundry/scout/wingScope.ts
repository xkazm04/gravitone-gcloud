// The ACTIVE wing (spark scout-muse), per async call chain. Since the merge (spark scout-vision S3) the muse
// scope is the read-only ARCHIVE's: `status --wing muse`, a Board read or apply of a `muse:` packet, the file
// route, the ledger, the graph and the Library each read it inside `withWing("muse")`. Outside any scope the
// wing is `scout`, where every new night is written.
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
