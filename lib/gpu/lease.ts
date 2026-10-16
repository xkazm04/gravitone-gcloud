// GPU TENANCY LEASE — v1's public API, now a thin shim over the KERNEL lease on
// the card's one slot, `gpu.local#1` (Phase 4, L27). Server-only.
//
// THERE WERE TWO LEASES, AND TWO LEASES DO NOT EXCLUDE EACH OTHER. v1's broker
// (this file and pipeline/gpu/lease.py, speaking a lock file, lease.json and a
// queue.jsonl under foundry-out/gpu) kept the Ollama eye, the consistency lanes
// and Dojo's video runs off each other's renders; Phase 4's kernel jobs claim
// `gpu.local#1` in the store (packages/kernel/src/job-run.ts). A forge job on
// the kernel lease and a recognition on the file lease could both believe they
// held the card. Now every tenant - a kernel job, this broker, the Python broker
// (pipeline/gpu/lease.py over packages/kernel/py/lease.py) - claims the same row
// of the same table under the same write lock, so each excludes every other.
//
// KEPT, BECAUSE CALLERS ARE BUILT ON IT: the whole public API - FIFO acquire
// with a bounded wait (LeaseTimeout naming the holder, never a hang), LeaseLost,
// recycle only by the live holder (LeaseHeld naming the tenant), status, a dead
// same-host holder reclaimed at once. UPGRADED by the kernel lease: no stale lock
// file, no torn queue line, a reused pid told apart by bootId, a fence that never
// goes back, and every grant, reclaim and release a ledger event.
// The tenant's own words (tenant, engine, vramGb, jobPrefix) ride on a
// `gpu.tenant` event appended in the granting transaction, so a LeaseHeld still
// names "forge-comfy holds comfy" - and a kernel JOB holding the slot is named
// by its producer and id (engine "job").
//
// THE KERNEL IS LOADED LAZILY (lib/principal.ts's reason): this module sits under
// lib/imaging/router, which Playwright's node lane loads through its CommonJS
// transform, and a static @gt/* import there breaks the ES-module probes after it.
//
// THE OLD ROOT. `gpuRoot()` (GPU_LEASE_DIR, else foundry-out/gpu) is no longer
// where the lease lives: its queue.jsonl is frozen history the ledger's gpu
// source still projects, and the first broker to open the store leaves a
// MIGRATED marker there saying where the lease went (plan §5.3).

import os from "node:os";
import { randomBytes } from "node:crypto";

import type { Holder } from "@gt/domain/job";
import type { LeaseStatus } from "@gt/kernel/lease-core";
import type { NotPromise, Reader, Store, Tx } from "@gt/kernel/store";
import { gpuRoot, markMigrated } from "./legacy";
import { OUT_DIRNAME } from "../fixtures/mode";

export type GpuEngine = "comfy" | "ollama";

export interface LeaseRecord {
  tenant: string;
  /** "job" when the holder is a kernel job (its tenant names the producer and job). */
  engine: GpuEngine | "job";
  vramGb: number;
  pid: number;
  host: string;
  jobPrefix: string;
  acquiredAt: number;
  heartbeatAt: number;
  ttlS: number;
  ticket: string;
  /** The kernel lease's fencing token: the holder's identity across every check. */
  fence?: number;
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

export { gpuRoot, markMigrated };

export const DEFAULT_TTL_S = 120;
/** @gt/domain/lane `laneSlots("gpu.local")[0]`: the card has one slot (test/gpu-lease.test.ts holds them equal). */
export const GPU_SLOT = "gpu.local#1";
const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
  /** The kernel store; default the app's (GRAVITONE_STORE_PATH, else <universe>/gravitone.sqlite). */
  store?: string;
  /** v1's lease directory, for its MIGRATED marker; default gpuRoot(). */
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

/** The kernel modules, imported on first use (the header says why not statically). */
let loaded: Promise<{ lease: typeof import("@gt/kernel/lease"); events: typeof import("@gt/kernel/events"); proc: typeof import("@gt/kernel/process"); kern: typeof import("@gt/kernel/kernel") }> | undefined;
function modules() {
  loaded ??= Promise.all([import("@gt/kernel/lease"), import("@gt/kernel/events"), import("@gt/kernel/process"), import("@gt/kernel/kernel")]).then(([lease, events, proc, kern]) => ({ lease, events, proc, kern }));
  return loaded;
}

type Kernel = {
  lease: typeof import("@gt/kernel/lease");
  events: typeof import("@gt/kernel/events");
  store: Store;
  close?: () => void;
};

const text = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

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
  private readonly storePath: string | undefined;
  private readonly alive: (pid: number) => boolean;
  private readonly now: () => number;
  private readonly ownClock: boolean;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly pollMs: number;
  private kernel: Promise<Kernel> | undefined;

