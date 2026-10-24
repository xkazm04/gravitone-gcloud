// THE TROUBLE CHANNEL: the one published storage trouble slot, and its listener set.
//
// `listeners` is owned by this file and nowhere else: every subscriber
// (onStorageTrouble) and every notifier (report, clearStorageTrouble,
// resolveTroubleWhere) reads this one Set. Split out of v1's stepStore.ts; the door
// is now index.ts, which re-exports the public names. `report` and
// `resolveTroubleWhere` are exported for the sibling files that publish and resolve;
// they are not on the door.

import type { StorageTrouble } from "./storageOutcome";

/* ──────────────────────── the one place to learn about it ────────────────── */

let latest: StorageTrouble | null = null;
const listeners = new Set<() => void>();

/** Subscribe to storage trouble. `useSyncExternalStore`-shaped on purpose — v1's
 *  `useStorageTrouble` hook mounted it in one line; it retired with the v1 shell. */
export function onStorageTrouble(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The most recent failure, or null. Referentially stable between failures, so
 *  it is a valid `useSyncExternalStore` snapshot. */
export function lastStorageTrouble(): StorageTrouble | null {
  return latest;
}

export function clearStorageTrouble(): void {
  if (!latest) return;
  latest = null;
  listeners.forEach((l) => l());
}

export function report(t: StorageTrouble): { ok: false; trouble: StorageTrouble } {
  latest = t;
  listeners.forEach((l) => l());
  return { ok: false, trouble: t };
}

/** Clear the published trouble when `resolves` says a success settles it, and
 *  notify the trouble listeners. Called by noteStorageOk (okChannel.ts) with a
 *  predicate, so the `latest` slot and the `listeners` Set stay owned here. */
export function resolveTroubleWhere(resolves: (t: StorageTrouble) => boolean): void {
  const t = latest;
  if (!t || !resolves(t)) return;
  latest = null;
  listeners.forEach((l) => l());
}
