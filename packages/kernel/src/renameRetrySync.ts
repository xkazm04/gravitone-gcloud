import { renameSync } from "node:fs";

// ONE SYNCHRONOUS RENAME RETRY - the blocking twin of lib/renameRetry.ts, for writers that must
// stay synchronous (the spend file store, the styles export). Windows refuses a rename onto a file
// an indexer, an antivirus or an editor holds open with EPERM/EBUSY/EACCES, and the refusal clears
// in milliseconds, so the rename is retried briefly, then the last error is thrown untouched. The
// wait between tries is a real sleep (Atomics.wait), never a spin on the clock. Callers keep their
// own attempt count and delay, and their own clean-up of the tmp file on failure.

const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);

export interface SyncRetryOptions {
  /** Retries after the first try: the rename runs at most `retries + 1` times. */
  readonly retries: number;
  /** Milliseconds to block before retry number `attempt + 1` (`attempt` counts from 0). */
  readonly delayMs: (attempt: number) => number;
}

/** Block the thread for `ms` without burning CPU; the caller stays synchronous. */
export function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** renameSync(from, to), retried while it throws a transient Windows file error. */
export function renameRetryingSync(from: string, to: string, { retries, delayMs }: SyncRetryOptions): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      const code = e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "";
      if (attempt >= retries || !TRANSIENT.has(code)) throw e;
      sleepSync(delayMs(attempt));
    }
  }
}
