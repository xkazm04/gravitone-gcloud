// THE STORE CONNECTION: withStore opens an IndexedDB connection for one operation,
// closes it in a finally, and turns every failure into a published trouble. `key` is
// the `${projectId}:${phase}` record id that every reader and writer shares.
//
// Split out of the stepStore.ts door. Nothing here is exported on the door.

import { errorMessage } from "@gt/domain/errors";

import { STEPS_STORE, openDb } from "@/lib/studioDb";

import { noteStorageOk } from "./okChannel";
import { classify } from "./reportTrouble";
import type { StorageFailure, StorageTrouble } from "./storageOutcome";
import { report } from "./troubleChannel";

/* ────────────────────────────────── the store ────────────────────────────── */

export const key = (projectId: string, phase: string) => `${projectId}:${phase}`;

/** The steps store is created lazily rather than in the projects upgrade path,
 *  so an existing browser DB does not need a version bump to gain it.
 *
 *  THE CONNECTION IS OWNED HERE, and it used to leak. `openDb()` is not cached —
 *  it calls `indexedDB.open` fresh every time — so every caller owns the handle
 *  it gets back and has to close it. Every other call site in the data layer
 *  does, wrapping the work in `try { db = await openDb(); … } finally {
 *  db?.close(); }`. This was the one that did not — while being by a wide margin
 *  the most frequently called of them, because every caller above it fires
 *  `void saveStep(...)` on a keystroke.
 *
 *  THE COUNT IS NOT WRITTEN HERE ANY MORE, and that is the point. It said
 *  "thirteen other call sites… `lib/assets.ts` (3)"; measured 2026-09-06 there
 *  were twenty-one across five files and assets.ts held eight. The property was
 *  still true and the number had been wrong for long enough that nobody could
 *  have said when it stopped. The population is walked and the rule is gated in
 *  tests/golden-path/shared-notebook-contracts.probe.spec.ts — which is also
 *  where the one file that still does not close is listed, with its reason.
 *
 *  The cost was not abstract. The latest-wins ticket below abandons a write only
 *  when a later save for the same key is ISSUED before the earlier one reaches
 *  its `put`; typing at ~150-250ms a character never overlaps a ~1-5ms warm
 *  transaction, so every keystroke's write lands and every keystroke's connection
 *  stayed open for the life of the tab. Each one keeps a live `onversionchange`
 *  handler (lib/studioDb.ts), so a DB_VERSION bump fired one close-race per
 *  keystroke instead of one per tab — the shape of the two-tab upgrade hang that
 *  `e242b89` fixed from the other side, and a plausible source of the `blocked`
 *  failure kind this file exists to report.
 *
 *  The close is in a `finally` and runs after `fn(db)` has settled, never before:
 *  the transaction is live until then, and closing under it would abort the work
 *  rather than release it. Closing does not change an outcome — a successful
 *  write whose connection could not be closed is still a successful write. */
export async function withStore<T>(
  op: "read" | "write",
  projectId: string,
  phase: string,
  fn: (db: IDBDatabase) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; trouble: StorageTrouble }> {
  const trouble = (kind: StorageFailure, message: string) =>
    report({ kind, op, projectId, phase, message, at: Date.now() });

  if (typeof indexedDB === "undefined")
    return trouble("unavailable", "IndexedDB unavailable — nothing written in this session will survive it.");
  let db: IDBDatabase | undefined;
  try {
    db = await openDb();
    if (!db.objectStoreNames.contains(STEPS_STORE))
      return trouble("missing-store", `The "${STEPS_STORE}" store is not in this database.`);
    const value = await fn(db);
    noteStorageOk(op, projectId, phase);
    return { ok: true, value };
  } catch (e) {
    return trouble(classify(e), errorMessage(e));
  } finally {
    db?.close();
  }
}
