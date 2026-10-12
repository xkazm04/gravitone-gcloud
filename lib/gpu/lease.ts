// GPU TENANCY LEASE — the Node half of pipeline/gpu/lease.py. Server-only.
//
// One 24 GB card, several tenants in different processes and languages: the
// pipeline's ComfyUI lanes (Python) and this server's resident Ollama eye. The
// protocol on disk is the whole contract, and lease.py documents it:
//
//   <root>/lock         exclusive-create file (lib/sound/store.ts acquireLock)
//   <root>/lease.json   the one holder: {tenant, engine, vramGb, pid, host,
//                       jobPrefix, acquiredAt, heartbeatAt, ttlS, ticket}
//   <root>/queue.jsonl  append-only events; the FIFO queue is its replay
//
// The lock file is lib/diskTx's (exclusive create, stale-broken, the protocol
// pipeline/foundry/catalogue_lock.py and lease.py also speak), not a copy of it.
//
// Keep the two implementations in step: tests/golden-path/gpu-lease.probe.spec.ts
// and pipeline/gpu/selftest.py (case 4) drive one directory from both.

import { appendFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

import { exclusiveSection } from "../diskTx";
import { outPath } from "../fixtures/roots";

export type GpuEngine = "comfy" | "ollama";

export interface LeaseRecord {
  tenant: string;
  engine: GpuEngine;
  vramGb: number;
  pid: number;
  host: string;
  jobPrefix: string;
  acquiredAt: number;
  heartbeatAt: number;
  ttlS: number;
  ticket: string;
}

interface QueueEvent {
  ev: "wait" | "grant" | "leave" | "release" | "reclaim";
  ticket?: string;
  tenant?: string;
  engine?: string;
  pid?: number;
  host?: string;
  reclaims?: number;
  [k: string]: unknown;
}

export class LeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeaseError";
  }
}
/** The engine is another tenant's. `holder` is its record (null: nobody holds it). */
export class LeaseHeld extends LeaseError {
  constructor(message: string, readonly holder: LeaseRecord | null = null) {
    super(message);
    this.name = "LeaseHeld";
  }
}
/** A waiter ran out of `waitMs`. Raised instead of hanging. */
export class LeaseTimeout extends LeaseError {
  constructor(message: string, readonly holder: LeaseRecord | null = null) {
    super(message);
    this.name = "LeaseTimeout";
  }
}
export class LeaseLost extends LeaseError {
  constructor(message: string) {
    super(message);
    this.name = "LeaseLost";
  }
}

export const DEFAULT_TTL_S = 120;
const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** `GPU_LEASE_DIR`, else foundry-out/gpu — the directory lease.py resolves too. */
export function gpuRoot(): string {
  const env = process.env.GPU_LEASE_DIR?.trim();
  return env ? path.resolve(env) : outPath("gpu");
}

/** process.kill(pid, 0) probes without signalling, on Windows as well. */
export function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

export interface BrokerOptions {
  root?: string;
  pid?: number;
  host?: string;
  alive?: (pid: number) => boolean;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
}

export interface AcquireOptions {
  tenant: string;
  engine: GpuEngine;
  vramGb: number;
  /** Longest to wait, ms. 0 (default) is one try and never queues. */
  waitMs?: number;
  ttlS?: number;
  jobPrefix?: string;
}

export interface GpuStatus {
  holder: LeaseRecord | null;
  stale: string | null;
  queue: { tenant?: string; engine?: string; pid?: number }[];
  reclaims: number;
}

export class LeaseHandle {
  released = false;
  constructor(private readonly broker: GpuBroker, public rec: LeaseRecord) {}
  get ticket(): string {
    return this.rec.ticket;
  }
  async heartbeat(): Promise<void> {
    this.rec = await this.broker.heartbeat(this.rec);
  }
  recycle<T>(engine: GpuEngine, stop: () => T | Promise<T>): Promise<T> {
    return this.broker.recycle(engine, this, stop);
  }
  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    await this.broker.release(this.rec);
  }
}

export class GpuBroker {
  readonly root: string;
  readonly pid: number;
  readonly host: string;
  private readonly alive: (pid: number) => boolean;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollMs: number;
  /** In-process queue, then the lock file other processes can see. */
  private readonly section: <T>(fn: () => Promise<T>) => Promise<T>;

