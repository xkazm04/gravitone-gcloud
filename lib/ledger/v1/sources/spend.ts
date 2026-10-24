import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { parseAt, parseJsonAt, type Parsed } from "@gt/domain/door";
import { err, errorMessage, ok, type Result } from "@gt/domain/errors";
import type { CostSource, EventData } from "@gt/domain/event";
import { zeroCounters, type Hold, type MeterCounters, type V1Row } from "@gt/kernel/spend/v1Port";
import type { Store } from "@gt/kernel/store";

import { SPEND_CLASSES, type SpendClass } from "../../../../lib/spend/classes.ts";
import { spendStoreDir } from "../../../../lib/spend/fileStore.ts";
import { SQLITE_CLASSES } from "../../../../lib/spend/select.ts";
import { storeLocation } from "../../../../lib/kernelStore.ts";
import { pidAlive } from "../../../../lib/gpu/lease.ts";
import { bump, digest, facts, instant, laneOfEngine } from "../facts.ts";
import type { IngestEvent, LiveHold, ProjectCtx, Projection, Skipped, Source } from "../types.ts";
import { universeRoot } from "./roots.ts";

// THE SPEND METER'S FILES, PROJECTED - <spend dir>/<class>.json, one per class
// (lib/spend/fileStore.ts: `{rows, holds, counters}`), read-only.
//
// NOT through lib/spendView.ts, which the brief names: it reads each class
// through the meter's `stats(now)`, and every meter read is a `transact` -
// it takes the class lock, PRUNES rows past the window (evicting them),
// RECLAIMS dead holds, and writes the file back. A projection may not write a
// v1 store. fileStore's own `readState` is not exported, so the class file is
// read here, through the door, into the shapes packages/kernel/src/spend/v1Port.ts
// already re-declares for the port (V1Row, Hold, MeterCounters) - one
// declaration of v1's spend state in the new tree, not two.
//
// ROWS EVICT AFTER THE WINDOW (an hour for most classes), so a row is
// event-grade only while it exists: each `rows[]` entry is a spend.book fact,
// recorded at its settle instant, keyed by (instant, content digest,
// occurrence) because v1 rows carry no id. It carries the money as `cost`
// - `src: "real"` for a vendor's figure, `"model"` for a row the meter booked
// at an estimate (an estimate is not money known to have left an account),
// and NO cost on the audio-seconds class, whose amount is seconds, not
// dollars. A row evicted between two syncs is never seen by the ledger.
//
// THEREFORE THE COUNTERS ARE THE RECONCILABLE FIGURE. They are cumulative and
// never evicted: booked, evicted, evictedAmount... Each sync observes them as
// one spend.counters fact per class, keyed by their digest - a new fact
// exactly when they moved - and the tally checks v1's own identity, every
// booked row is either still in `rows` or counted in `evicted`
// (lib/spend/meter.ts book and prune). A class where it fails is named in
// `records` as `<class>.unaccounted`, because then neither the rows nor the
// ledger can be the whole story.
//
// HOLDS are reservations in flight (meter.ts reserve): `holds` on the
// projection, never jobs and never events - a hold is settled into a row or
// released, and only the row is a fact. Owner `gone` is a hold fileStore's
// next transaction reclaims once SPEND_HOLD_TTL_MS has passed.
//
// A CLASS ON THE KERNEL STORE (lib/spend/select.ts SQLITE_CLASSES: text-usd,
// operator 2026-10-18) is read from the tables packages/kernel/src/spend/v1Port.ts
// writes - live `spend_rows`, `held` reservations, `spend_counters` - in one read
// transaction, into the same three shapes, from the process's open kernel: a
// reader never opens a store (./publish.ts says why), and a read transaction
// cannot prune, reclaim or bump. With no kernel open in this process its file
// is read as before: the history from before the switch.

const rowSchema = z.object({
  at: z.number(),
  amount: z.number(),
  outcome: z.enum(["served", "failed"]),
  basis: z.string(),
  axes: z.record(z.string(), z.string().optional()),
});
const counterNumber = z.number().optional();
const fileSchema = z.object({
  rows: z.array(rowSchema).default([]),
  // Keyed by hold id in v1; a list here, so no lookup can come back undefined.
  holds: z
    .record(z.string(), z.object({ id: z.string(), amount: z.number(), createdAt: z.number(), pid: z.number().optional() }))
    .default({})
    .transform((m) => Object.values(m)),
  counters: z
    .object({
      refusals: counterNumber, refused: counterNumber, booked: counterNumber, bookedFailed: counterNumber, failed: counterNumber, unpriced: counterNumber,
      evicted: counterNumber, evictedAmount: counterNumber, lastEvictionAt: z.number().nullable().optional(), expiredHolds: counterNumber, expiredAmount: counterNumber, lateWrites: counterNumber,
    })
    .default({}),
});