  constructor(opts: BrokerOptions = {}) {
    this.root = opts.root ?? gpuRoot();
    this.storePath = opts.store;
    this.pid = opts.pid ?? process.pid;
    this.host = opts.host ?? os.hostname();
    this.alive = opts.alive ?? pidAlive;
    this.now = opts.now ?? Date.now;
    this.ownClock = opts.now !== undefined;
    this.sleep = opts.sleep ?? sleepMs;
    this.pollMs = opts.pollMs ?? 250;
  }

  /** The kernel, on first use. A named store or an injected clock gets a handle of its own; the
   *  app's store is the process's one handle (@gt/kernel/process), shared with every route. */
  private open(): Promise<Kernel> {
    this.kernel ??= (async (): Promise<Kernel> => {
      const { lease, events, proc, kern } = await modules();
      markMigrated(this.root);
      const location = this.storePath ?? proc.storeLocation(OUT_DIRNAME);
      if (this.storePath === undefined && !this.ownClock) {
        const k = proc.processKernel(location);
        if (!k.ok) throw new LeaseError(`the gpu lease's store ${location} did not open: ${k.error.message}`);
        return { lease, events, store: k.value.store };
      }
      const k = kern.openKernel(location, { clock: () => new Date(this.now()) });
      if (!k.ok) throw new LeaseError(`the gpu lease's store ${location} did not open: ${k.error.message}`);
      return { lease, events, store: k.value.store, close: () => k.value.close() };
    })();
    this.kernel.catch(() => (this.kernel = undefined));
    return this.kernel;
  }

  /**
   * A read of the slot. The app's store is read through the process's one handle when the
   * process has it open (a server, a worker), and otherwise through a handle opened for this
   * read and closed after it - so a READER (the ledger's gpu source, a status line, a v1 test
   * running every source) never leaves the store open behind it. Acquiring is not a read: a
   * tenant that takes the card takes the process handle and keeps it, as a route does.
   */
  private async reading<T>(fn: (k: Kernel, r: Reader) => NotPromise<T>): Promise<T> {
    const viaOwn = async (k: Kernel): Promise<T> => {
      const r = k.store.read((rd) => fn(k, rd));
      if (!r.ok) throw new LeaseError(r.error.message);
      return r.value;
    };
    if (this.storePath !== undefined || this.ownClock) return viaOwn(await this.open());
    const { lease, events, proc, kern } = await modules();
    markMigrated(this.root);
    const location = proc.storeLocation(OUT_DIRNAME);
    const held = globalThis.__gravitoneKernel;
    if (held !== undefined && held.location === location) return viaOwn({ lease, events, store: held.kernel.store });
    const k = kern.openKernel(location);
    if (!k.ok) throw new LeaseError(`the gpu lease's store ${location} did not open: ${k.error.message}`);
    try {
      return await viaOwn({ lease, events, store: k.value.store });
    } finally {
      k.value.close();
    }
  }

  /** Close a handle this broker opened for itself (a named store or a test clock). */
  async close(): Promise<void> {
    const k = await this.kernel?.catch(() => undefined);
    this.kernel = undefined;
    k?.close?.();
  }

  /** This process's bootId (shared with its kernel jobs), under the pid and host the broker plays. */
  private me(k: Kernel): Holder {
    return { bootId: k.lease.processHolder().bootId, pid: this.pid, host: this.host };
  }

  /** One store transaction; a fence that no longer holds is LeaseLost, any other fault LeaseError. */
  private run<T>(k: Kernel, fn: (t: Tx) => NotPromise<T>): T {
    const r = k.store.tx(fn);
    if (!r.ok) throw r.error.code === "conflict" ? new LeaseLost(r.error.message) : new LeaseError(r.error.message);
    return r.value;
  }