  constructor(opts: BrokerOptions = {}) {
    this.root = opts.root ?? gpuRoot();
    this.pid = opts.pid ?? process.pid;
    this.host = opts.host ?? os.hostname();
    this.alive = opts.alive ?? pidAlive;
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? sleepMs;
    this.pollMs = opts.pollMs ?? 250;
    this.section = exclusiveSection(
      () => path.join(this.root, "lock"),
      () => ({
        by: "gpu-lease",
        onTimeout: (lock, waitMs) => new LeaseError(`the gpu lease lock ${lock} is held and did not release in ${waitMs} ms`),
      }),
    );
  }

  private get leaseFile() {
    return path.join(this.root, "lease.json");
  }
  private get queueFile() {
    return path.join(this.root, "queue.jsonl");
  }

  private locked<T>(fn: () => Promise<T>): Promise<T> {
    return this.section(fn);
  }

  private async readLease(): Promise<LeaseRecord | null> {
    try {
      return JSON.parse(await readFile(this.leaseFile, "utf8")) as LeaseRecord;
    } catch {
      // ENOENT is "nobody"; a half-visible file is a race (writes are atomic), also "nobody".
      return null;
    }
  }
  private async writeLease(rec: LeaseRecord): Promise<void> {
    const tmp = path.join(this.root, `lease.json.${this.pid}.tmp`);
    await writeFile(tmp, JSON.stringify(rec), "utf8");
    await rename(tmp, this.leaseFile);
  }
  private async events(): Promise<QueueEvent[]> {
    let text: string;
    try {
      text = await readFile(this.queueFile, "utf8");
    } catch {
      return [];
    }
    const out: QueueEvent[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as QueueEvent);
      } catch {
        // a torn final line is skipped, never fatal
      }
    }
    return out;
  }
  private append(ev: QueueEvent) {
    return appendFile(this.queueFile, JSON.stringify({ at: this.now(), ...ev }) + "\n", "utf8");
  }

  // A pid from another host says nothing about this host's process table.
  private pidDead(rec: { host?: string; pid?: number }): boolean {
    return rec.host === this.host && !this.alive(rec.pid ?? 0);
  }
  private staleReason(lease: LeaseRecord): string | null {
    if (this.pidDead(lease)) return "pid-dead";
    if (this.now() - (lease.heartbeatAt ?? 0) > (lease.ttlS ?? DEFAULT_TTL_S) * 1000) return "heartbeat-expired";
    return null;
  }
  private liveWaiters(events: QueueEvent[]): QueueEvent[] {
    const waiting = new Map<string, QueueEvent>();
    for (const e of events) {
      if (e.ev === "wait" && e.ticket) waiting.set(e.ticket, e);
      else if ((e.ev === "grant" || e.ev === "leave") && e.ticket) waiting.delete(e.ticket);
    }
    return [...waiting.values()].filter((w) => !this.pidDead(w));
  }
  private reclaimCount(events: QueueEvent[]): number {
    let n = 0;
    for (const e of events) if (e.ev === "reclaim") n = e.reclaims ?? n + 1;
    return n;
  }
  /** Under the lock. The live lease, or null once a stale one is gone. */
  private async reclaimIfStale(): Promise<LeaseRecord | null> {
    const lease = await this.readLease();
    if (!lease) return null;
    const why = this.staleReason(lease);
    if (!why) return lease;
    const n = this.reclaimCount(await this.events()) + 1;
    await this.append({
      ev: "reclaim", reclaims: n, reason: why, by: this.pid, tenant: lease.tenant,
      engine: lease.engine, pid: lease.pid, ticket: lease.ticket,
    });
    await rm(this.leaseFile, { force: true });
    console.warn(`  lease: reclaimed ${lease.engine} from ${lease.tenant} (pid ${lease.pid}, ${why}); reclaims=${n}`);
    return null;
  }

  private busyMessage(tenant: string, engine: string, lease: LeaseRecord | null, waiters: QueueEvent[]): string {
    const who = lease
      ? `${lease.tenant} holds ${lease.engine} (pid ${lease.pid})`
      : `${waiters.length} waiter(s) are ahead`;
    return `${tenant} could not get the gpu for ${engine}: ${who}`;
  }

  async acquire(opts: AcquireOptions): Promise<LeaseHandle> {
    const { tenant, engine, vramGb } = opts;
    if (engine !== "comfy" && engine !== "ollama") throw new LeaseError(`unknown engine ${JSON.stringify(engine)}`);
    const waitMs = opts.waitMs ?? 0;
    const ticket = randomBytes(6).toString("hex");
    let enqueued = false;
    const deadline = this.now() + waitMs;
    for (;;) {
      const got = await this.locked(async (): Promise<LeaseHandle | "again"> => {
        const lease = await this.reclaimIfStale();
        const waiters = this.liveWaiters(await this.events());
        const head = enqueued ? waiters.length > 0 && waiters[0].ticket === ticket : waiters.length === 0;
        if (!lease && head) {
          const t = this.now();
          const rec: LeaseRecord = {
            tenant, engine, vramGb, pid: this.pid, host: this.host, jobPrefix: opts.jobPrefix ?? "",
            acquiredAt: t, heartbeatAt: t, ttlS: opts.ttlS ?? DEFAULT_TTL_S, ticket,
          };
          await this.writeLease(rec);
          await this.append({ ev: "grant", ticket, tenant, engine, pid: this.pid, host: this.host });
          return new LeaseHandle(this, rec);
        }
        if (waitMs <= 0) throw new LeaseTimeout(this.busyMessage(tenant, engine, lease, waiters), lease);
        if (!enqueued) {
          await this.append({ ev: "wait", ticket, tenant, engine, vramGb, pid: this.pid, host: this.host });
          enqueued = true;
        }
        if (this.now() >= deadline) {
          await this.append({ ev: "leave", ticket, tenant, reason: "timeout" });
          throw new LeaseTimeout(this.busyMessage(tenant, engine, lease, waiters), lease);
        }
        return "again";
      });
      if (got !== "again") return got;
      await this.sleep(this.pollMs);
    }
  }

  async heartbeat(rec: LeaseRecord): Promise<LeaseRecord> {
    return this.locked(async () => {
      const cur = await this.readLease();
      if (!cur || cur.ticket !== rec.ticket) throw new LeaseLost(`the ${rec.engine} lease of ${rec.tenant} was reclaimed`);
      cur.heartbeatAt = this.now();
      await this.writeLease(cur);
      return cur;
    });
  }

  async release(rec: LeaseRecord): Promise<void> {
    await this.locked(async () => {
      const cur = await this.readLease();
      if (cur && cur.ticket === rec.ticket) {
        await rm(this.leaseFile, { force: true });
        await this.append({ ev: "release", ticket: rec.ticket, tenant: rec.tenant });
      }
    });
  }

  /** Run `stop` only if `holder` is the live holder for `engine`; else LeaseHeld naming who is. */
  async recycle<T>(engine: GpuEngine, holder: LeaseHandle | null, stop: () => T | Promise<T>): Promise<T> {
    await this.locked(async () => {
      const lease = await this.reclaimIfStale();
      if (!lease) throw new LeaseHeld(`refusing to recycle ${engine}: you hold no lease (acquire one first)`, null);
      if (!holder || holder.ticket !== lease.ticket)
        throw new LeaseHeld(
          `refusing to recycle ${engine}: ${lease.tenant} holds the gpu (${lease.engine}, pid ${lease.pid}). ` +
            `Recycling would kill its work.`,
          lease,
        );
      if (lease.engine !== engine) throw new LeaseHeld(`your lease is for ${lease.engine}, not ${engine}`, lease);
    });
    return stop();
  }

  async status(): Promise<GpuStatus> {
    const lease = await this.readLease();
    const events = await this.events();
    return {
      holder: lease,
      stale: lease ? this.staleReason(lease) : null,
      queue: this.liveWaiters(events).map((w) => ({ tenant: w.tenant, engine: w.engine, pid: w.pid })),
      reclaims: this.reclaimCount(events),
    };
  }
}

/** The process-wide broker, resolving its directory per call like every store here. */
export function gpuBroker(): GpuBroker {
  return new GpuBroker();
}
