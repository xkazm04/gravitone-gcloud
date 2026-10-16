import { AppError } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import type { MissingStep, StepOutcome } from "../job-core.ts";
import { loadJob } from "../job.ts";
import type { Reader, Tx } from "../store.ts";
import { book } from "./ledger.ts";
import { JOB_USD } from "./meter.ts";

// THE JOB'S SPEND AS A PROJECTION OF THE METER (decision 7): what the driver
// books for a producer that does not meter, the job's totals read back from
// the rows, and the reconcile that says whether the record still agrees.
// Apart from meter.ts because it reads job records, which the step meter -
// imported by the job core for its StepContext - must not.

const usd6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/**
 * Book what a NON-METERING producer reported, on `job-usd` against the job and
 * step: a reported cost as a row; a produced step with no cost at its estimate
 * AND counted unpriced (v1 extract: "an unpriced call is booked at its estimate
 * and counted"); a credit-priced step as unpriced with its reason.
 */
export function chargeOutcome(t: Tx, job: Job, step: MissingStep, o: StepOutcome, owner: string): void {
  const axis = { jobId: job.id, step: step.name };
  const row = (amount: number, outcome: "served" | "failed", basis: string): void => book(t, JOB_USD, { amount, outcome, basis, axes: { producer: job.producer } }, owner, axis);
  const none = (reason: string): void => book(t, JOB_USD, { amount: undefined, outcome: "served", basis: "estimate", axes: { producer: job.producer }, reason }, owner, axis);
  if (o.kind === "vendor-failure" && o.costUsd !== undefined && o.costUsd > 0) row(o.costUsd, "failed", "vendor");
  if (o.kind !== "produced") return;
  if (o.costUsd !== undefined && o.costUsd > 0) return row(o.costUsd, "served", "vendor");
  if (o.costUsd === 0) return;
  if (step.credit !== undefined) return none(step.credit);
  const est = step.estimate.usd;
  if (est !== null && est > 0) row(est, "served", "estimate");
  none(est === null ? (step.estimate.unpricedReason ?? `${step.name} has no price`) : `${step.name} reported no cost; booked at its estimate`);
}

export type JobMeter = { readonly usd: number; readonly unpriced: number; readonly basis: "reported" | "estimate" };

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

/** The job's spend as the meter has it: settled and booked rows, and unpriced rows, by job id. */
export function meterOf(r: Reader, jobId: string): JobMeter {
  const usd = usd6(num(r.get("SELECT total(usd) AS v FROM spend_rows WHERE job_id = ?", jobId)?.["v"]));
  const noUsd = num(r.get("SELECT count(*) AS v FROM spend_rows WHERE job_id = ? AND usd IS NULL", jobId)?.["v"]);
  const unpriced = noUsd + num(r.get("SELECT count(*) AS v FROM spend_unpriced WHERE job_id = ?", jobId)?.["v"]);
  const estimated = num(r.get("SELECT count(*) AS v FROM spend_rows WHERE job_id = ? AND basis = 'estimate'", jobId)?.["v"]) > 0;
  return { usd, unpriced, basis: estimated || unpriced > 0 ? "estimate" : "reported" };
}

export type Reconciled = {
  readonly job: Job["spend"];
  readonly meter: JobMeter;
  /** Present exactly when the record and the meter disagree. */
  readonly drift?: { readonly usd: number; readonly unpriced: number };
};

/** The invariant of decision 7, as a function: the record's spend against the meter's. */
export function reconcileJobSpend(r: Reader, jobId: string): Reconciled {
  const { job } = loadJob(r, jobId);
  const meter = meterOf(r, jobId);
  const usd = usd6(job.spend.usd - meter.usd);
  const unpriced = job.spend.unpriced - meter.unpriced;
  if (usd === 0 && unpriced === 0) return { job: job.spend, meter };
  return { job: job.spend, meter, drift: { usd, unpriced } };
}

/** Throw if the record has drifted from its meter: a projection bug is a defect, not a reading. */
export function assertReconciled(r: Reader, jobId: string): void {
  const rec = reconcileJobSpend(r, jobId);
  if (rec.drift !== undefined) throw new AppError("internal", `job ${jobId}: spend drifted from the meter by $${rec.drift.usd} and ${rec.drift.unpriced} unpriced`);
}
