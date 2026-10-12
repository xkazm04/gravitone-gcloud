// THE OK CHANNEL: the listeners that hear every successful store operation, and
// noteStorageOk, which notifies them and lets a success resolve the published trouble.
//
// `okListeners` is owned by this file and nowhere else. noteStorageOk clears the
// trouble slot through resolveTroubleWhere in troubleChannel.ts, because the slot
// and its listener Set are owned there. Split out of the stepStore.ts door.

import { resolveTroubleWhere } from "./troubleChannel";

/* ─────────────────────── and when it stops going wrong ──────────────────── */

export type StorageOkListener = (op: "read" | "write", projectId: string, phase: string) => void;
const okListeners = new Set<StorageOkListener>();

/** Hear every successful store operation. For a surface that has accumulated
 *  troubles of its own (the bell's ledger, components/ui/storageRemedy.ts) and
 *  must learn which of them a success resolves — the `latest` slot holds one. */
export function onStorageOk(listener: StorageOkListener): () => void {
  okListeners.add(listener);
  return () => void okListeners.delete(listener);
}

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
 * cost is one Set walk and three string compares.
 */
export function noteStorageOk(op: "read" | "write", projectId: string, phase: string): void {
  okListeners.forEach((l) => l(op, projectId, phase));
  resolveTroubleWhere(
    (t) => t.kind !== "non-storage" && t.op === op && t.projectId === projectId && t.phase === phase,
  );
}
