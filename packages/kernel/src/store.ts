import { DatabaseSync, type SQLInputValue, type SQLOutputValue, type StatementSync } from "node:sqlite";
import { AppError, err, ok, type Result } from "@gt/domain/errors";

// THE STORE - the one transactional port every kernel module writes through.
//
// It replaces the four lock copies of v1 (lib/diskTx.ts and the three it was
// extracted from: lib/sound/store.ts, lib/articles/store.ts, Python's
// catalogue_lock.py), which each rebuilt the same thing by hand: an in-process
// FIFO so one server never contends with itself, plus an exclusive-create lock
// file (`open(..., "wx")`, EEXIST/EPERM/EBUSY as contention) that the CLI and
// Python could see. SQLite already is that protocol, done properly:
//
//   - CROSS-PROCESS EXCLUSION is the database's write lock. Every write runs
//     under BEGIN IMMEDIATE, which takes the lock BEFORE the first read, so a
//     read-modify-write can never interleave with another writer's (v1's lost
//     update, measured 2026-10-05 in the foundry: four in four schedules). A
//     deferred BEGIN would read first and upgrade later, and under WAL that
//     upgrade fails with SQLITE_BUSY_SNAPSHOT instead of waiting.
//   - THE WAIT IS BOUNDED, as v1's `waitMs` was: `busy_timeout`. A holder that
//     outlasts it is `unavailable` (v1's 503 LockTimeout), never a silent retry.
//   - A DEAD HOLDER cannot strand the lock. v1 needed `staleMs` and an mtime
//     to break a lock whose owner died mid-mutation; SQLite releases a dead
//     process's lock with its file handles, and an uncommitted transaction is
//     rolled back from the WAL on the next open. There is no stale lock to
//     break, so there is no wrong guess about one either.
//   - ATOMICITY replaces tmp + rename (and its Windows EPERM retry loop) for
//     every record this store holds. Bytes too large for a row are blobs
//     (blob.ts), which keep the tmp + rename discipline.
//
// THE CALLBACK IS SYNCHRONOUS, ON PURPOSE (Director decision 1). node:sqlite
// is synchronous, and a callback that cannot await cannot do I/O while it holds
// the write lock: "no network call inside a transaction" is a type, not a
// review comment. v1's diskTx needed its FIFO precisely because async work
// interleaved inside the fence. A callback that returns a promise anyway is
// rolled back and refused at runtime as well.
//
// What this costs a hosted adapter later: a networked database cannot run a
// transaction body synchronously, so that adapter must either buffer (read
// snapshot, run `fn` against it, send the writes with a verify step at commit,
// the transactions-over-a-replicated-log shape) or change this port to async.
// The kernel modules above it stay unchanged only in the first case; that is
// the adapter's problem to solve, and the reason the port is this narrow.

export type Row = Record<string, SQLOutputValue>;
export type Param = SQLInputValue;

/** A value a transaction body may return: anything but a promise. */
export type NotPromise<T> = T extends PromiseLike<unknown> ? never : T;

/** The read half of the port. `at` is the store clock's reading when the
 *  transaction began: every row a transaction stamps shares one instant. */
export type Reader = {
  readonly at: string;
  get(sql: string, ...params: Param[]): Row | undefined;
  all(sql: string, ...params: Param[]): Row[];
};

/** The write half. Only a `Tx` can write, and only inside `store.tx`. */
export type Tx = Reader & {
  run(sql: string, ...params: Param[]): { changes: number; lastRowid: number };
  /** Multi-statement SQL with no parameters; migrations' DDL. */
  exec(sql: string): void;
};

export type Store = {
  /** ":memory:" or the absolute file path. */
  readonly location: string;
  /** One write transaction under BEGIN IMMEDIATE. A throw rolls back: an
   *  `AppError` keeps its code, anything else becomes `internal` with the cause. */
  tx<T>(fn: (t: Tx) => NotPromise<T>): Result<T>;
  /** One read transaction: a consistent snapshot across its statements,
   *  refused any write by `query_only`. */
  read<T>(fn: (r: Reader) => NotPromise<T>): Result<T>;
  /** A consistent copy, WAL content included (VACUUM INTO), verified by an
   *  integrity check before it is called a snapshot. */
  snapshot(to: string): Result<void>;
  close(): void;
};

