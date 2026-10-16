import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { holderSchema, type Holder, type Lease } from "@gt/domain/job";
import { laneOfSlot, RESOURCE_LANES } from "@gt/domain/lane";
import type { Effects } from "./effects.ts";
import { append } from "./events.ts";
import {
  DEFAULT_TTL_S,
  decideClaim,
  decideHeartbeat,
  fenceLoss,
  statusOf,
  type Alive,
  type ClaimOutcome,
  type ClaimRequest,
  type LeaseRow,
  type LeaseStatus,
  type Snapshot,
  type Waiter,
  type Write,
} from "./lease-core.ts";
import type { ModuleMigrations } from "./migrate.ts";
import type { Reader, Tx } from "./store.ts";

// THE LEASE DRIVER - lease-core.ts's decisions, read from and written to two
// tables inside the caller's transaction, each change with its Event.
//
// v1 spoke its protocol through three files (lib/gpu/lease.ts: an exclusive-
// create `lock`, `lease.json`, an append-only `queue.jsonl` whose replay was
// the FIFO). Here the store's write lock is the `lock`, a row is `lease.json`,
// and the waiter table is the replayed queue - so a torn final line, a stale
// lock file and a half-visible lease (each handled by hand in v1) cannot occur.
// The ledger takes the queue log's other job, the audit: every grant, reclaim,
// release and queue change is an Event in the transaction that made it.
//
// LIVENESS PINGS ARE NOT EVENTS. A heartbeat moves `heartbeat_at` and a polling
// waiter moves `seen_at`; neither changes who holds or who is next, and a
// two-hour render heartbeating every forty seconds would put 180 rows in the
// ledger that say only "still here". The facts a reader needs - who held it,
// from when, and whether it was reclaimed - are all events.
//
// WHAT A PYTHON WORKER CALLS (the forge, Dojo; packages/kernel/py/lease.py,
// same tables, same rules, held to the same spec/lease.json):
//     lease = Leases(db_path).acquire("gpu.local", wait_s=600)   # FIFO, raises LeaseTimeout
//     ... every write it makes to the store:  assert_fence(conn, "gpu.local", lease.fence)
//     lease.heartbeat()   # every ttl/3 seconds, on a timer, never per unit of work
//     lease.release()     # in a finally; a crash is reclaimed by pid or TTL
// A worker that loses the lease (heartbeat raises LeaseLost) stops at once:
// any write it still makes is refused by the fence.

export const leaseMigrations: ModuleMigrations = {
  module: "lease",
  steps: [
    {
      version: 1,
      sql: `
CREATE TABLE leases (
  resource TEXT PRIMARY KEY,
  fence INTEGER NOT NULL CHECK (fence >= 0),
  holder_boot TEXT,
  holder_pid INTEGER,
  holder_host TEXT,
  acquired_at TEXT,
  heartbeat_at TEXT,
  ttl_s INTEGER,
  reclaims INTEGER NOT NULL DEFAULT 0,
  CHECK ((holder_boot IS NULL) = (holder_pid IS NULL) AND (holder_pid IS NULL) = (holder_host IS NULL)
     AND (holder_host IS NULL) = (acquired_at IS NULL) AND (acquired_at IS NULL) = (heartbeat_at IS NULL)
     AND (heartbeat_at IS NULL) = (ttl_s IS NULL)),
  CHECK (holder_boot IS NULL OR fence > 0)
) WITHOUT ROWID;
CREATE TRIGGER leases_fence_only_grows BEFORE UPDATE OF fence ON leases WHEN NEW.fence < OLD.fence
BEGIN SELECT RAISE(ABORT, 'a lease fence never decreases'); END;
CREATE TABLE lease_waiters (
  n INTEGER PRIMARY KEY,
  resource TEXT NOT NULL,
  ticket TEXT NOT NULL,
  holder_boot TEXT NOT NULL,
  holder_pid INTEGER NOT NULL,
  holder_host TEXT NOT NULL,
  enqueued_at TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  ttl_s INTEGER NOT NULL,
  UNIQUE (resource, ticket)
);`,
    },
  ],
};

