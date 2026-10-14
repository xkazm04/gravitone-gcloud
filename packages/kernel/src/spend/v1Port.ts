import { z } from "zod";
import { parseAt, parseJsonAt } from "@gt/domain/door";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import { canonical } from "../canonical.ts";
import { append } from "../events.ts";
import type { Store, Tx } from "../store.ts";
import { bump } from "./ledger.ts";

// THE V1 PORT - lib/spend/store.ts's `SpendStore` contract, implemented over
// the kernel store and the spend ledger's own tables.
//
// lib/spend/store.ts DOES define a port (`SpendStore<R>`: kind, transact,
// lastSeen?, reason?, reset) and lib/spend/fileStore.ts implements it; the
// meter (lib/spend/meter.ts) only ever touches state through `transact`. So
// this file is that port's third adapter, with the port re-declared below
// (packages may not import lib/). Its rows land in `spend_rows` and its holds
// in `spend_reservations`, the same tables the kernel-native API writes, so a
// cutover moves ONE window, not two.
//
// It keeps v1's behaviour exactly, including the one rule the kernel upgrades:
// a dead owner's hold past its TTL is reclaimed and NOT booked (state
// `expired`, counted in expiredHolds/expiredAmount), because the meter's
// conformance kit pins that. Both conditions, as v1: older than the TTL AND
// its pid is not alive - a long render in a live process outlives any TTL.
//
// WHAT THE SWITCH WOULD TAKE (not done here; a later phase's cutover):
//   1. lib/spend/select.ts picks `v1SpendStore(openStore(...), cls, {busy:
//      (s, ms) => new SpendStoreBusy(s, ms), managedMarker: managedMarker(),
//      decode})` where it picks fileStore today, and SpendStoreKind gains
//      "sqlite" (the one member this file adds to v1's union).
//   2. The store must be migrated with eventsMigrations + spendMigrations
//      before first use, by whoever opens it (the app's boot, the CLIs).
//   3. The meter's `evicted` hook keeps firing from the meter's own prune; the
//      kernel never deletes a row, it marks `evicted_ms`.
//   4. Not covered: a kernel-native `lapseOwner` on the same class is
//      invisible to a v1 meter (it reads holds, not lapses), so the two must
//      not share a class until the meter itself moves onto ledger.ts.

/* ── the v1 port, re-declared (lib/spend/store.ts) ─────────────────────────── */

export interface Hold {
  readonly id: string;
  readonly amount: number;
  readonly createdAt: number;
  readonly pid?: number;
}

export interface MeterCounters {
  refusals: number;
  refused: number;
  booked: number;
  bookedFailed: number;
  failed: number;
  unpriced: number;
  evicted: number;
  evictedAmount: number;
  lastEvictionAt: number | null;
  expiredHolds: number;
  expiredAmount: number;
  lateWrites: number;
}

export interface SpendState<R> {
  rows: R[];
  holds: Record<string, Hold>;
  counters: MeterCounters;
}

/** v1's union plus "sqlite", this adapter. */
export type SpendStoreKind = "memory" | "file" | "sqlite";

export interface SpendStore<R> {
  readonly kind: SpendStoreKind;
  transact<T>(fn: (state: SpendState<R>) => T): Promise<T>;
  lastSeen?(): Readonly<SpendState<R>>;
  reason?(): string | undefined;
  reset(): void;
}

/** lib/spend/meter.ts MeterRow, the only row shape the meter books. */
export type V1Row = { at: number; amount: number; outcome: "served" | "failed"; basis: string; axes: Record<string, string | undefined> };

export const zeroCounters = (): MeterCounters => ({
  refusals: 0, refused: 0, booked: 0, bookedFailed: 0, failed: 0, unpriced: 0,
  evicted: 0, evictedAmount: 0, lastEvictionAt: null, expiredHolds: 0, expiredAmount: 0, lateWrites: 0,
});

/** lib/spend/fileStore.ts HOSTED_NOT_BUILT, verbatim. */
export const HOSTED_NOT_BUILT = "hosted spend store not built (operator 2026-10-07: local now, hosted later)";
export const DEFAULT_HOLD_TTL_MS = 15 * 60_000;

export type V1PortOptions<R> = {
  /** The error a busy store throws; at cutover, v1's `new SpendStoreBusy(store, waitMs)`. */
  readonly busy: (store: string, waitMs: number) => Error;
  /** Turns a stored row back into the meter's row type (its axes and basis words). */
  readonly decode: (row: V1Row) => R;
  /** The managed-posture marker that is set (lib/spend/fileStore.ts managedMarker), or null. */
  readonly managedMarker?: string | null;
  readonly holdTtlMs?: () => number;
  readonly isAlive?: (pid: number) => boolean;
  /** Wall clock for the TTL, as v1: a TTL is about how long a dead process's hold sat here. */
  readonly now?: () => number;
  readonly waitMs?: number;
};