type ClassState = { readonly cls: SpendClass; readonly unit: "usd" | "audio-s" | "chars"; readonly rows: readonly V1Row[]; readonly holds: readonly (Hold & { readonly alive: boolean | null })[]; readonly counters: MeterCounters };
export type SpendSnapshot = { readonly classes: readonly ClassState[]; readonly skipped: readonly Skipped[] };

const METER = { kind: "machine", id: "spend-meter" } as const;

export const spendRoot = (): string => universeRoot("spend", spendStoreDir, "SPEND_STORE_DIR");

/** A class file's counters over v1's zeros: counters added after a file was written start at zero (fileStore readState). */
function countersOf(raw: Parsed<z.output<typeof fileSchema>>["counters"]): MeterCounters {
  const c = zeroCounters();
  for (const k of Object.keys(c) as (keyof MeterCounters)[]) {
    const v = raw[k];
    if (k === "lastEvictionAt") c.lastEvictionAt = typeof v === "number" ? v : null;
    else if (typeof v === "number") c[k] = v;
  }
  return c;
}

function openStore(): Store | undefined {
  const open = globalThis.__gravitoneKernel;
  return open === undefined || open.location !== storeLocation() ? undefined : open.kernel.store;
}

const kernelRow = z.object({ at_ms: z.number(), amount: z.number(), outcome: z.enum(["served", "failed"]), basis: z.string(), axes: z.string() });
const kernelHold = z.object({ id: z.string(), amount: z.number(), reserved_ms: z.number(), owner: z.string() });
const kernelCounter = z.object({ name: z.string(), value: z.number() });

/** One class's window on the kernel store, as the v1 port loads it (v1Port.ts load), read-only. */
function readKernelClass(store: Store, cls: SpendClass): Result<Omit<ClassState, "cls" | "unit">> {
  const read = store.read((r) => ({
    rows: r.all("SELECT at_ms, amount, outcome, basis, axes FROM spend_rows WHERE class = ? AND evicted_ms IS NULL ORDER BY seq", cls),
    holds: r.all("SELECT id, amount, reserved_ms, owner FROM spend_reservations WHERE class = ? AND state = 'held' ORDER BY reserved_ms, id", cls),
    counters: r.all("SELECT name, value FROM spend_counters WHERE class = ?", cls),
  }));
  if (!read.ok) return read;
  const p = parseAt(`spend ${cls} (kernel)`, z.object({ rows: z.array(kernelRow), holds: z.array(kernelHold), counters: z.array(kernelCounter) }), read.value);
  if (!p.ok) return p;
  const rows: V1Row[] = [];
  for (const r of p.value.rows) {
    const axes = parseJsonAt(`spend ${cls} row axes`, z.record(z.string(), z.string()), r.axes);
    if (!axes.ok) return axes;
    rows.push({ at: r.at_ms, amount: r.amount, outcome: r.outcome, basis: r.basis, axes: { ...axes.value } });
  }
  // The port records a hold's owner as `pid:<n>`, or `v1` for one taken with no pid.
  const holds: Hold[] = p.value.holds.map((h) => (/^pid:\d+$/.test(h.owner) ? { id: h.id, amount: h.amount, createdAt: h.reserved_ms, pid: Number(h.owner.slice(4)) } : { id: h.id, amount: h.amount, createdAt: h.reserved_ms }));
  const raw: Record<string, number> = {};
  for (const c of p.value.counters) raw[c.name] = c.value;
  return ok({ rows, holds: withAlive(holds), counters: countersOf(raw) });
}

const withAlive = (holds: readonly Hold[]): ClassState["holds"] => holds.map((h) => ({ ...h, alive: h.pid === undefined ? null : pidAlive(h.pid) }));

