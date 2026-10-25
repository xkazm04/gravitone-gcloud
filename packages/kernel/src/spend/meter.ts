import { randomUUID } from "node:crypto";
import { err, ok, type Result } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import { paid, type CallIntent } from "../dryrun.ts";
import type { Effects } from "../effects.ts";
import type { Tx } from "../store.ts";
import type { SpendClass } from "./core.ts";
import { book, bump, lapse, release, reserve, settle, type SettleEntry } from "./ledger.ts";
import { createSettler, dropPending, unappliable } from "./settler.ts";

// THE STEP METER - spend is the meter's (Director's decision 7). Every priced
// call inside a job reserves against kernel/spend WITH the job id and the step,
// settles there, and the job's `spend` is a PROJECTION of those rows, never a
// second running total that can drift from the first.
//
// What it composes, and why each piece is the one it is:
//   spend/ledger   reserve -> settle | release, the hold counting against the
//                  period ceiling while the call is out (lib/spend/meter.ts:
//                  "reserve before spending");
//   dryrun.paid    the call declared, so the job's dry port answers it with a
//                  stand-in and a would-call instead of the vendor - a dry step
//                  holds nothing, as a dry route holds nothing (router/reserve.ts);
//   spend/settler  a settle that meets a busy store is kept and applied at the
//                  next transaction, never dropped: the vendor was already asked.
//
// UNPRICED IS A ROW WITH ITS REASON (cost-metering: usage-ledgers, "failures
// are spend"; v1 extract `book`). Suno credits, a Leonardo studio credit, a seat
// that reports nothing: counted on the job, with the sentence saying why there
// is no figure, and never invented as dollars.
//
// A PRODUCER THAT DOES NOT METER is metered by the driver (projection.ts `chargeOutcome`):
// its reported cost, or its estimate counted as unpriced, is booked on the
// count-only `job-usd` class against the job and step. So the projection
// holds for every producer, including the ones Phase 4 has not ported yet.
//
// A HOLD STILL OPEN WHEN ITS STEP ENDS is an unknown outcome (the producer
// threw after the vendor answered, or forgot to settle): the driver LAPSES it
// (spend/core.ts) - it keeps counting against the period at its estimate, and
// it is not in the job's settled total, which says only what is known. A hold
// whose settle the store DEFERRED is not unknown: the vendor's figure is in the
// step's settler, and the booking applies it (`lapseOpen`) instead of lapsing it.

/** The class the driver books a non-metering producer's spend on: count-only, it refuses nothing. */
export const JOB_USD: SpendClass = Object.freeze({ id: "job-usd", unit: "usd", windowMs: 30 * 86_400_000, ceiling: null });

export type MeterHold = {
  readonly id: string;
  readonly cls: SpendClass;
  readonly amount: number;
  readonly dry: boolean;
  /** What the vendor reported, kept because the settle met a busy store (settler.ts). */
  readonly pending?: readonly SettleEntry[];
};

export type StepMeter = {
  /** Hold `amount` (in the class's unit) for one call. A `budget` error is the period ceiling: map it to a `money-stop`. */
  reserve(cls: SpendClass, amount: number): Result<MeterHold>;
  settle(hold: MeterHold, entries: readonly SettleEntry[]): Result<void>;
  /** The vendor never saw the call. */
  release(hold: MeterHold): Result<void>;
  /** A call that held nothing: a count-only class (v1 text-usd). */
  book(cls: SpendClass, entry: SettleEntry): Result<void>;
  /** A credit-priced call: counted on the job with the reason it has no dollar figure. */
  unpriced(reason: string, cls?: SpendClass): Result<void>;
  /**
   * One paid call, whole: reserve (a ceilinged class) -> the declared call
   * through the job's port -> settle with what the vendor reported. Dry: the
   * port answers with the intent's stand-in and nothing is held or booked.
   */
  paid<T>(cls: SpendClass, amount: number, intent: CallIntent<T>, live: () => Promise<{ readonly value: T; readonly entries: readonly SettleEntry[] }>): Promise<Result<T>>;
  /** Whether the producer metered anything in this step; the driver books for it otherwise. */
  readonly used: () => boolean;
  /** Holds neither settled nor released, and settles still waiting for the store (with `pending`). */
  readonly open: () => readonly MeterHold[];
};

