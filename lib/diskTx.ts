// THE DISK TRANSACTION KERNEL — server only.
//
// One exclusion primitive for every JSON-on-disk store that more than one
// process writes. Extracted from lib/publish/store.ts's `withStore` (which
// lib/sound/store.ts and lib/articles/store.ts repeat verbatim) the moment a
// third store needed it: the foundry catalogue (lib/foundry/catalogue.ts),
// which has the most writers of all — three app commits plus acquire.py and
// `intake --acquire` in Python.
//
// TWO LAYERS, AND BOTH ARE NEEDED.
//   · An in-process promise queue: cheap ordering inside one Node process,
//     so two requests in the same server never even contend for the file.
//   · An exclusive-create lock file (`open(…, "wx")`): the ONLY thing another
//     process — the CLI, or Python — can see and honour. Its body is
//     `{pid, at, by}` JSON; nothing reads it but a human, the protocol is the
//     file's existence and its mtime.
// A lock whose mtime is older than `staleMs` belongs to a holder that died
// mid-mutation (a mutation is milliseconds of JSON) and is broken. A live lock
// held past `waitMs` is the caller's error to report — `onTimeout` lets each
// store say it in its own error type.
//
// pipeline/foundry/catalogue_lock.py speaks this exact protocol for the
// catalogue; DEFAULT_LOCK_TIMING is the number both sides agree on, and the
// foundry selftest reads it from this file rather than restating it.

import { mkdir, open, rm, stat } from "node:fs/promises";
import path from "node:path";

export interface LockTiming {
  /** A lock file older than this has no living owner and is broken. */
  staleMs: number;
  /** How long a waiter polls a live lock before giving up. */
  waitMs: number;
}

export const DEFAULT_LOCK_TIMING: Readonly<LockTiming> = { staleMs: 30_000, waitMs: 10_000 };

export class LockTimeout extends Error {
  constructor(
    readonly lockFile: string,
    readonly waitMs: number,
  ) {
    super(`${lockFile} is held and the holder did not release it in ${waitMs} ms`);
    this.name = "LockTimeout";
  }
}

export interface LockOptions {
  timing?: LockTiming;
  /** Written into the lock body, for a human reading a stuck lock. */
  by?: string;
  /** Map a timeout to the store's own error. Defaults to LockTimeout. */
  onTimeout?: (lockFile: string, waitMs: number) => Error;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Take `lockFile` by exclusive create, breaking it when stale; resolves to
 *  the release function. */
export async function acquireLock(lockFile: string, opts: LockOptions = {}): Promise<() => Promise<void>> {
  const { staleMs, waitMs } = opts.timing ?? DEFAULT_LOCK_TIMING;
  await mkdir(path.dirname(lockFile), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      const fh = await open(lockFile, "wx");
      await fh.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString(), ...(opts.by ? { by: opts.by } : {}) }));
      await fh.close();
      return () => rm(lockFile, { force: true });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const age = await stat(lockFile).then((s) => Date.now() - s.mtimeMs).catch(() => 0);
      if (age > staleMs) {
        await rm(lockFile, { force: true });
        continue;
      }
      if (Date.now() - started > waitMs) throw opts.onTimeout ? opts.onTimeout(lockFile, waitMs) : new LockTimeout(lockFile, waitMs);
      await sleep(20 + Math.random() * 30);
    }
  }
}

/** A FIFO for async work in this process. A failed job does not poison the
 *  queue: the failure belongs to its caller. */
export function createSerializer(): <T>(fn: () => Promise<T>) => Promise<T> {
  let queue: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => undefined);
    return run;
  };
}

/**
 * An exclusive section over one lock file: in-process queue first, then the
 * file lock, released however `fn` ends. `lockFile` and `opts` are resolved
 * per call, so a store whose root comes from an env var (PUBLISH_STORE_DIR,
 * FOUNDRY_DIR) follows it after import.
 */
export function exclusiveSection(lockFile: () => string, opts: () => LockOptions = () => ({})): <T>(fn: () => Promise<T>) => Promise<T> {
  const serial = createSerializer();
  return <T>(fn: () => Promise<T>) =>
    serial(async () => {
      const release = await acquireLock(lockFile(), opts());
      try {
        return await fn();
      } finally {
        await release();
      }
    });
}