  /** The holder of the slot as v1 named it, read inside one snapshot. */
  private holderIn(k: Kernel, r: Reader, me: Holder): { holder: LeaseRecord | null; stale: string | null; st: LeaseStatus } {
    const st = k.lease.statusIn(r, GPU_SLOT, me, this.alive);
    const h = st.holder;
    if (h === undefined) return { holder: null, stale: null, st };
    const t = r.get(
      "SELECT json_extract(data, '$.tenant') AS tenant, json_extract(data, '$.engine') AS engine, json_extract(data, '$.vramGb') AS vram, json_extract(data, '$.jobPrefix') AS prefix FROM events WHERE subject_id = ? AND type = 'gpu.tenant' AND json_extract(data, '$.fence') = ? ORDER BY seq DESC LIMIT 1",
      GPU_SLOT, h.fence,
    );
    const job = t === undefined ? r.get("SELECT id, json_extract(record, '$.producer') AS producer FROM jobs WHERE state = 'running' AND json_extract(record, '$.slot') = ? AND json_extract(record, '$.lease.fence') = ?", GPU_SLOT, h.fence) : undefined;
    const ticket = text(r.get("SELECT json_extract(data, '$.ticket') AS ticket FROM events WHERE subject_id = ? AND type = 'lease.claimed' AND json_extract(data, '$.fence') = ? ORDER BY seq DESC LIMIT 1", GPU_SLOT, h.fence)?.["ticket"]);
    const engine = text(t?.["engine"]);
    const holder: LeaseRecord = {
      tenant: text(t?.["tenant"]) ?? (job === undefined ? `${h.holder.host}/${h.holder.pid}` : `${text(job["producer"]) ?? "a"} job ${String(job["id"])}`),
      engine: engine === "comfy" || engine === "ollama" ? engine : "job",
      vramGb: num(t?.["vram"]) ?? 0,
      pid: h.holder.pid,
      host: h.holder.host,
      jobPrefix: text(t?.["prefix"]) ?? "",
      acquiredAt: Date.parse(h.acquiredAt),
      heartbeatAt: Date.parse(h.heartbeatAt),
      ttlS: h.ttlS,
      ticket: ticket ?? `fence-${h.fence}`,
      fence: h.fence,
    };
    // v1's word for a holder whose process is gone; the kernel says holder-gone.
    const stale = st.stale === undefined ? null : st.stale === "holder-gone" ? "pid-dead" : st.stale;
    return { holder, stale, st };
  }

  private busyMessage(tenant: string, engine: string, lease: LeaseRecord | null, waiters: number): string {
    const who = lease ? `${lease.tenant} holds ${lease.engine} (pid ${lease.pid})` : `${waiters} waiter(s) are ahead`;
    return `${tenant} could not get the gpu for ${engine}: ${who}`;
  }

  async acquire(opts: AcquireOptions): Promise<LeaseHandle> {
    const { tenant, engine, vramGb } = opts;
    if (engine !== "comfy" && engine !== "ollama") throw new LeaseError(`unknown engine ${JSON.stringify(engine)}`);
    const k = await this.open();
    const me = this.me(k);
    const waitMs = opts.waitMs ?? 0;
    const ttlS = opts.ttlS ?? DEFAULT_TTL_S;
    const ticket = randomBytes(6).toString("hex");
    const actor = { kind: "machine" as const, id: `${this.host}/${this.pid}` };
    const deadline = this.now() + waitMs;
    let announced = false;
    for (;;) {
      const r = k.store.tx((t): { rec: LeaseRecord } | { busy: LeaseRecord | null; waiters: number; queued: boolean } => {
        const o = k.lease.claimIn(t, { resource: GPU_SLOT, holder: me, ticket, ttlS, wait: waitMs > 0 }, this.alive);
        if (o.kind === "granted") {
          const tenantData = { fence: o.lease.fence, ticket, tenant, engine, vramGb, jobPrefix: opts.jobPrefix ?? "" };
          k.events.append(t, { actor, type: "gpu.tenant", subject: { kind: "lease", id: GPU_SLOT }, lane: "gpu.local", data: tenantData });
          const rec: LeaseRecord = { tenant, engine, vramGb, pid: this.pid, host: this.host, jobPrefix: opts.jobPrefix ?? "", acquiredAt: Date.parse(o.lease.acquiredAt), heartbeatAt: Date.parse(o.lease.heartbeatAt), ttlS, ticket, fence: o.lease.fence };
          return { rec };
        }
        if (o.kind === "queued" && !announced) k.events.append(t, { actor, type: "gpu.waiting", subject: { kind: "lease", id: GPU_SLOT }, lane: "gpu.local", data: { ticket, tenant, engine, vramGb } });
        const seen = this.holderIn(k, t, me);
        return { busy: seen.holder, waiters: seen.st.queue.length, queued: o.kind === "queued" };
      });
      if (!r.ok) {
        // A store busy past its timeout is contention, not a fault: poll again while the wait has time left.
        if (r.error.code === "unavailable" && this.now() < deadline) {
          await this.sleep(this.pollMs);
          continue;
        }
        throw new LeaseError(r.error.message);
      }
      const got = r.value;
      if ("rec" in got) return new LeaseHandle(this, got.rec);
      if (got.queued) announced = true;
      if (waitMs <= 0 || this.now() >= deadline) {
        if (got.queued) this.run(k, (t) => k.lease.leaveIn(t, GPU_SLOT, ticket));
        throw new LeaseTimeout(this.busyMessage(tenant, engine, got.busy, got.waiters), got.busy);
      }
      await this.sleep(this.pollMs);
    }
  }

