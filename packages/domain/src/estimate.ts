import { z } from "zod";

// WHAT A PIECE OF WORK WILL COST, SHOWN BEFORE LAUNCH (plan §2.2, the Floor's
// composers and the Plan table).
//
// MONEY IS A FINITE, NON-NEGATIVE NUMBER OF US DOLLARS, not integer
// micro-dollars. lib/spend/meter.ts is the precedent and it is right for this
// record: every figure that reaches an estimate is either a vendor's own float
// (Leonardo's reported cost) or a table rate times units
// (lib/imaging/pricing.ts), the ledger's Event carries `cost.usd` as a number,
// and v1's per-run arithmetic rounds to six places at the point of booking
// (lib/foundry/extract/spend.ts `usd6`), not at the record. A second unit at
// this layer would be a conversion at every door with nothing gained. What the
// meter did learn the hard way is kept: `reserve(NaN)` once switched the
// ceiling off for every call in flight beside it, so NaN and Infinity are
// refused here, at the record, before any arithmetic can see them.

/** USD. Finite and non-negative; zod 4 refuses NaN and ±Infinity for any number. */
export const usdSchema = z.number().nonnegative();

/**
 * `usd: null` is "unpriced", and it is a real state: v1's pricing law
 * (lib/imaging/pricing.ts, "never invent a price") is that a call either
 * carries a figure or carries the reason there is none. A null without a
 * reason reads as "free" on every screen that sums it; a figure WITH a reason
 * is two stories about one call. So exactly one of the two is present.
 *
 * `usdRange` is the honest form of a figure that is only known as a band — the
 * article pipeline's "$47–92 per run" (prototype studio.js CATALOG.article).
 * The point figure inside it is what sums; the band is what the composer shows.
 */
export const estimateSchema = z
  .object({
    seconds: z.number().nonnegative(),
    usd: usdSchema.nullable(),
    unpricedReason: z.string().trim().min(1).optional(),
    usdRange: z.tuple([usdSchema, usdSchema]).optional(),
  })
  .superRefine((e, ctx) => {
    if (e.usd === null && e.unpricedReason === undefined)
      ctx.addIssue({ code: "custom", path: ["unpricedReason"], message: "an unpriced estimate names why it has no price" });
    if (e.usd !== null && e.unpricedReason !== undefined)
      ctx.addIssue({ code: "custom", path: ["unpricedReason"], message: "a priced estimate carries no unpriced reason" });
    if (e.usdRange !== undefined) {
      const [lo, hi] = e.usdRange;
      if (e.usd === null) ctx.addIssue({ code: "custom", path: ["usdRange"], message: "a price band needs the point figure it sums as" });
      else if (!(lo <= e.usd && e.usd <= hi))
        ctx.addIssue({ code: "custom", path: ["usdRange"], message: `the band [${lo}, ${hi}] does not hold its point figure ${e.usd}` });
    }
  });
export type Estimate = z.output<typeof estimateSchema>;