const COUNTER_NAMES = ["refusals", "refused", "booked", "bookedFailed", "failed", "unpriced", "evicted", "evictedAmount", "expiredHolds", "expiredAmount", "lateWrites"] as const;

function alive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means alive and not ours; only ESRCH proves it gone.
    return !(e instanceof Error && "code" in e && e.code === "ESRCH");
  }
}

const rowSchema = z.object({ seq: z.number().int(), at_ms: z.number(), amount: z.number(), outcome: z.enum(["served", "failed"]), basis: z.string(), axes: z.string() });
const axesSchema = z.record(z.string(), z.string());
const holdSchema = z.object({ id: z.string(), amount: z.number(), reserved_ms: z.number(), owner: z.string() });

const ownerOf = (h: Hold): string => (h.pid === undefined ? "v1" : `pid:${h.pid}`);
const pidOf = (owner: string): number | undefined => (/^pid:\d+$/.test(owner) ? Number(owner.slice(4)) : undefined);
const plainAxes = (axes: Record<string, string | undefined>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(axes)) if (v !== undefined) out[k] = v;
  return out;
};

type Loaded<R> = { state: SpendState<R>; seqOf: Map<R, number>; originals: Map<R, string>; holdIds: Set<string> };

function load<R>(t: Tx, cls: string, decode: (row: V1Row) => R): Loaded<R> {
  const seqOf = new Map<R, number>();
  const originals = new Map<R, string>();
  const rows: R[] = [];
  for (const raw of t.all("SELECT seq, at_ms, amount, outcome, basis, axes FROM spend_rows WHERE class = ? AND evicted_ms IS NULL ORDER BY seq", cls)) {
    const p = parseAt("v1 spend row", rowSchema, raw);
    if (!p.ok) throw p.error;
    const axes = parseJsonAt("v1 spend row axes", axesSchema, p.value.axes);
    if (!axes.ok) throw axes.error;
    const v: V1Row = { at: p.value.at_ms, amount: p.value.amount, outcome: p.value.outcome, basis: p.value.basis, axes: axes.value };
    const r = decode(v);
    rows.push(r);
    seqOf.set(r, p.value.seq);
    originals.set(r, canonical({ ...v, axes: plainAxes(v.axes) }));
  }
  const holds: Record<string, Hold> = {};
  for (const raw of t.all("SELECT id, amount, reserved_ms, owner FROM spend_reservations WHERE class = ? AND state = 'held' ORDER BY reserved_ms, id", cls)) {
    const p = parseAt("v1 spend hold", holdSchema, raw);
    if (!p.ok) throw p.error;
    const pid = pidOf(p.value.owner);
    holds[p.value.id] = pid === undefined ? { id: p.value.id, amount: p.value.amount, createdAt: p.value.reserved_ms } : { id: p.value.id, amount: p.value.amount, createdAt: p.value.reserved_ms, pid };
  }
  const counters = zeroCounters();
  for (const raw of t.all("SELECT name, value FROM spend_counters WHERE class = ?", cls)) {
    const name = String(raw["name"]);
    const value = typeof raw["value"] === "number" ? raw["value"] : 0;
    if (name === "lastEvictionAt") counters.lastEvictionAt = value;
    else if ((COUNTER_NAMES as readonly string[]).includes(name)) setCounter(counters, name, value);
  }
  return { state: { rows, holds, counters }, seqOf, originals, holdIds: new Set(Object.keys(holds)) };
}

function setCounter(c: MeterCounters, name: string, value: number): void {
  for (const k of COUNTER_NAMES) if (k === name) c[k] = value;
}