/** The meter one step of one drive gets. `fx` is the job's port (dry or live). */
export function stepMeter(fx: Effects, job: Job, step: string, owner: string): StepMeter {
  const dry = job.mode.kind === "dry";
  const settler = createSettler(fx);
  const holds = new Map<string, MeterHold>();
  /** Every hold this step reserved, so a deferred settle can be named with its amount. */
  const reserved = new Map<string, MeterHold>();
  let used = false;
  const axis = { jobId: job.id, step };

  const self: StepMeter = {
    reserve(cls, amount) {
      used = true;
      const id = `${job.id}/${job.attempt}/${step}/${randomUUID()}`;
      if (dry) return ok({ id, cls, amount, dry: true });
      const r = fx.tx("meter.reserve", (t) => reserve(t, cls, { id, amount, owner, jobId: job.id, step }));
      if (!r.ok) return r;
      if (!r.value.ok) return { ok: false, error: r.value.error };
      const hold: MeterHold = { id, cls, amount, dry: false };
      holds.set(id, hold);
      reserved.set(id, hold);
      return ok(hold);
    },
    settle(hold, entries) {
      used = true;
      if (hold.dry) return ok(undefined);
      const s = settler.settle(hold.cls, hold.id, entries);
      if (!s.ok) return s;
      holds.delete(hold.id);
      return ok(undefined);
    },
    release(hold) {
      used = true;
      if (hold.dry) return ok(undefined);
      const r = fx.tx("meter.release", (t) => release(t, hold.cls, { id: hold.id, by: owner }));
      if (!r.ok) return r;
      if (!r.value.ok) return r.value;
      holds.delete(hold.id);
      return ok(undefined);
    },
    book(cls, entry) {
      used = true;
      if (dry) return ok(undefined);
      return fx.tx("meter.book", (t) => book(t, cls, entry, owner, axis));
    },
    unpriced(reason, cls = JOB_USD) {
      return self.book(cls, { amount: undefined, outcome: "served", basis: "credits", axes: {}, reason });
    },
    async paid(cls, amount, intent, live) {
      const ceilinged = cls.ceiling !== null;
      const hold = ceilinged ? self.reserve(cls, amount) : ok<MeterHold | undefined>(undefined);
      if (!hold.ok) return hold;
      used = true;
      const { stand, ...rest } = intent;
      const call = paid({ ...rest, ...(stand === undefined ? {} : { stand: () => ({ value: stand(), entries: [] }) }) }, live);
      const out = await fx.call(`${intent.provider}/${intent.model}`, call);
      if (dry) return ok(out.value);
      const h = hold.value;
      const entries = out.entries.length > 0 ? out.entries : [{ amount: undefined, outcome: "served" as const, basis: "vendor" as const, axes: {}, reason: `${intent.provider} reported no figure` }];
      for (const s of h === undefined ? entries.map((e) => self.book(cls, e)) : [self.settle(h, entries)]) {
        if (!s.ok) return err(s.error.code, `spend: ${intent.provider} answered and its booking failed: ${s.error.message}`, { cause: s.error });
      }
      return ok(out.value);
    },
    used: () => used,
    // A settle deferred by a busy store lives only in this step's settler, which
    // nothing flushes once the step ends: it is handed to the booking with its entries.
    open: () => [
      ...holds.values(),
      ...settler.pending().map((p): MeterHold => ({ ...(reserved.get(p.id) ?? { id: p.id, cls: p.cls, amount: 0, dry: false }), pending: p.entries })),
    ],
  };
  return self;
}

/**
 * Close a step's open holds inside the booking transaction. One whose settle
 * was deferred is settled with what the vendor reported (a late write, as the
 * settler counts it); any other has an unknown outcome and lapses.
 */
export function lapseOpen(t: Tx, holds: readonly MeterHold[]): void {
  for (const h of holds) {
    if (h.dry) continue;
    if (h.pending !== undefined) {
      const s = settle(t, h.cls, { id: h.id, entries: h.pending });
      if (s.ok && !s.value.already) bump(t, h.cls.id, "lateWrites", 1);
      // A settle that can never apply (the hold was released or expired meanwhile) is dropped, counted.
      if (!s.ok) {
        if (!unappliable(s.error)) throw s.error;
        dropPending(t, { cls: h.cls, id: h.id, entries: h.pending }, s.error);
      }
      continue;
    }
    const r = lapse(t, h.cls, h.id);
    if (!r.ok && r.error.code !== "refused") throw r.error;
  }
}
