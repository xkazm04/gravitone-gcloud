import { err, ok, type Result } from "@gt/domain/errors";
import { defineMachine } from "@gt/domain/transitions";

// THE SPEND CORE - pure: what a class is, what a reservation may become, and
// whether a reservation fits under its ceiling.
//
// The rules are lib/spend/meter.ts's, kept (plan §3.2: "keep as-is"):
//   - RESERVE BEFORE SPENDING. A hold counts against the ceiling until it is
//     settled or released, so N concurrent calls cannot each pass against the
//     same un-updated total; the call that would cross is refused before any
//     vendor is touched, and the refusal is COUNTED.
//   - SETTLE REPLACES THE HOLD WITH WHAT HAPPENED, served or failed.
//   - UNPRICED IS NOT FREE: a figure that is absent, zero, negative or not
//     finite books nothing and is counted, so a total reads as the lower bound
//     it is.
//   - A reservation is a finite, non-negative number: `reserve(NaN)` once made
//     `spent + held + x > ceiling` false for every call beside it.
//   - A count-only class (v1 `text-usd`, operator 2026-10-07 "count only,
//     refuse nothing") has NO ceiling, not a large one; reserving against it
//     is a programming error, refused rather than admitted.
//   - `0` is a ceiling meaning "spend nothing", never "disabled".
//
// ONE RULE IS UPGRADED, and it is the crash rule. v1's file store reclaimed a
// hold whose owner died after a TTL and NEVER booked it ("a hold is an
// estimate, not a bill"), so the window fell by money that may well have left
// the account: the process died after the vendor answered and before settle.
// Here such a reservation LAPSES: it keeps counting at its estimate, aged by
// the window from the moment it lapsed, until a late settle replaces it with
// what the vendor reported or an operator releases it. The period total never
// under-counts money that may have been spent (cost-metering: usage-ledgers,
// "failures are spend"; reversible-debit-and-settle, the handle that outlives
// its process). v1's drop survives only in the v1 port (v1Port.ts), whose job
// is to behave exactly as v1 did.

/** One metered balance (lib/spend/classes.ts SpendClassDef, minus the env:
 *  reading ceilings from the environment per call is the app's, not the kernel's). */
export type SpendClass = {
  readonly id: string;
  /** `audio-s`: seconds of audio requested (v1 `music-audio-s`). */
  readonly unit: "usd" | "audio-s";
  /** The rolling window the ceiling is measured over: the domain's "period". */
  readonly windowMs: number;
  /** Per window, in `unit`; `null` is count-only. */
  readonly ceiling: number | null;
};

export function checkClass(c: SpendClass): Result<SpendClass> {
  if (!/^[a-z][a-z0-9-]*$/.test(c.id)) return err("invalid", `spend: class id "${c.id}" is not kebab-case`);
  if (!(Number.isFinite(c.windowMs) && c.windowMs > 0)) return err("invalid", `spend: class ${c.id} has no usable window (${c.windowMs})`);
  if (c.ceiling !== null && !(Number.isFinite(c.ceiling) && c.ceiling >= 0)) return err("invalid", `spend: class ${c.id} ceiling ${c.ceiling} is not a finite, non-negative number`);
  return ok(c);
}

/**
 * held -> settled    the call reported (served or failed)
 * held -> released   the call never reached the vendor
 * held -> lapsed     the owner is gone with the outcome unknown
 * lapsed -> settled  the late report arrived (deferred finalization)
 * lapsed -> released an operator established nothing was spent
 * expired            v1's reclaim, written only by the v1 port; terminal
 */
export const reservationMachine = defineMachine({
  held: ["settled", "released", "lapsed", "expired"],
  lapsed: ["settled", "released"],
  settled: [],
  released: [],
  expired: [],
});
export type ReservationState = (typeof reservationMachine.states)[number];

export const priced = (n: number | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

export type Totals = {
  /** Booked rows inside the window. */
  readonly spent: number;
  /** Live holds. */
  readonly held: number;
  /** Lapsed reservations inside the window, at their estimate. */
  readonly lapsed: number;
};

export type Refusal = Totals & {
  readonly amount: number;
  readonly ceiling: number;
  readonly windowMs: number;
  /** The refusal count INCLUDING this one. */
  readonly refusals: number;
  /** The domain's `stop.by` word for this ceiling. */
  readonly scope: "period-ceiling";
};

/** The ceiling's verdict. `held` and `lapsed` count exactly as booked spend does. */
export function admits(cls: SpendClass, totals: Totals, amount: number): Result<{ readonly fits: boolean; readonly ceiling: number }> {
  if (cls.ceiling === null) return err("refused", `spend: class ${cls.id} is count-only: it has no ceiling and cannot be reserved against`);
  if (!(Number.isFinite(amount) && amount >= 0)) return err("invalid", `spend: a reservation is a finite, non-negative amount, not ${amount}`);
  return ok({ fits: totals.spent + totals.held + totals.lapsed + amount <= cls.ceiling, ceiling: cls.ceiling });
}

/** The sentence a refusal carries; the numbers are on the refusal itself. */
export function refusalSentence(cls: SpendClass, r: Refusal): string {
  const u = cls.unit === "usd" ? "$" : "";
  const s = cls.unit === "usd" ? "" : " s";
  const f = (n: number): string => `${u}${Number(n.toFixed(6))}${s}`;
  return `spend: ${cls.id} refused ${f(r.amount)}: ${f(r.spent)} spent + ${f(r.held)} held + ${f(r.lapsed)} lapsed would pass the ${f(r.ceiling)} ceiling per ${r.windowMs} ms. Refused before any vendor was called; nothing was spent.`;
}
