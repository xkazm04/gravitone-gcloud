// THE OK CHANNEL: noteStorageOk, which lets a successful store operation resolve the
// published trouble.
//
// noteStorageOk clears the trouble slot through resolveTroubleWhere in
// troubleChannel.ts, because the slot and its listener Set are owned there. Split
// out of the stepStore.ts door.
//
// It used to also keep a set of ok-listeners (`onStorageOk`) for the v1 bell's
// trouble ledger, which had to learn which of its accumulated troubles a success
// resolved. That ledger retired with the v1 shell and nothing subscribed any more,
// so the set went (2026-10-25); a listener that threw inside withStore's success
// path would have turned a landed write into a reported failure.

import { resolveTroubleWhere } from "./troubleChannel";

/* ─────────────────────── and when it stops going wrong ──────────────────── */

/**
 * Evidence that a scope works again: an operation of this `op` on this project
 * and step just succeeded. Clears the published trouble ONLY when it is the same
 * op, project and step, and only a storage-shaped one.
 *
 * SCOPED, NOT GLOBAL, because the slot has many producers: an asset blob that
 * hit the quota (reportStorageTrouble from lib/assets, projectId "") must not be
 * declared fixed by a 200-byte step record saving somewhere else — that would be
 * the same false resolution `dismiss` used to commit, made by a keystroke. And
 * `non-storage` is never resolved by a save: nothing about it was a save.
 *
 * Called on withStore's success path, so it runs on every keystroke's write. The
 * cost is three string compares.
 */
export function noteStorageOk(op: "read" | "write", projectId: string, phase: string): void {
  resolveTroubleWhere(
    (t) => t.kind !== "non-storage" && t.op === op && t.projectId === projectId && t.phase === phase,
  );
}
