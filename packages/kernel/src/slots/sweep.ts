import { randomUUID } from "node:crypto";
import { AppError, ok, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Holder } from "@gt/domain/job";
import { INTERRUPTED_TEXT, type Slot } from "@gt/domain/slot";
import { actorOf, claimIn, pidAlive, processHolder, releaseIn, snapshotOf } from "../lease.ts";
import { staleReason, type Alive } from "../lease-core.ts";
import type { Store, Tx } from "../store.ts";
import { toFailed, toMissed, toPublishing, withDrift } from "./core.ts";
import { listSlotsIn } from "./read.ts";
import { claimResource, type SlotRow } from "./schema.ts";
import { planSweep, type ClaimState, type SweepFacts } from "./sweep-core.ts";
import { putSlotIn } from "./write.ts";

// THE SWEEP DRIVER - ./sweep-core.ts's decisions applied in ONE write transaction, each with
// its event. Called by the worker's tick and the CLI only (COMMON decisions 2-3); never by a
// read.
//
// THE CLAIM IS A KERNEL LEASE on `slot:<id>` (COMMON decision 2), taken in the same transaction
// that moves the slot to `publishing`, so the claim and its evidence (holder, instant, fence)
// commit together (delivery-guarantees: atomic-claiming - the claim carries evidence). Two
// sweeps, in two processes, serialize on the store's write lock: the second reads the slot
// `publishing` under a live lease and leaves it. v1 needed a lock file for the same promise.
//
// A DEAD OR LAPSED CLAIMANT (claimState `stale`, or no lease at all) is interrupted: the
// sweeper takes the lease over - which moves the fence past the claimant's - and releases it,
// then fails the slot with v1's INTERRUPTED_TEXT. The claimant, if it was slow rather than dead,
// finds its fence gone when it tries to record a publication (./outcome.ts asserts it inside
// that write's transaction: concurrency-guards' fence-inside-write-transaction), so a slow
// upload can never overwrite the verdict the sweep gave. Nothing re-fires an interrupted slot;
// a person reschedules it (v1's `failed -> scheduled`, kept so a resumable session keyed by the
// slot is reused).

/** How long a claim lives without a heartbeat. The publisher heartbeats per chunk; v1 had no
 *  heartbeat and guarded pid reuse with a 6 h age instead - the bootId does that job now, so
 *  the TTL only has to outlast one chunk on a slow line. */
export const CLAIM_TTL_S = 600;

export type ClaimedSlot = { readonly slot: Slot; readonly fence: number };

export type SweepReport = {
  readonly missed: readonly string[];
  readonly interrupted: readonly string[];
  readonly drifted: readonly string[];
  readonly cleared: readonly string[];
  readonly claimed: readonly ClaimedSlot[];
};

export type SweepRun = {
  /** A tick claims what is due; the CLI's `sweep` only keeps the calendar honest. */
  readonly claim: boolean;
  readonly only?: ReadonlySet<string>;
  readonly holder?: Holder;
  readonly alive?: Alive;
  readonly ttlS?: number;
  /**
   * What the caller knows about a slot this pass marks missed, merged into its `slot.miss` event
   * - the worker's downtime gap (@gt/producers/publish/tick), so "missed because nothing was
   * awake" is on the same event, in the same commit, as the miss itself. Pure: called inside the
   * write, so it must not touch the store.
   */
  readonly missData?: (slot: Slot) => EventData | undefined;
};

function claimStateIn(t: Tx, slotId: string, me: Holder, alive: Alive): ClaimState {
  const held = snapshotOf(t, claimResource(slotId)).row?.held;
  if (held === undefined) return "absent";
  return staleReason(held, me, Date.parse(t.at), alive) === undefined ? "live" : "stale";
}

/** Take the lease over from a stale claimant and let it go: the fence moves past the claimant's. */
function fenceOut(t: Tx, slotId: string, me: Holder, alive: Alive, ttlS: number): void {
  const resource = claimResource(slotId);
  if (snapshotOf(t, resource).row?.held === undefined) return;
  const o = claimIn(t, { resource, holder: me, ticket: randomUUID(), ttlS, wait: false }, alive);
  if (o.kind !== "granted") throw new AppError("internal", `slot ${slotId}: a stale claim could not be taken over (${o.kind})`);
  releaseIn(t, resource, o.lease.fence);
}

