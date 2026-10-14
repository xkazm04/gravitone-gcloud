import type { Holder, Lease } from "@gt/domain/job";

// THE LEASE, PURE - who may act on a named resource right now, decided from a
// snapshot and a clock reading. No I/O here: lease.ts reads the snapshot inside
// a transaction, hands it to these functions with the transaction's instant,
// and applies the writes they return. packages/kernel/py/lease.py is the second
// implementation of exactly these rules, and packages/kernel/spec/lease.json is
// the table both are held to.
//
// Absorbed from v1's GPU tenancy broker (lib/gpu/lease.ts + pipeline/gpu/lease.py,
// cross-tested by pipeline/gpu/selftest.py case 4), which kept, and this keeps:
//   - ONE HOLDER per resource, with a heartbeat and a TTL: a lease whose
//     heartbeat is older than its TTL is stale and reclaimable, and the
//     reclaim is counted and recorded, never silent;
//   - A PID IS PROBED ONLY ON ITS OWN HOST. A pid from another host says
//     nothing about this host's process table, so a foreign holder is gone
//     only by TTL;
//   - FIFO TICKETS. A waiter is served in the order it asked, and a waiter
//     whose process is dead is skipped, so a crashed waiter cannot wedge the
//     head of the queue.
// Upgraded:
//   - FENCING (plan §3.1). Every grant takes the next number of a per-resource
//     counter that is never reused and survives release. A write made under a
//     lease presents its fence, and lease.ts `assertFence` refuses a stale one
//     inside the writer's own transaction - the only place the check is atomic
//     with the write (concurrency-guards: fence-inside-write-transaction). v1
//     could only tell a holder it was lost on its next heartbeat; a holder that
//     woke after a take-over and wrote first was not stopped at all.
//   - A REUSED PID IS NOT A LIVE HOLDER. v1 named this hole and left it: a pid
//     recycled by an unrelated process reads alive. Here a holder carries the
//     bootId of the process that claimed, so the one case the probe can settle
//     for certain - the pid is OURS, under another bootId - is settled.
//   - A WAITER ON ANOTHER HOST IS NOT IMMORTAL. v1 dropped dead waiters only by
//     pid, so a waiter on a host that vanished held the queue head forever.
//     A waiter refreshes `seenAt` each time it polls; unseen past its TTL, it
//     is dropped, as a holder past its heartbeat is.
//   - EXPIRY IS LOSS. v1's heartbeat extended a lease whatever its age. Here a
//     heartbeat, and a fence check, on a lease past its TTL fail even when no
//     contender has taken it yet: the holder cannot know whether one read it
//     as free, and the store's clock - one clock, in the statement that
//     decides - is the only one that gets a vote (concurrency-guards:
//     renewal-deadline-two-thirds-ttl, "expiry in the store's clock").

export const DEFAULT_TTL_S = 120;

/** The row a resource keeps: the last fence it issued, and its holder while held. */
export type LeaseRow = {
  readonly resource: string;
  /** The last fence granted; 0 before the first. Never decreases, kept on release. */
  readonly fence: number;
  readonly held?: Lease;
  readonly reclaims: number;
};

export type Waiter = {
  /** FIFO position: smaller asked first. */
  readonly n: number;
  readonly ticket: string;
  readonly holder: Holder;
  readonly enqueuedAt: string;
  readonly seenAt: string;
  readonly ttlS: number;
};

export type Snapshot = { readonly row?: LeaseRow; readonly waiters: readonly Waiter[] };

/** Is the pid on this host still running? Consulted for same-host holders only. */
export type Alive = (pid: number) => boolean;

export type StaleReason = "holder-gone" | "heartbeat-expired";
export type LeaveReason = "gave-up" | "holder-gone" | "unseen";

export type ClaimRequest = {
  readonly resource: string;
  readonly holder: Holder;
  /** The caller's place in the queue; a retrying caller presents the same one. */
  readonly ticket: string;
  readonly ttlS: number;
  /** Join the queue when the resource is busy; false is one try. */
  readonly wait: boolean;
};

export type Write =
  | { readonly op: "reclaim"; readonly from: Lease; readonly reason: StaleReason; readonly reclaims: number }
  | { readonly op: "leave"; readonly waiter: Waiter; readonly reason: LeaveReason }
  | { readonly op: "grant"; readonly lease: Lease; readonly ticket: string }
  | { readonly op: "enqueue"; readonly waiter: Omit<Waiter, "n">; readonly position: number }
  | { readonly op: "seen"; readonly ticket: string; readonly at: string };

export type ClaimOutcome =
  | { readonly kind: "granted"; readonly lease: Lease }
  | { readonly kind: "queued"; readonly position: number; readonly holder?: Holder }
  | { readonly kind: "busy"; readonly holder?: Holder; readonly ahead: number };

const ms = (iso: string): number => Date.parse(iso);

export const sameHolder = (a: Holder, b: Holder): boolean => a.bootId === b.bootId && a.pid === b.pid && a.host === b.host;

/**
 * Is `holder` provably gone, as judged by `me`? Only a same-host holder can be
 * proven gone; a pid that is ours under another bootId is a dead process whose
 * number we inherited.
 */
export function gone(holder: Holder, me: Holder, alive: Alive): boolean {
  if (holder.host !== me.host) return false;
  if (holder.pid === me.pid) return holder.bootId !== me.bootId;
  return !alive(holder.pid);
}

