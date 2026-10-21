// ONE RETRY FOR A FILE OPERATION WINDOWS REFUSES FOR A MOMENT — server only.
//
// A rename onto a file a reader holds open (a <video> seeking the old render,
// the poll route, an indexer), or a read racing a writer's rename, fails with
// EPERM/EBUSY/EACCES and the refusal clears in milliseconds. The stores that
// speak this retry differ in how long a window they need, so the attempt count
// and the delay are options; each caller passes the values it measured.
//
// lib/sound/store.ts renameInto keeps its own copy: lane lock-via-disktx owns
// that file.

import { rename } from "node:fs/promises";

const TRANSIENT = new Set(["EPERM", "EBUSY", "EACCES"]);

export interface RetryOptions {
  /** Retries after the first try: the operation runs at most `retries + 1` times. */
  retries: number;
  /** Milliseconds to wait before retry number `attempt + 1` (`attempt` counts from 0). */
  delayMs: (attempt: number) => number;
}

/** Run `op`, retrying while it throws a transient Windows file error. The last
 *  failure, and any other error, is rethrown untouched. */
export async function retryTransientFs<T>(op: () => Promise<T>, { retries, delayMs }: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (e) {
      if (attempt >= retries || !TRANSIENT.has((e as NodeJS.ErrnoException).code ?? "")) throw e;
      await new Promise((r) => setTimeout(r, delayMs(attempt)));
    }
  }
}

export const renameRetry = (from: string, to: string, opts: RetryOptions): Promise<void> =>
  retryTransientFs(() => rename(from, to), opts);