const leaseRowSchema = z.object({
  resource: z.string(),
  fence: z.number().int().nonnegative(),
  holder_boot: z.string().nullable(),
  holder_pid: z.number().int().nullable(),
  holder_host: z.string().nullable(),
  acquired_at: z.string().nullable(),
  heartbeat_at: z.string().nullable(),
  ttl_s: z.number().int().nullable(),
  reclaims: z.number().int().nonnegative(),
});

const waiterRowSchema = z.object({
  n: z.number().int(),
  ticket: z.string(),
  holder_boot: z.string(),
  holder_pid: z.number().int(),
  holder_host: z.string(),
  enqueued_at: z.string(),
  seen_at: z.string(),
  ttl_s: z.number().int(),
});

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

function readRow(r: Reader, resource: string): LeaseRow | undefined {
  const raw = r.get("SELECT resource, fence, holder_boot, holder_pid, holder_host, acquired_at, heartbeat_at, ttl_s, reclaims FROM leases WHERE resource = ?", resource);
  if (raw === undefined) return undefined;
  const row = must(parseAt("lease row", leaseRowSchema, raw));
  const base = { resource: row.resource, fence: row.fence, reclaims: row.reclaims };
  if (row.holder_boot === null) return base;
  const held = must(
    parseAt("lease row holder", z.object({ holder: holderSchema, fence: z.number().int().positive(), acquiredAt: z.iso.datetime(), heartbeatAt: z.iso.datetime(), ttlS: z.number().int().positive() }), {
      holder: { bootId: row.holder_boot, pid: row.holder_pid, host: row.holder_host },
      fence: row.fence,
      acquiredAt: row.acquired_at,
      heartbeatAt: row.heartbeat_at,
      ttlS: row.ttl_s,
    }),
  );
  return { ...base, held };
}

function readWaiters(r: Reader, resource: string): Waiter[] {
  return r
    .all("SELECT n, ticket, holder_boot, holder_pid, holder_host, enqueued_at, seen_at, ttl_s FROM lease_waiters WHERE resource = ? ORDER BY n", resource)
    .map((raw) => {
      const w = must(parseAt("lease waiter row", waiterRowSchema, raw));
      const holder = must(parseAt("lease waiter holder", holderSchema, { bootId: w.holder_boot, pid: w.holder_pid, host: w.holder_host }));
      return { n: w.n, ticket: w.ticket, holder, enqueuedAt: w.enqueued_at, seenAt: w.seen_at, ttlS: w.ttl_s };
    });
}

export function snapshotOf(r: Reader, resource: string): Snapshot {
  const row = readRow(r, resource);
  const waiters = readWaiters(r, resource);
  return row === undefined ? { waiters } : { row, waiters };
}

/** The ledger's word for a lease's acting process. */
export const actorOf = (h: Holder): Actor => ({ kind: "machine", id: `${h.host}/${h.pid}` });
const LANES: ReadonlySet<string> = new Set(RESOURCE_LANES);
const holderData = (h: Holder) => ({ bootId: h.bootId, pid: h.pid, host: h.host });

function event(t: Tx, by: Holder, resource: string, type: string, data: Record<string, unknown>): void {
  // A lane slot (`seat.text#2`) is the lane's row on the Runs day-line, as the bare lane is.
  const lane = LANES.has(resource) ? resource : laneOfSlot(resource);
  append(t, { actor: actorOf(by), type, subject: { kind: "lease", id: resource }, ...(lane === undefined ? {} : { lane }), data: { resource, ...data } });
}

