import { err, ok, type AppError, type Result } from "@gt/domain/errors";
import type { Effects } from "../effects.ts";
import { append } from "../events.ts";
import type { Tx } from "../store.ts";
import type { SpendClass } from "./core.ts";
import { bump, release, reserve, settle, type Reservation, type SettleEntry } from "./ledger.ts";

// THE METERED CALL - reserve -> external call -> settle, through the Effects
// port, with v1's deferred settle.
//
// lib/spend/meter.ts drew the line this driver keeps: a lock that cannot be
// had means two different things. On a RESERVATION nothing has been spent, so
// the call is refused before any vendor is touched. On a write that records
// what a vendor DID (a settle), the vendor has already been asked: dropping
// the row would under-read the window, so it is kept in this process and
// applied at the head of the next transaction that gets the store, which
// counts it in `lateWrites`. The caller is never failed for it.
//
// Upgraded: v1 kept a list of closures; here a pending settle is DATA (the
// reservation id and the entries), and `settle` is idempotent on the
// reservation, so replaying one that did land after all books nothing twice.
// A pending settle that can NEVER apply (its reservation was released, expired or is gone) is
// dropped from the queue, counted in `droppedWrites` and written to the chain as `spend.dropped`
// (usage-ledgers: count every dropped write); left queued it would poison every later settle.
//
// A pending settle that never lands - the process dies first - is the crash
// case, and the reservation stays `held` until its owner is lapsed, still
// counted at its estimate (core.ts).

export type Pending = { readonly cls: SpendClass; readonly id: string; readonly entries: readonly SettleEntry[] };

/** A settle that cannot apply because its reservation is closed or gone; retrying it cannot change that. */
export const unappliable = (e: AppError): boolean => e.code === "refused" || e.code === "not-found";

/** Drop a vendor's figure that can no longer be booked: counted and on the chain, never silent. */
export function dropPending(t: Tx, p: Pending, why: AppError): void {
  bump(t, p.cls.id, "droppedWrites", 1);
  append(t, {
    actor: { kind: "machine", id: `spend:${p.cls.id}` },
    type: "spend.dropped",
    subject: { kind: "reservation", id: p.id },
    data: { class: p.cls.id, unit: p.cls.unit, entries: p.entries.length, why: why.message },
  });
}

export type Settler = {
  /** Settle now, or keep it for the next transaction when the store is busy. */
  settle(cls: SpendClass, id: string, entries: readonly SettleEntry[]): Result<"applied" | "deferred">;
  /** Apply what is pending; resolves the count applied. */
  flush(): Result<number>;
  pending(): readonly Pending[];
};

export function createSettler(fx: Effects): Settler {
  let queue: Pending[] = [];

  /** The pending settles, then `extra`, in ONE transaction. */
  function run(extra: Pending | undefined): Result<number> {
    const taken = queue;
    const r = fx.tx("spend.settle", (t) => {
      for (const p of taken) {
        const s = settle(t, p.cls, { id: p.id, entries: p.entries });
        if (!s.ok) {
          if (!unappliable(s.error)) throw s.error;
          dropPending(t, p, s.error);
          continue;
        }
        if (!s.value.already) bump(t, p.cls.id, "lateWrites", 1);
      }
      if (extra !== undefined) {
        const s = settle(t, extra.cls, { id: extra.id, entries: extra.entries });
        if (!s.ok) throw s.error;
      }
      return taken.length;
    });
    if (r.ok) queue = queue.slice(taken.length);
    return r;
  }

  return {
    settle(cls, id, entries) {
      const r = run({ cls, id, entries });
      if (r.ok) return ok("applied");
      if (r.error.code !== "unavailable") return r;
      queue = [...queue, { cls, id, entries }];
      return ok("deferred");
    },
    flush: () => (queue.length === 0 ? ok(0) : run(undefined)),
    pending: () => queue,
  };
}

export type CallReport<T> = { readonly value: T; readonly entries: readonly SettleEntry[] };

/**
 * One paid call. The vendor is reached only after the reservation committed;
 * a refused or unavailable reservation returns before `call` runs. `call`
 * reports whether the vendor was reached: an unreached call releases its hold.
 * A `call` that THROWS leaves the hold held - the vendor may have been paid -
 * until its owner is lapsed (ledger.ts lapseOwner).
 */
export async function meteredCall<T>(
  fx: Effects,
  settler: Settler,
  cls: SpendClass,
  input: { readonly id: string; readonly amount: number; readonly owner: string; readonly vendor: string },
  call: () => Promise<{ readonly reached: boolean; readonly report: CallReport<T> }>,
): Promise<Result<{ readonly value: T; readonly reservation: Reservation; readonly settled: "applied" | "deferred" | "released" }>> {
  const held = fx.tx("spend.reserve", (t) => {
    const r = reserve(t, cls, { id: input.id, amount: input.amount, owner: input.owner });
    // Returned, not thrown: a refusal's counter and Event must commit.
    return r;
  });
  if (!held.ok) return held;
  if (!held.value.ok) return { ok: false, error: held.value.error };
  const reservation = held.value.value;
  const out = await fx.call(input.vendor, call);
  if (!out.reached) {
    const r = fx.tx("spend.release", (t) => release(t, cls, { id: input.id, by: input.owner }));
    if (!r.ok) return r;
    if (!r.value.ok) return r.value;
    return ok({ value: out.report.value, reservation, settled: "released" });
  }
  const s = settler.settle(cls, input.id, out.report.entries);
  if (!s.ok) return err(s.error.code, `spend: the vendor answered and its settle failed: ${s.error.message}`, { cause: s.error });
  return ok({ value: out.report.value, reservation, settled: s.value });
}

