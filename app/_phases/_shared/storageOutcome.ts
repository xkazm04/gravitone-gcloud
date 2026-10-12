// THE STORAGE FAILURE VOCABULARY, and the outcome every store call resolves to:
// StorageFailure, StorageTrouble, SaveOutcome, ReadOutcome.
//
// Types only. Split out so the trouble channel, the ok channel, the store and the
// reporters can all import these without importing each other.

/* ────────────────────────────── what went wrong ──────────────────────────── */

/** WHY the operation failed. Five storage destinations that used to be one
 *  `return fallback`, and they call for different things from a surface:
 *  `quota` means stop and export, `blocked` means close the other tab, and
 *  `unavailable` means this browser session was never going to persist.
 *
 *  `non-storage` is the sixth and it is NOT a storage failure — it is how a
 *  failure that merely arrived through this channel says so. The only producer
 *  is `reportTaskTrouble` (lib/GlobalErrorBridge's unhandled-rejection route),
 *  and it exists because the alternative was worse: every non-storage rejection
 *  — a `void fetch(...)` that dropped, an AbortError, a TypeError thrown in
 *  fire-and-forget code — fell through `classify` into `failed` and was voiced
 *  as "Not saved: the browser refused the operation", sending the creator to
 *  check a quota that was never the problem. A kind rather than a second
 *  channel, so the bell keeps one vocabulary and every exhaustive switch over
 *  this union is forced to learn it. */
export type StorageFailure =
  | "unavailable" // no IndexedDB at all — private mode, or a server render
  | "missing-store" // the DB opened without the steps store
  | "blocked" // another tab holds the old version open (studioDb's onblocked)
  | "quota" // out of room. The expensive one, and the reachable one
  | "failed" // everything else STORAGE-SHAPED, reported rather than guessed at
  | "non-storage"; // not storage at all — it only travelled this channel

export interface StorageTrouble {
  kind: StorageFailure;
  op: "read" | "write";
  projectId: string;
  phase: string;
  message: string;
  at: number;
}

/** A caller may ignore this — `void saveStep(...)` still compiles, and still
 *  reports through `onStorageTrouble`. Reading it is the stronger option, not
 *  the required one.
 *
 *  `superseded` is a SUCCESS: the write was deliberately abandoned because a
 *  later save for the same key had already been issued, so the newer data is
 *  what reaches disk. It is not a failure and must not be reported as one —
 *  nothing went wrong, and the user's most recent keystroke is what survives. */
export type SaveOutcome =
  | { ok: true; superseded?: false }
  | { ok: true; superseded: true }
  | { ok: false; trouble: StorageTrouble };

/** `ok: true, data: undefined` means THIS KEY HAS NEVER BEEN WRITTEN.
 *  `ok: false` means the read failed. Both used to be `undefined`, and they mean
 *  opposite things: the first is a new project, the second is a project whose
 *  work is on disk and out of reach. */
export type ReadOutcome<T> = { ok: true; data: T | undefined } | { ok: false; trouble: StorageTrouble };