  async heartbeat(rec: LeaseRecord): Promise<LeaseRecord> {
    const k = await this.open();
    if (rec.fence === undefined) throw new LeaseLost(`the ${rec.engine} lease of ${rec.tenant} carries no fence`);
    const fence = rec.fence;
    try {
      const lease = this.run(k, (t) => k.lease.heartbeatIn(t, GPU_SLOT, fence));
      return { ...rec, heartbeatAt: Date.parse(lease.heartbeatAt) };
    } catch (e) {
      if (e instanceof LeaseLost) throw new LeaseLost(`the ${rec.engine} lease of ${rec.tenant} was reclaimed (${e.message})`);
      throw e;
    }
  }

  async release(rec: LeaseRecord): Promise<void> {
    if (rec.fence === undefined) return;
    const k = await this.open();
    const fence = rec.fence;
    this.run(k, (t) => k.lease.releaseIn(t, GPU_SLOT, fence));
  }

  /** Run `stop` only if `holder` is the live holder for `engine`; else LeaseHeld naming who is. */
  async recycle<T>(engine: GpuEngine, holder: LeaseHandle | null, stop: () => T | Promise<T>): Promise<T> {
    const seen = await this.reading((k, rd) => this.holderIn(k, rd, this.me(k)));
    const lease = seen.stale === null ? seen.holder : null;
    if (!lease) throw new LeaseHeld(`refusing to recycle ${engine}: you hold no lease (acquire one first)`, null);
    if (!holder || holder.rec.fence !== lease.fence)
      throw new LeaseHeld(`refusing to recycle ${engine}: ${lease.tenant} holds the gpu (${lease.engine}, pid ${lease.pid}). Recycling would kill its work.`, lease);
    if (lease.engine !== engine) throw new LeaseHeld(`your lease is for ${lease.engine}, not ${engine}`, lease);
    return stop();
  }

  async status(): Promise<GpuStatus> {
    return this.reading((k, rd) => {
      const seen = this.holderIn(k, rd, this.me(k));
      const queue = seen.st.queue.map((w) => {
        const t = rd.get("SELECT json_extract(data, '$.tenant') AS tenant, json_extract(data, '$.engine') AS engine FROM events WHERE subject_id = ? AND type = 'gpu.waiting' AND json_extract(data, '$.ticket') = ? ORDER BY seq DESC LIMIT 1", GPU_SLOT, w.ticket);
        const tenant = text(t?.["tenant"]);
        const engine = text(t?.["engine"]);
        return { ...(tenant === undefined ? {} : { tenant }), ...(engine === undefined ? {} : { engine }), pid: w.holder.pid };
      });
      return { holder: seen.holder, stale: seen.stale, queue, reclaims: seen.st.reclaims };
    });
  }
}

/** The process-wide broker over the app's store, resolving its location per call like every store here. */
export function gpuBroker(): GpuBroker {
  return new GpuBroker();
}
