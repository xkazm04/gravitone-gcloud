// THE FILE SPEND STORE — one window per machine, and a restart forgets nothing.
//
// Card IMG-A stage 3a, built as the operator decided on 2026-10-07 (ask
// c4c3335e, "Local now, hosted later"): a local file store behind the async
// SpendStore seam (./store.ts), so the Next server, a pipeline script and any
// other process on this machine spend from ONE window per class. The hosted
// adapter for the managed posture is a later kind; it is not stubbed here.
//
// ONE FILE PER CLASS: `<dir>/<class>.json` holds the class's whole SpendState
// (rows, holds, counters). `<dir>` is SPEND_STORE_DIR, resolved PER CALL, else
// `<cwd>/foundry-out/spend` (gitignored with the rest of foundry-out/).
//
// A TRANSACTION IS: take `<dir>/<class>.lock` (lib/diskTx.ts acquireLock, the
// exclusive-create lock every JSON-on-disk store here shares, behind an
// in-process queue so one server never contends with itself), read the state,
// reclaim dead holds, run `fn`, write the state by tmp+rename, release. A
// reserve is one read and one write. A lock that is not had within the wait
// throws SpendStoreBusy and runs nothing; the meter decides what that means.
//
// A HOLD WHOSE OWNER DIED. Every hold records the pid that took it. Inside any
// transaction a hold is removed when it is older than SPEND_HOLD_TTL_MS
// (default 15 min) AND its pid is not alive (`process.kill(pid, 0)` fails with
// ESRCH). Both, because each alone is wrong: a long render in a live process
// outlives any TTL, and a pid that has only just exited may belong to a call
// whose settle is still in a write queue. A reclaimed hold is counted in
// `counters.expiredHolds` with its amount, and is NEVER booked: a hold is an
// estimate, not a bill.
//
// THE MANAGED POSTURE HAS NO SHARED DISK. Every Cloud Run instance would get a
// private file and a private window, which is the per-process bug this store
// exists to fix, wearing a durable store's name. So constructing this store
// where any lib/deployment.ts MANAGED_MARKERS variable is set throws
// HostedSpendStoreNotBuilt. The question is whether instances share a disk,
// and LOCAL_BINARIES (whether this box may spawn a CLI) does not answer it.

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { MANAGED_MARKERS } from "../deployment";
import { createSerializer, acquireLock, DEFAULT_LOCK_TIMING, type LockTiming } from "../diskTx";
import { emptyState, SpendStoreBusy, type SpendState, type SpendStore } from "./store";

export const SPEND_STORE_DIR_VAR = "SPEND_STORE_DIR";
export const SPEND_HOLD_TTL_VAR = "SPEND_HOLD_TTL_MS";
/** 15 minutes: longer than any one vendor call this repo makes holds for. */
export const DEFAULT_HOLD_TTL_MS = 15 * 60_000;

/** The sentence a managed-posture caller is refused with, verbatim. */
export const HOSTED_NOT_BUILT = "hosted spend store not built (operator 2026-10-07: local now, hosted later)";

export class HostedSpendStoreNotBuilt extends Error {
  constructor(readonly marker: string) {
    super(
      `The file spend store cannot run on the managed posture (${marker} is set): instances there share no ` +
        `disk, so each would keep a private window. The hosted spend store is not built yet ` +
        `(operator 2026-10-07: local now, hosted later).`,
    );
    this.name = "HostedSpendStoreNotBuilt";
  }
}

/** The managed marker that is set, or null on a machine of our own. */
export function managedMarker(): string | null {
  for (const m of MANAGED_MARKERS) if (process.env[m]) return m;
  return null;
}

export function spendStoreDir(): string {
  const env = process.env[SPEND_STORE_DIR_VAR]?.trim();
  return env ? path.resolve(env) : path.join(process.cwd(), "foundry-out", "spend");
}

export function holdTtlMs(): number {
  const n = Number(process.env[SPEND_HOLD_TTL_VAR]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HOLD_TTL_MS;
}

/** Is `pid` a live process on this machine? EPERM means alive, not ours. */
function alive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

/** Write by tmp+rename. Windows can refuse a rename over a file another
 *  process has open for a moment (an indexer, an antivirus): retry briefly. */
function writeAtomic(file: string, body: string): void {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, body);
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (i >= 20 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        rmSync(tmp, { force: true });
        throw e;
      }
      const until = Date.now() + 5;
      while (Date.now() < until);
    }
  }
}

function readState<R>(file: string): SpendState<R> {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return emptyState<R>();
    throw e;
  }
  // A ledger that cannot be read is NOT an empty one: resetting it would lower
  // enforced spend. It fails loudly, and the operator decides.
  let parsed: SpendState<R>;
  try {
    parsed = JSON.parse(text) as SpendState<R>;
  } catch {
    throw new Error(`The spend ledger ${file} is not valid JSON; refusing to treat it as empty.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(`The spend ledger ${file} is not a ledger object; refusing to treat it as empty.`);
  const base = emptyState<R>();
  return {
    rows: Array.isArray(parsed.rows) ? parsed.rows : [],
    holds: parsed.holds && typeof parsed.holds === "object" ? parsed.holds : {},
    // Counters added after a file was written start at zero.
    counters: { ...base.counters, ...parsed.counters },
  };
}

/** Remove holds whose owner died and whose TTL ran out; count them. */
function reclaim<R>(cls: string, s: SpendState<R>, now: number): void {
  const ttl = holdTtlMs();
  for (const [id, h] of Object.entries(s.holds)) {
    if (typeof h.pid !== "number" || now - h.createdAt <= ttl || alive(h.pid)) continue;
    delete s.holds[id];
    s.counters.expiredHolds++;
    s.counters.expiredAmount += h.amount;
    console.log(`[spend] ${cls} reclaimed hold id=${id} amount=${h.amount} pid=${h.pid} ageMs=${now - h.createdAt} ttlMs=${ttl}`);
  }
}

export interface FileStoreOptions {
  /** The lock's stale and wait times. Defaults to lib/diskTx.ts's. */
  timing?: LockTiming;
}

/**
 * The file store for one class. Throws HostedSpendStoreNotBuilt on the managed
 * posture, at construction, so no instance there ever runs on it quietly.
 */
export function fileStore<R>(cls: string, opts: FileStoreOptions = {}): SpendStore<R> {
  const marker = managedMarker();
  if (marker) throw new HostedSpendStoreNotBuilt(marker);
  const serial = createSerializer();
  const timing = opts.timing ?? DEFAULT_LOCK_TIMING;
  let seen: SpendState<R> = emptyState<R>();
  const fileIn = (dir: string) => path.join(dir, `${cls}.json`);

  return {
    kind: "file",
    transact: (fn) =>
      serial(async () => {
        const dir = spendStoreDir();
        const release = await acquireLock(path.join(dir, `${cls}.lock`), {
          timing,
          by: `spend ${cls}`,
          onTimeout: (lockFile, waitMs) => new SpendStoreBusy(lockFile, waitMs),
        });
        try {
          const state = readState<R>(fileIn(dir));
          // Wall clock, not a caller's injected `now`: a TTL is about how long
          // a dead process's reservation has been sitting here.
          reclaim(cls, state, Date.now());
          const value = fn(state);
          writeAtomic(fileIn(dir), JSON.stringify(state));
          seen = state;
          return value;
        } finally {
          await release();
        }
      }),
    lastSeen: () => seen,
    reset: () => {
      const dir = spendStoreDir();
      mkdirSync(dir, { recursive: true });
      rmSync(fileIn(dir), { force: true });
      seen = emptyState<R>();
    },
  };
}