/**
 * Which items the waiting slots name exist, asked BEFORE the write opens (L63's finding, as
 * ./write.ts readinessFor): `itemExists` is the caller's, and one that reads this store cannot
 * read inside the sweep's transaction - asked there, every item would read missing and every
 * waiting slot drift `export_missing`. A slot created between this read and the write is not in
 * the answer; the write leaves it for the next pass rather than guess.
 */
function existenceOf(store: Store, facts: SweepFacts): Result<{ readonly facts: SweepFacts; readonly asked: ReadonlySet<string> }> {
  const items = store.read((r) => new Set<string>(listSlotsIn(r, { states: ["scheduled", "missed"] }).map((x) => x.slot.libraryItemId)));
  if (!items.ok) return items;
  const exists = new Set<string>([...items.value].filter((item) => facts.itemExists(item)));
  return ok({ facts: { ...facts, itemExists: (item) => exists.has(item) }, asked: items.value });
}

/** One pass over the calendar: interrupt dead claims, annotate drift, mark missed, and - for a
 *  tick - claim what is due. Everything it decides commits together or not at all. */
export function sweep(store: Store, facts: SweepFacts, run: SweepRun): Result<SweepReport> {
  const me = run.holder ?? processHolder();
  const alive = run.alive ?? pidAlive;
  const ttlS = run.ttlS ?? CLAIM_TTL_S;
  const by = actorOf(me);
  const pre = existenceOf(store, facts);
  if (!pre.ok) return pre;
  const { facts: known, asked } = pre.value;
  return store.tx((t): SweepReport => {
    const rows = new Map<string, SlotRow>(listSlotsIn(t, { states: ["scheduled", "missed", "publishing"] }).map((r) => [r.slot.id, r]));
    const judged = [...rows.values()].filter((r) => r.slot.state === "publishing" || asked.has(r.slot.libraryItemId));
    const decisions = planSweep(judged.map((r) => r.slot), known, {
      claim: run.claim,
      claimState: (id) => claimStateIn(t, id, me, alive),
      ...(run.only === undefined ? {} : { only: run.only }),
    });
    const out = { missed: [] as string[], interrupted: [] as string[], drifted: [] as string[], cleared: [] as string[], claimed: [] as ClaimedSlot[] };
    for (const d of decisions) {
      const row = rows.get(d.id);
      if (row === undefined) throw new AppError("internal", `sweep decided on ${d.id}, which it did not read`);
      let next: SlotRow;
      switch (d.kind) {
        case "interrupt":
          fenceOut(t, d.id, me, alive, ttlS);
          next = putSlotIn(t, row, toFailed(row.slot, INTERRUPTED_TEXT), null, { by, type: "slot.fail", data: { error: INTERRUPTED_TEXT, interrupted: d.why } });
          out.interrupted.push(d.id);
          break;
        case "drift":
          next = putSlotIn(t, row, withDrift(row.slot, d.drift), null, { by, type: "slot.drift", data: { drift: d.drift } });
          out.drifted.push(d.id);
          break;
        case "undrift":
          next = putSlotIn(t, row, withDrift(row.slot, undefined), null, { by, type: "slot.drift-clear", data: { was: d.was } });
          out.cleared.push(d.id);
          break;
        case "miss": {
          const missedAt = new Date(facts.now).toISOString();
          const more = run.missData?.(row.slot) ?? {};
          next = putSlotIn(t, row, toMissed(row.slot, missedAt), null, { by, type: "slot.miss", data: { ...more, missedAt, overdueMin: Math.floor(d.overdueMs / 60_000) } });
          out.missed.push(d.id);
          break;
        }
        case "claim": {
          const o = claimIn(t, { resource: claimResource(d.id), holder: me, ticket: randomUUID(), ttlS, wait: false }, alive);
          // A lease already held on a slot that reads `scheduled` is a claimant this sweep must
          // not race; it is left for the next pass to judge.
          if (o.kind !== "granted") continue;
          next = putSlotIn(t, row, toPublishing(row.slot, me, t.at), o.lease.fence, { by, type: "slot.claim", data: { fence: o.lease.fence } });
          out.claimed.push({ slot: next.slot, fence: o.lease.fence });
          break;
        }
      }
      rows.set(d.id, next);
    }
    return out;
  });
}