export async function readSpend(root: string, kernel: Store | undefined = openStore()): Promise<Result<SpendSnapshot>> {
  const classes: ClassState[] = [];
  const skipped: Skipped[] = [];
  for (const cls of Object.keys(SPEND_CLASSES) as SpendClass[]) {
    if (kernel !== undefined && SQLITE_CLASSES.has(cls)) {
      const k = readKernelClass(kernel, cls);
      if (!k.ok) return err(k.error.code, `spend: reading ${cls} from the kernel store failed: ${k.error.message}`, { cause: k.error });
      // A class that never booked has no file under fileStore; here it has no row, hold or counter.
      if (k.value.rows.length > 0 || k.value.holds.length > 0 || Object.values(k.value.counters).some((v) => v !== 0 && v !== null))
        classes.push({ cls, unit: SPEND_CLASSES[cls].unit, ...k.value });
      continue;
    }
    const file = path.join(root, `${cls}.json`);
    let text: string;
    try {
      // Synchronous on purpose: fileStore.writeAtomic retries its rename on a thread-blocking
      // busy-wait, so an async read still pending would hold the file open through every retry
      // (EPERM on Windows) - the shape 6ecf6f6b closed for ensureStyles.
      text = readFileSync(file, "utf8");
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code === "ENOENT") continue;
      return err("unavailable", `spend: reading ${file} failed: ${errorMessage(e)}`, { cause: e });
    }
    const p = parseJsonAt(`spend ${cls}`, fileSchema, text);
    if (!p.ok) {
      skipped.push({ id: cls, reason: p.error.message });
      continue;
    }
    const rows: V1Row[] = p.value.rows.map((r) => ({ at: r.at, amount: r.amount, outcome: r.outcome, basis: r.basis, axes: { ...r.axes } }));
    classes.push({ cls, unit: SPEND_CLASSES[cls].unit, rows, holds: withAlive(p.value.holds), counters: countersOf(p.value.counters) });
  }
  return ok({ classes, skipped });
}

/** How a row's figure is known: a vendor's report is money that left; an estimate is the meter's model of it. */
export const costSrcOf = (basis: string): CostSource => (/estimat|unpriced/i.test(basis) ? "model" : "real");

function eventsOf(c: ClassState, ctx: ProjectCtx): IngestEvent[] {
  const f = facts("spend", ctx);
  const subject = { kind: "spend-class", id: c.cls };
  const seen = new Map<string, number>();
  const out: IngestEvent[] = c.rows.map((r) => {
    const id = `${r.at}.${digest(JSON.stringify([r.amount, r.outcome, r.basis, Object.entries(r.axes).sort()]))}`;
    const n = seen.get(id) ?? 0;
    seen.set(id, n + 1);
    const axes: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.axes)) if (v !== undefined) axes[k] = v;
    const data: EventData = { class: c.cls, unit: c.unit, amount: r.amount, outcome: r.outcome, basis: r.basis, axes, ...(axes["project"] === undefined ? {} : { projectId: axes["project"] }) };
    const lane = laneOfEngine(axes["provider"]);
    const e = f.recorded(c.cls, `row.${id}.${n}`, r.at, { actor: METER, type: "spend.book", subject, ...(lane === null ? {} : { lane }), data });
    return c.unit === "usd" ? { ...e, cost: { usd: r.amount, src: costSrcOf(r.basis) } } : e;
  });
  out.push(f.observed(c.cls, `counters.${digest(JSON.stringify(c.counters))}`, { actor: METER, type: "spend.counters", subject, data: { class: c.cls, unit: c.unit, ...c.counters } }));
  return out;
}

function tallyOf(classes: readonly ClassState[]): Projection["tally"] {
  const records: Record<string, number> = {};
  const fs: Record<string, number> = {};
  for (const c of classes) {
    bump(records, `${c.cls}.rows`, c.rows.length);
    bump(records, `${c.cls}.holds`, c.holds.length);
    bump(records, `${c.cls}.unaccounted`, c.counters.booked - c.counters.evicted - c.rows.length);
    bump(fs, "spend.book", c.rows.length);
    bump(fs, "spend.counters");
  }
  return { records, facts: fs };
}

function holdsOf(c: ClassState): LiveHold[] {
  return c.holds.map((h) => {
    const since = instant(h.createdAt);
    return { source: "spend", id: h.id, spendClass: c.cls, amount: h.amount, unit: c.unit, ...(since === null ? {} : { since }), owner: h.alive === null ? "unknown" : h.alive ? "alive" : "gone" };
  });
}

export function projectSpend(s: SpendSnapshot, ctx: ProjectCtx): Projection {
  return {
    events: s.classes.flatMap((c) => eventsOf(c, ctx)),
    live: [],
    weir: [],
    holds: s.classes.flatMap(holdsOf),
    tally: tallyOf(s.classes),
    skipped: s.skipped,
  };
}

export const spendSource: Source<SpendSnapshot> = { id: "spend", read: () => readSpend(spendRoot()), project: projectSpend };