/** The kernel store as v1's SpendStore for one class. Refused on the managed posture. */
export function v1SpendStore<R extends V1Row>(store: Store, cls: string, opts: V1PortOptions<R>): Result<SpendStore<R>> {
  if (opts.managedMarker !== undefined && opts.managedMarker !== null) {
    return err("refused", `The spend store cannot run on the managed posture (${opts.managedMarker} is set): instances there share no disk. ${HOSTED_NOT_BUILT}`);
  }
  const ttl = opts.holdTtlMs ?? (() => DEFAULT_HOLD_TTL_MS);
  const isAlive = opts.isAlive ?? alive;
  const now = opts.now ?? Date.now;
  const actor = { kind: "machine" as const, id: `v1:${cls}` };
  let seen: SpendState<R> = { rows: [], holds: {}, counters: zeroCounters() };

  function reclaim(t: Tx, s: SpendState<R>, at: number): void {
    for (const [id, h] of Object.entries(s.holds)) {
      if (h.pid === undefined || at - h.createdAt <= ttl() || isAlive(h.pid)) continue;
      t.run("UPDATE spend_reservations SET state = 'expired', closed_ms = ? WHERE id = ? AND state = 'held'", at, id);
      Reflect.deleteProperty(s.holds, id);
      s.counters.expiredHolds++;
      s.counters.expiredAmount += h.amount;
      append(t, { actor, type: "spend.expired", subject: { kind: "reservation", id }, data: { class: cls, amount: h.amount, pid: h.pid, ageMs: at - h.createdAt } });
    }
  }

  function persist(t: Tx, l: Loaded<R>, before: MeterCounters): void {
    const at = Date.parse(t.at);
    const s = l.state;
    const kept = new Set<R>(s.rows);
    let evicted = 0;
    for (const [r, seq] of l.seqOf) {
      if (!kept.has(r)) {
        t.run("UPDATE spend_rows SET evicted_ms = ? WHERE seq = ?", at, seq);
        evicted++;
      } else if (canonical({ at: r.at, amount: r.amount, outcome: r.outcome, basis: r.basis, axes: plainAxes(r.axes) }) !== l.originals.get(r)) {
        throw new AppError("internal", "v1 spend port: a booked row was edited in place; rows are append-only");
      }
    }
    let added = 0;
    for (const r of s.rows) {
      if (l.seqOf.has(r)) continue;
      t.run("INSERT INTO spend_rows (class, at_ms, amount, outcome, basis, axes, reservation_id) VALUES (?, ?, ?, ?, ?, ?, NULL)", cls, r.at, r.amount, r.outcome, r.basis, canonical(plainAxes(r.axes)));
      added++;
    }
    let closed = 0;
    for (const id of l.holdIds) {
      if (id in s.holds || t.get("SELECT 1 AS x FROM spend_reservations WHERE id = ? AND state = 'held'", id) === undefined) continue;
      // A hold that left in the same transaction rows arrived in was settled
      // (meter.settle deletes and books in one fn); otherwise it was released.
      const to = added > 0 ? "settled" : "released";
      t.run("UPDATE spend_reservations SET state = ?, closed_ms = ? WHERE id = ? AND state = 'held'", to, at, id);
      closed++;
      append(t, { actor, type: `spend.${to}`, subject: { kind: "reservation", id }, data: { class: cls } });
    }
    for (const h of Object.values(s.holds)) {
      if (l.holdIds.has(h.id)) continue;
      t.run("INSERT INTO spend_reservations (id, class, amount, reserved_ms, owner, job_id, state, closed_ms) VALUES (?, ?, ?, ?, ?, NULL, 'held', NULL)", h.id, cls, h.amount, h.createdAt, ownerOf(h));
      append(t, { actor, type: "spend.reserved", subject: { kind: "reservation", id: h.id }, data: { class: cls, amount: h.amount } });
    }
    if (added > 0 && closed === 0) append(t, { actor, type: "spend.booked", subject: { kind: "spend-class", id: cls }, data: { class: cls, rows: added } });
    if (evicted > 0) append(t, { actor, type: "spend.evicted", subject: { kind: "spend-class", id: cls }, data: { class: cls, rows: evicted } });
    if (s.counters.refusals > before.refusals) append(t, { actor, type: "spend.refused", subject: { kind: "spend-class", id: cls }, data: { class: cls, refusals: s.counters.refusals } });
    for (const k of COUNTER_NAMES) {
      const d = s.counters[k] - before[k];
      if (d !== 0) bump(t, cls, k, d);
    }
    if (s.counters.lastEvictionAt !== null) t.run("INSERT INTO spend_counters (class, name, value) VALUES (?, 'lastEvictionAt', ?) ON CONFLICT (class, name) DO UPDATE SET value = excluded.value", cls, s.counters.lastEvictionAt);
  }

  const fail = (e: AppError): Error => (e.code === "unavailable" ? opts.busy(`${store.location}#${cls}`, opts.waitMs ?? 10_000) : e);

  return ok({
    kind: "sqlite",
    async transact<T>(fn: (state: SpendState<R>) => T): Promise<T> {
      let out: { value: T; state: SpendState<R> } | undefined;
      const r = store.tx((t) => {
        const l = load(t, cls, opts.decode);
        const before = { ...l.state.counters };
        reclaim(t, l.state, now());
        const value = fn(l.state);
        persist(t, l, before);
        out = { value, state: l.state };
      });
      if (!r.ok) throw fail(r.error);
      if (out === undefined) throw new AppError("internal", "v1 spend port: a transaction committed without running");
      seen = out.state;
      return out.value;
    },
    lastSeen: () => seen,
    reset(): void {
      const r = store.tx((t) => {
        const at = Date.parse(t.at);
        t.run("UPDATE spend_rows SET evicted_ms = ? WHERE class = ? AND evicted_ms IS NULL", at, cls);
        t.run("UPDATE spend_reservations SET state = 'released', closed_ms = ? WHERE class = ? AND state = 'held'", at, cls);
        t.run("DELETE FROM spend_counters WHERE class = ?", cls);
        append(t, { actor, type: "spend.reset", subject: { kind: "spend-class", id: cls }, data: { class: cls } });
      });
      if (!r.ok) throw fail(r.error);
      seen = { rows: [], holds: {}, counters: zeroCounters() };
    },
  });
}