function apply(t: Tx, resource: string, by: Holder, w: Write): void {
  switch (w.op) {
    case "reclaim":
      t.run("UPDATE leases SET holder_boot = NULL, holder_pid = NULL, holder_host = NULL, acquired_at = NULL, heartbeat_at = NULL, ttl_s = NULL, reclaims = ? WHERE resource = ?", w.reclaims, resource);
      event(t, by, resource, "lease.reclaimed", { fence: w.from.fence, reason: w.reason, holder: holderData(w.from.holder), reclaims: w.reclaims });
      return;
    case "leave":
      t.run("DELETE FROM lease_waiters WHERE resource = ? AND ticket = ?", resource, w.waiter.ticket);
      event(t, by, resource, "lease.left", { ticket: w.waiter.ticket, reason: w.reason, holder: holderData(w.waiter.holder) });
      return;
    case "grant": {
      const l = w.lease;
      t.run(
        `INSERT INTO leases (resource, fence, holder_boot, holder_pid, holder_host, acquired_at, heartbeat_at, ttl_s) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (resource) DO UPDATE SET fence = excluded.fence, holder_boot = excluded.holder_boot, holder_pid = excluded.holder_pid,
           holder_host = excluded.holder_host, acquired_at = excluded.acquired_at, heartbeat_at = excluded.heartbeat_at, ttl_s = excluded.ttl_s`,
        resource, l.fence, l.holder.bootId, l.holder.pid, l.holder.host, l.acquiredAt, l.heartbeatAt, l.ttlS,
      );
      t.run("DELETE FROM lease_waiters WHERE resource = ? AND ticket = ?", resource, w.ticket);
      event(t, by, resource, "lease.claimed", { fence: l.fence, ticket: w.ticket, holder: holderData(l.holder), ttlS: l.ttlS });
      return;
    }
    case "enqueue": {
      const q = w.waiter;
      t.run(
        "INSERT INTO lease_waiters (resource, ticket, holder_boot, holder_pid, holder_host, enqueued_at, seen_at, ttl_s) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        resource, q.ticket, q.holder.bootId, q.holder.pid, q.holder.host, q.enqueuedAt, q.seenAt, q.ttlS,
      );
      event(t, by, resource, "lease.queued", { ticket: q.ticket, holder: holderData(q.holder), position: w.position });
      return;
    }
    case "seen":
      t.run("UPDATE lease_waiters SET seen_at = ? WHERE resource = ? AND ticket = ?", w.at, resource, w.ticket);
      return;
  }
}

const claimInput = z.object({
  resource: z.string().min(1),
  holder: holderSchema,
  ticket: z.string().min(1),
  ttlS: z.number().int().positive(),
  wait: z.boolean(),
});

/** One claim attempt inside the caller's transaction. */
export function claimIn(t: Tx, req: ClaimRequest, alive: Alive): ClaimOutcome {
  const input = must(parseAt("lease claim", claimInput, req));
  const { outcome, writes } = decideClaim(snapshotOf(t, input.resource), input, t.at, alive);
  for (const w of writes) apply(t, input.resource, input.holder, w);
  return outcome;
}

/**
 * The fence check, inside the WRITER's transaction: throws `conflict` unless
 * `fence` is the live holder's of `resource` at this transaction's instant.
 * Atomic with the write it guards because both are under the one write lock
 * BEGIN IMMEDIATE took - a take-over cannot commit between this read and the
 * caller's write.
 */
export function assertFence(t: Tx, resource: string, fence: number): void {
  const lost = fenceLoss(readRow(t, resource), fence, Date.parse(t.at));
  if (lost !== undefined) throw new AppError("conflict", `lease ${resource}: fence ${fence} no longer holds (${lost}); the write is refused`, { detail: lost });
}

/** Extend the holder's lease. `conflict` (with the reason as detail) when it is lost. */
export function heartbeatIn(t: Tx, resource: string, fence: number): Lease {
  const d = decideHeartbeat(readRow(t, resource), fence, t.at);
  if (!d.ok) throw new AppError("conflict", `lease ${resource}: fence ${fence} was lost (${d.reason})`, { detail: d.reason });
  t.run("UPDATE leases SET heartbeat_at = ? WHERE resource = ? AND fence = ?", t.at, resource, fence);
  return d.lease;
}

/** Give the resource up. Releasing what one no longer holds is a no-op: `false`. */
export function releaseIn(t: Tx, resource: string, fence: number): boolean {
  const held = readRow(t, resource)?.held;
  if (held === undefined || held.fence !== fence) return false;
  t.run("UPDATE leases SET holder_boot = NULL, holder_pid = NULL, holder_host = NULL, acquired_at = NULL, heartbeat_at = NULL, ttl_s = NULL WHERE resource = ?", resource);
  event(t, held.holder, resource, "lease.released", { fence });
  return true;
}