export type StoreOptions = {
  /** How long a writer waits on another's lock before `unavailable`. */
  busyTimeoutMs?: number;
  /** The store's clock; a test passes a fixed one. */
  clock?: () => Date;
};

/** v1's DEFAULT_LOCK_TIMING.waitMs, kept: the number every caller already budgets for. */
export const DEFAULT_BUSY_TIMEOUT_MS = 10_000;
const STATEMENT_CACHE = 256;

// SQLite primary result codes the port branches on (errcode & 0xff).
const SQLITE_BUSY = 5;
const SQLITE_LOCKED = 6;
const SQLITE_CORRUPT = 11;
const SQLITE_CONSTRAINT = 19;
const SQLITE_NOTADB = 26;

function errcodeOf(e: unknown): number | undefined {
  if (!(e instanceof Error) || !("errcode" in e)) return undefined;
  return typeof e.errcode === "number" ? e.errcode & 0xff : undefined;
}

const isCorruption = (code: number | undefined): boolean => code === SQLITE_CORRUPT || code === SQLITE_NOTADB;

/** Classify any throw from a transaction into the one taxonomy. */
function classify(e: unknown, busyMs: number): AppError {
  if (e instanceof AppError) return e;
  const code = errcodeOf(e);
  const msg = e instanceof Error ? e.message : String(e);
  if (code === SQLITE_BUSY || code === SQLITE_LOCKED) {
    return new AppError("unavailable", `store is held by another writer past ${busyMs} ms: ${msg}`, { cause: e });
  }
  if (code === SQLITE_CONSTRAINT) return new AppError("conflict", `store constraint: ${msg}`, { cause: e });
  return new AppError("internal", `store: ${msg}`, { cause: e });
}

const toNumber = (v: number | bigint): number => (typeof v === "bigint" ? Number(v) : v);

