import { isAppError } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { StepContext, StepOutcome } from "@gt/kernel/job-core";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";

// ONE PAID CALL OF A PART ACT, THROUGH THE STEP'S METER - the mv producer's `metered` engines
// (lib/producers/mv.ts) said once for every studio step: the call is DECLARED (a dry job is
// answered by its stand-in and books a would-call, the vendor is never asked), and a live one is
// booked on the job with what the vendor reported - its dollars, or, when it reported none (a
// text seat, studio credits, a local model), an unpriced row WITH the sentence saying why
// (cost-metering: usage-ledgers - "a failed call still gets a row", "unpriced is not free").
//
// The v1 engines keep their own books as well (the text router's `bookServedTurn`, the imaging
// router's hold/settle, the music meter's seconds): those are the v1 period ceilings, which stay
// in force; this row is the JOB's attribution (spend-attribution: job id + step on every call).

export type PaidCall<T> = {
  readonly provider: string;
  /** The wire model, or the turn class when the router picks the model. */
  readonly model: string;
  /** The request as it would go on the wire (plain JSON): its digest makes two would-calls comparable. */
  readonly payload: unknown;
  /** The receipt's estimate for this call, carried onto the would-call. */
  readonly estimate?: Estimate;
  /** What a dry job continues with. */
  readonly stand: () => T;
  /** The live call; `usd` is what the vendor reported (absent = unpriced, with `unpriced` saying why). */
  readonly live: () => Promise<{ readonly value: T; readonly usd?: number; readonly unpriced?: string }>;
};

export async function meteredCall<T>(ctx: StepContext, c: PaidCall<T>): Promise<T> {
  const subject = { kind: "job", id: ctx.job.id };
  const usd = c.estimate?.usd;
  const quote: CallIntent<T>["quote"] =
    usd === undefined || usd === null ? { usd: null, basis: "unpriced", note: c.estimate?.unpricedReason ?? "priced after the call, from what the vendor reports" } : { usd, basis: "estimated", note: "the receipt's per-unit estimate" };
  const intent: CallIntent<T> = {
    provider: c.provider,
    model: c.model,
    usage: {},
    quote,
    ...(c.estimate === undefined ? {} : { estimate: c.estimate }),
    payload: c.payload,
    subject,
    stand: c.stand,
  };
  const axes = { producer: ctx.job.producer, provider: c.provider };
  const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
    const out = await c.live();
    const entry: SettleEntry =
      out.usd !== undefined && out.usd > 0
        ? { amount: out.usd, outcome: "served", basis: "vendor", axes }
        : { amount: undefined, outcome: "served", basis: "seat", axes, reason: out.unpriced ?? `${c.provider} reported no cost for ${c.model}` };
    return { value: out.value, entries: [entry] };
  });
  if (!r.ok) throw r.error;
  return r.value;
}

/** A thrown failure of a unit, classified: a money stop is never a breaker count, a vendor that
 *  may answer next time feeds the breaker, anything else is the job's sentence verbatim. */
export function failureOf(e: unknown, vendor: (e: Error) => "retry" | "fatal" | "money" | undefined = () => undefined): StepOutcome {
  if (!(e instanceof Error)) throw e;
  if (isAppError(e)) {
    if (e.code === "budget") return { kind: "money-stop", message: e.message };
    // A fence lost mid-unit is not the unit's failure: the job is the new holder's.
    if (e.code === "conflict" && (e.detail === "taken-over" || e.detail === "released" || e.detail === "expired")) throw e;
    return { kind: "fatal", code: e.code, message: e.message };
  }
  const v = vendor(e);
  if (v === "money") return { kind: "money-stop", message: e.message };
  if (v === "retry") return { kind: "vendor-failure", message: e.message };
  return { kind: "fatal", code: v === "fatal" ? "unavailable" : "internal", message: e.message };
}
