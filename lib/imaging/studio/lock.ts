// ONE STUDIO TAB AT A TIME, ACROSS PROCESSES (spark scout-vision S6) - server-only.
//
// The driver opens a new tab in the operator's signed-in Chrome for every still (driver.ts
// `studioGenerate`) and, until this file, nothing stopped two of them at once. Once the scout's stills
// moved to the studio there are two kinds of caller in different processes: the box.chrome jobs
// (idea artboards, scene replicas, asset concepts - capacity 1 on that lane, so they never overlap
// each other) and an extract run on cloud.google, whose replicas and transfers name the studio from
// inside a job the box.chrome lane knows nothing about. Two tabs typing into one account's form is
// the race this lock closes: the guard on the wire arms ONE `Generate` per tab, but the page's own
// session, its balance read and its library are shared.
//
// The protocol is lib/diskTx.ts's - an exclusive-create file `{pid, at, by}`, broken when its mtime is
// older than the stale mark - with two changes for a hold measured in minutes, not milliseconds:
//   · STALE AFTER FIVE MINUTES, and a held lock is touched every minute, so a live generate (a page
//     load, up to three minutes of render, a download) is never mistaken for a dead holder, while a
//     process killed mid-still frees the studio five minutes later.
//   · A WAITER WAITS LONG (30 min by default): a night queues hundreds of stills behind one tab, and
//     the wait is the serialisation, not a fault. Past it the call fails before any click, unspent.
//
// The file lives under the out dir (`foundry-out/leonardo-studio.lock`, lib/fixtures/roots.ts
// `outPath`); LEONARDO_STUDIO_LOCK_DIR moves it, read per call, so a test points it at a temp dir.

import { utimes } from "node:fs/promises";
import path from "node:path";

import { acquireLock, createSerializer, type LockTiming } from "../../diskTx";
import { outPath } from "../../fixtures/roots";
import { StudioError } from "./types";

export const STUDIO_LOCK_FILE = "leonardo-studio.lock";

/** Stale after five minutes; a waiter gives up after thirty. */
export const STUDIO_LOCK_TIMING: Readonly<LockTiming> = { staleMs: 5 * 60_000, waitMs: 30 * 60_000 };

/** How often a held lock's mtime is refreshed: well inside the stale mark. */
const TOUCH_MS = 60_000;

/** The lock file this process would take: LEONARDO_STUDIO_LOCK_DIR, else the out dir. */
export function studioLockPath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const dir = env["LEONARDO_STUDIO_LOCK_DIR"]?.trim();
  return path.join(dir ? path.resolve(dir) : outPath(), STUDIO_LOCK_FILE);
}

export type StudioLockOptions = {
  /** Absent: `studioLockPath()`, read at the call. */
  readonly file?: string;
  readonly timing?: LockTiming;
  /** Written into the lock body, for a human reading a stuck lock. */
  readonly by?: string;
  readonly touchMs?: number;
};

// In-process callers queue here first, so they never even poll the file against each other.
const serial = createSerializer();

/** `fn` with the studio to itself: no other process or call of this one has a tab open meanwhile. */
export function withStudioLock<T>(fn: () => Promise<T>, o: StudioLockOptions = {}): Promise<T> {
  return serial(async () => {
    const file = o.file ?? studioLockPath();
    const timing = o.timing ?? STUDIO_LOCK_TIMING;
    const release = await acquireLock(file, {
      timing,
      by: o.by ?? "leonardo-studio",
      onTimeout: (f, ms) => new StudioError(`leonardo studio is busy: ${f} stayed held for ${Math.round(ms / 1000)} s by another still; nothing was generated`, "failed"),
    });
    const touch = setInterval(() => {
      const now = new Date();
      utimes(file, now, now).catch(() => undefined);
    }, o.touchMs ?? TOUCH_MS);
    touch.unref();
    try {
      return await fn();
    } finally {
      clearInterval(touch);
      await release();
    }
  });
}