/** A waiter gives up its place (v1's `leave` on timeout). `false` when it had none. */
export function leaveIn(t: Tx, resource: string, ticket: string): boolean {
  const w = readWaiters(t, resource).find((x) => x.ticket === ticket);
  if (w === undefined) return false;
  apply(t, resource, w.holder, { op: "leave", waiter: w, reason: "gave-up" });
  return true;
}

export function statusIn(r: Reader, resource: string, me: Holder, alive: Alive): LeaseStatus {
  return statusOf(resource, snapshotOf(r, resource), me, r.at, alive);
}

/* ── This process as a holder ─────────────────────────────────────────────── */

const BOOT_KEY = Symbol.for("@gt/kernel/lease.bootId");

/**
 * This process's identity. The bootId lives on globalThis so a dev-server
 * module reload does not mint a second one and read its own live lease as a
 * dead process's (v1 lib/turns/ledger.ts kept its bootId there for that reason).
 */
export function processHolder(): Holder {
  const have: unknown = Reflect.get(globalThis, BOOT_KEY);
  const bootId = typeof have === "string" ? have : randomUUID();
  if (have !== bootId) Reflect.set(globalThis, BOOT_KEY, bootId);
  return { bootId, pid: process.pid, host: hostname() };
}

/** `process.kill(pid, 0)` probes without signalling, on Windows too; EPERM means it exists. */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e instanceof Error && "code" in e && e.code === "EPERM";
  }
}

/* ── Waiting for a lease ──────────────────────────────────────────────────── */

export type AcquireOptions = {
  readonly holder?: Holder;
  readonly ttlS?: number;
  /** Longest to wait. 0 (default) is one try and never queues. */
  readonly waitMs?: number;
  readonly pollMs?: number;
  readonly alive?: Alive;
  readonly ticket?: string;
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
};

const sleepMs = (n: number): Promise<void> => new Promise((r) => setTimeout(r, n));

/**
 * Take `resource`, waiting in FIFO order up to `waitMs`. A waiter that runs out
 * leaves the queue and gets `unavailable` naming who holds it - never a hang
 * (v1's LeaseTimeout). The poll is also the waiter's liveness ping.
 */
export async function acquire(fx: Effects, resource: string, opts: AcquireOptions = {}): Promise<Result<Lease>> {
  const holder = opts.holder ?? processHolder();
  const ticket = opts.ticket ?? randomUUID();
  const waitMs = opts.waitMs ?? 0;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? sleepMs;
  const req: ClaimRequest = { resource, holder, ticket, ttlS: opts.ttlS ?? DEFAULT_TTL_S, wait: waitMs > 0 };
  const deadline = now() + waitMs;
  for (;;) {
    const r = fx.tx("lease.claim", (t) => claimIn(t, req, opts.alive ?? pidAlive));
    // A store busy past its busy_timeout is contention, not a fault: SQLite's busy
    // handler is sleep-and-retry with no fairness, so under four hammering processes
    // one waiter can starve past it. While the wait has time left, poll again.
    if (!r.ok && r.error.code === "unavailable" && now() < deadline) {
      await sleep(opts.pollMs ?? 250);
      continue;
    }
    if (!r.ok) return r;
    const o = r.value;
    if (o.kind === "granted") return ok(o.lease);
    if (o.kind === "busy" || now() >= deadline) {
      if (o.kind === "queued") {
        const left = fx.tx("lease.leave", (t) => leaveIn(t, resource, ticket));
        if (!left.ok) return left;
      }
      const who = o.holder === undefined ? "waiters are ahead" : `${o.holder.host}/${o.holder.pid} holds it`;
      return err("unavailable", `lease ${resource}: not granted within ${waitMs} ms; ${who}`);
    }
    await sleep(opts.pollMs ?? 250);
  }
}
