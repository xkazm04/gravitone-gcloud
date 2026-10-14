// WHY A STORAGE CALL FAILED, and what that means to the person - as a Result.
//
// v1 classified (lib/steps/reportTrouble.ts `classify`, duck-typed on `name` because
// DOMException is absent in some runtimes this is merely imported into, and a
// classifier that throws while classifying is worse than the failure) and voiced the
// classes in components/ui/NotificationBell.tsx `TROUBLE_WORD`. That copy is the
// product working (CLAUDE.md's standing exemption: real errors explain themselves
// in full) and is kept verbatim for the classes a key-value store can hit.
//
// Dropped: `blocked` and `missing-store`, which are IndexedDB upgrade states; the
// browser no longer holds a database (the stores are server-side, plan §3.3), only
// small registered keys. `non-storage` stays with the error bridge that produces it.

import { AppError, type AppErrorCode } from "@gt/domain/errors";

export type StorageTrouble = "quota" | "unavailable" | "failed";

/** v1 NotificationBell TROUBLE_WORD, verbatim. */
export const TROUBLE_COPY: Readonly<Record<StorageTrouble, string>> = {
  quota: "This browser's storage is full. Nothing more will be saved until you free space — open work is still on screen, but a reload would lose it.",
  unavailable: "This browser session cannot store anything — private mode, or storage is switched off. Nothing written here will survive a reload.",
  failed: "The browser refused the operation.",
};

/**
 * The taxonomy code each class maps to. A full disk and a store that is switched
 * off are both a dependency that is down, so callers' retry/explain branches see
 * `unavailable`; `troubleOf` recovers the class for the surface that names it.
 */
const CODE: Readonly<Record<StorageTrouble, AppErrorCode>> = { quota: "unavailable", unavailable: "unavailable", failed: "unavailable" };

const DETAIL = "storage:";

export function classify(e: unknown): StorageTrouble {
  const name = typeof e === "object" && e !== null && "name" in e ? e.name : undefined;
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return "quota";
  // A blocked site or an opaque origin throws SecurityError on the first touch.
  if (name === "SecurityError") return "unavailable";
  return "failed";
}

export function troubleError(kind: StorageTrouble, key: string, cause?: unknown): AppError {
  return new AppError(CODE[kind], `${TROUBLE_COPY[kind]} (${key})`, cause === undefined ? { detail: `${DETAIL}${kind}` } : { detail: `${DETAIL}${kind}`, cause });
}

/** The storage class an error carries, or undefined for any other error. */
export function troubleOf(e: AppError): StorageTrouble | undefined {
  const d = e.detail;
  if (d === undefined || !d.startsWith(DETAIL)) return undefined;
  const k = d.slice(DETAIL.length);
  return k === "quota" || k === "unavailable" || k === "failed" ? k : undefined;
}