export function openStore(location: string, opts: StoreOptions = {}): Result<Store> {
  const busyMs = opts.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  const clock = opts.clock ?? (() => new Date());
  const memory = location === ":memory:";
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(location, { timeout: busyMs, enableForeignKeyConstraints: true });
  } catch (e) {
    return err("unavailable", `store: cannot open ${location}`, { cause: e });
  }
  try {
    // journal_mode is a property of the FILE; read it back, because SQLite
    // silently keeps the old mode where WAL cannot work (a network share, a
    // sandboxed filesystem), and every cross-process claim above assumes WAL.
    const mode = db.prepare("PRAGMA journal_mode = WAL").get()?.["journal_mode"];
    if (!memory && mode !== "wal") {
      db.close();
      return err("unavailable", `store: ${location} refused WAL (journal_mode=${String(mode)}); cross-process safety needs it`);
    }
    // synchronous is per CONNECTION and resets on every open, so it is set here,
    // in the one factory. FULL, not NORMAL: under WAL, NORMAL survives an app or
    // OS crash but a power cut may drop the last commits, and the commits this
    // store carries include spend reservations that are written BEFORE a paid
    // call goes out (lib/spend's reserve -> settle). A reservation lost after its
    // call was made is a re-spend on resume. FULL costs one fsync of the WAL per
    // commit; the write rate here is human- and job-paced, so that is cheap.
    db.exec("PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;");
  } catch (e) {
    db.close();
    return err(isCorruption(errcodeOf(e)) ? "internal" : "unavailable", `store: cannot configure ${location}`, { cause: e });
  }

  const cache = new Map<string, StatementSync>();
  const stmt = (sql: string): StatementSync => {
    const hit = cache.get(sql);
    if (hit !== undefined) return hit;
    if (cache.size >= STATEMENT_CACHE) cache.clear();
    const s = db.prepare(sql);
    cache.set(sql, s);
    return s;
  };

  let active = false;
  // corruption-class-response: after the engine reports damage, this handle
  // writes nothing more. No retry, no reopen from here; the operator copies the
  // file set and decides. A retry loop over a corrupt page only spreads it.
  let quarantined: string | undefined;

  function begin(): Result<void> {
    if (quarantined !== undefined) return err("internal", `store quarantined after corruption: ${quarantined}`);
    if (active) return err("internal", "store: a transaction was opened inside another transaction");
    if (!db.isOpen) return err("unavailable", "store: closed");
    return ok(undefined);
  }

  function makeReader(at: string, live: () => boolean): Reader {
    const guard = (): void => {
      if (!live()) throw new AppError("internal", "store: a transaction handle was used after its transaction ended");
    };
    return {
      at,
      get: (sql, ...params) => (guard(), stmt(sql).get(...params)),
      all: (sql, ...params) => (guard(), stmt(sql).all(...params)),
    };
  }

  function finish<T>(out: unknown, rollback: () => void, commit: () => void): Result<T> {
    if (typeof out === "object" && out !== null && "then" in out && typeof out.then === "function") {
      rollback();
      return err("internal", "store: a transaction body returned a promise; transaction bodies are synchronous");
    }
    commit();
    // `out` came from `fn`, whose return type is NotPromise<T>; the promise
    // check above is the runtime half of that type.
    return ok(out as T);
  }

  function run<T>(begin_: string, end: string, fn: (live: () => boolean) => unknown): Result<T> {
    const can = begin();
    if (!can.ok) return can;
    let live = false;
    active = true;
    const rollback = (): void => {
      if (db.isTransaction) db.exec("ROLLBACK");
    };
    try {
      db.exec(begin_);
      live = true;
      const out = fn(() => live);
      live = false;
      return finish<T>(out, rollback, () => db.exec("COMMIT"));
    } catch (e) {
      live = false;
      const code = errcodeOf(e);
      if (isCorruption(code)) quarantined = e instanceof Error ? e.message : String(e);
      try {
        rollback();
      } catch (rollbackFailure) {
        // The connection is in a state we did not put it in; refuse further use.
        quarantined ??= `rollback failed: ${rollbackFailure instanceof Error ? rollbackFailure.message : String(rollbackFailure)}`;
      }
      const ae = classify(e, busyMs);
      return { ok: false, error: ae };
    } finally {
      live = false;
      active = false;
      if (end !== "") db.exec(end);
    }
  }

  const store: Store = {
    location,
    tx<T>(fn: (t: Tx) => NotPromise<T>): Result<T> {
      return run<T>("BEGIN IMMEDIATE", "", (live) => {
        const reader = makeReader(clock().toISOString(), live);
        const guard = (): void => {
          if (!live()) throw new AppError("internal", "store: a transaction handle was used after its transaction ended");
        };
        const t: Tx = {
          ...reader,
          run: (sql, ...params) => {
            guard();
            const r = stmt(sql).run(...params);
            return { changes: toNumber(r.changes), lastRowid: toNumber(r.lastInsertRowid) };
          },
          exec: (sql) => {
            guard();
            db.exec(sql);
          },
        };
        return fn(t);
      });
    },
    read<T>(fn: (r: Reader) => NotPromise<T>): Result<T> {
      const can = begin();
      if (!can.ok) return can;
      db.exec("PRAGMA query_only = 1");
      return run<T>("BEGIN", "PRAGMA query_only = 0", (live) => fn(makeReader(clock().toISOString(), live)));
    },
    snapshot(to: string): Result<void> {
      const can = begin();
      if (!can.ok) return can;
      try {
        db.prepare("VACUUM INTO ?").run(to);
      } catch (e) {
        return err("unavailable", `store: snapshot to ${to} failed`, { cause: e });
      }
      let check: DatabaseSync | undefined;
      try {
        check = new DatabaseSync(to, { readOnly: true });
        const verdict = check.prepare("PRAGMA integrity_check").get()?.["integrity_check"];
        if (verdict !== "ok") return err("internal", `store: snapshot ${to} failed its integrity check: ${String(verdict)}`);
        return ok(undefined);
      } catch (e) {
        return err("internal", `store: snapshot ${to} cannot be opened`, { cause: e });
      } finally {
        check?.close();
      }
    },
    close(): void {
      cache.clear();
      if (db.isOpen) db.close();
    },
  };
  return ok(store);
}