/** Past its TTL at `nowMs`. The boundary instant itself is still valid. */
export const expired = (heartbeatAt: string, ttlS: number, nowMs: number): boolean => nowMs - ms(heartbeatAt) > ttlS * 1000;

export function staleReason(lease: Lease, me: Holder, nowMs: number, alive: Alive): StaleReason | undefined {
  if (gone(lease.holder, me, alive)) return "holder-gone";
  if (expired(lease.heartbeatAt, lease.ttlS, nowMs)) return "heartbeat-expired";
  return undefined;
}

function waiterLeave(w: Waiter, me: Holder, nowMs: number, alive: Alive): LeaveReason | undefined {
  if (gone(w.holder, me, alive)) return "holder-gone";
  if (expired(w.seenAt, w.ttlS, nowMs)) return "unseen";
  return undefined;
}

/** The waiters still in line, and the writes that drop the rest. */
function sweepWaiters(snap: Snapshot, me: Holder, nowMs: number, alive: Alive, asking?: string): { live: Waiter[]; writes: Write[] } {
  const live: Waiter[] = [];
  const writes: Write[] = [];
  for (const w of [...snap.waiters].sort((a, b) => a.n - b.n)) {
    // The caller presenting its own ticket is alive by the act of asking.
    const why = w.ticket === asking ? undefined : waiterLeave(w, me, nowMs, alive);
    if (why === undefined) live.push(w);
    else writes.push({ op: "leave", waiter: w, reason: why });
  }
  return { live, writes };
}

/**
 * One claim attempt. A stale holder is reclaimed first, dead waiters are
 * dropped, and the resource is granted only when it is free AND nobody alive
 * is ahead of the caller - a caller not in the queue has everyone ahead of it,
 * so a newcomer never jumps a waiter.
 */
export function decideClaim(snap: Snapshot, req: ClaimRequest, at: string, alive: Alive): { outcome: ClaimOutcome; writes: Write[] } {
  const nowMs = ms(at);
  const writes: Write[] = [];
  let held = snap.row?.held;
  let reclaims = snap.row?.reclaims ?? 0;
  if (held !== undefined) {
    const why = staleReason(held, req.holder, nowMs, alive);
    if (why !== undefined) {
      reclaims += 1;
      writes.push({ op: "reclaim", from: held, reason: why, reclaims });
      held = undefined;
    }
  }
  const swept = sweepWaiters(snap, req.holder, nowMs, alive, req.ticket);
  writes.push(...swept.writes);
  const mine = swept.live.find((w) => w.ticket === req.ticket);
  const ahead = mine === undefined ? swept.live.length : swept.live.filter((w) => w.n < mine.n).length;

  if (held === undefined && ahead === 0) {
    const lease: Lease = { holder: req.holder, fence: (snap.row?.fence ?? 0) + 1, acquiredAt: at, heartbeatAt: at, ttlS: req.ttlS };
    writes.push({ op: "grant", lease, ticket: req.ticket });
    return { outcome: { kind: "granted", lease }, writes };
  }
  const busy = held === undefined ? {} : { holder: held.holder };
  if (!req.wait) return { outcome: { kind: "busy", ahead, ...busy }, writes };
  if (mine === undefined) {
    const position = ahead + 1;
    writes.push({ op: "enqueue", waiter: { ticket: req.ticket, holder: req.holder, enqueuedAt: at, seenAt: at, ttlS: req.ttlS }, position });
    return { outcome: { kind: "queued", position, ...busy }, writes };
  }
  writes.push({ op: "seen", ticket: req.ticket, at });
  return { outcome: { kind: "queued", position: ahead + 1, ...busy }, writes };
}

export type LostReason = "released" | "taken-over" | "expired";

/** Why `fence` no longer holds `row` at `nowMs`, or undefined while it does. */
export function fenceLoss(row: LeaseRow | undefined, fence: number, nowMs: number): LostReason | undefined {
  const held = row?.held;
  if (held === undefined) return (row?.fence ?? 0) > fence ? "taken-over" : "released";
  if (held.fence !== fence) return "taken-over";
  if (expired(held.heartbeatAt, held.ttlS, nowMs)) return "expired";
  return undefined;
}

export function decideHeartbeat(row: LeaseRow | undefined, fence: number, at: string): { ok: true; lease: Lease } | { ok: false; reason: LostReason } {
  const lost = fenceLoss(row, fence, ms(at));
  if (lost !== undefined || row?.held === undefined) return { ok: false, reason: lost ?? "released" };
  return { ok: true, lease: { ...row.held, heartbeatAt: at } };
}

/** The status a waiting caller or an operator reads; `me` decides what can be probed. */
export type LeaseStatus = {
  readonly resource: string;
  readonly fence: number;
  readonly holder?: Lease;
  readonly stale?: StaleReason;
  readonly queue: readonly Waiter[];
  readonly reclaims: number;
};

export function statusOf(resource: string, snap: Snapshot, me: Holder, at: string, alive: Alive): LeaseStatus {
  const nowMs = ms(at);
  const held = snap.row?.held;
  const queue = sweepWaiters(snap, me, nowMs, alive).live;
  const base = { resource, fence: snap.row?.fence ?? 0, queue, reclaims: snap.row?.reclaims ?? 0 };
  if (held === undefined) return base;
  const stale = staleReason(held, me, nowMs, alive);
  return stale === undefined ? { ...base, holder: held } : { ...base, holder: held, stale };
}
