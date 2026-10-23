import { errorMessage, isAppError } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import { vendorHealth, type Health, type MissingStep, type Outputs, type Producer, type StepContext, type StepOutcome } from "@gt/kernel/job-core";
import { fenceLost } from "../mv/producer.ts";

// THE SUNO PRODUCER - one proposal's render on both models as one kernel job on
// `box.chrome`, the lane of the operator's Chrome profile that Suno is driven
// in over CDP.
//
// Absorbed from v1 lib/sound/suno/queue.ts:
//   ONE UNIT IS ONE MODEL'S CREATE (`create:v6`, `create:v6-wild`), in the
//   order v1 walked `job.models`; a create cannot be called back, so Stop is
//   honoured between models, never inside one (kernel pause: the step in flight
//   finishes and is booked).
//   RESUME SKIPS A MODEL THAT HAS CLIPS: the port asks suno.json, freshly, before
//   a create, so a create that landed its clips and died before the kernel
//   booked it is not paid for twice.
//   ENQUEUE NEVER SPENDS and CANCEL IS REFUSED WHILE A CREATE IS IN FLIGHT
//   ("rendering now"; its credits are spent) - both are the bound operator
//   acts' rules (lib/producers/suno.ts), not this definition's.
// Upgraded: v1 had an in-process singleton and NO cross-process lease - two
// processes on one store could drive the same Chrome tab. The kernel's fenced
// slot lease on box.chrome#1 is its first. And v1 switched the WHOLE queue off
// on a crash; box.chrome is a paid lane, so the kernel holds the lane instead
// (decision 6), naming the job and the model in flight - "check your Suno
// library before starting", which the operator acknowledges.
//
// CREDIT-PRICED, NEVER DOLLARS (decision 7): Suno bills subscription credits.
// Each create is admitted under a USD ceiling with the reason and booked
// unpriced with it - counted, never invented as a price.

export type SunoModelName = "v6" | "v6-wild";
export const SUNO_MODEL_NAMES: readonly SunoModelName[] = ["v6", "v6-wild"];

export type SunoPorts = {
  /** Before a create: the record marked running on this model. */
  create(job: Job, model: SunoModelName, ctx: StepContext): Promise<"made" | "skipped">;
  land(job: Job, ctx: StepContext): Promise<void>;
  /** The record (and its proposal) wear the failure, verbatim. */
  fail(job: Job, message: string, ctx: StepContext): Promise<void>;
  health?(job?: Job): Promise<Health>;
};

/** The catalog's words (packages/catalog partOptions SUNO_CREDITS). */
export const SUNO_CREDITS = "Suno bills subscription credits, not dollars; the driver reads the credits left, never a price";

/** v1 measured none; two clips of about two minutes each, rendered by Suno. */
const CREATE_SECONDS = 150;

export const createStep = (model: SunoModelName): string => `create:${model}`;
const modelOfStep = (name: string): SunoModelName | undefined => SUNO_MODEL_NAMES.find((m) => createStep(m) === name);

const LAND: MissingStep = { name: "land", estimate: { seconds: 1, usd: 0 } };

/** Both models in order, then `land`, minus what is booked. */
export function sunoPlan(outputs: Outputs): MissingStep[] {
  const creates: MissingStep[] = SUNO_MODEL_NAMES.map((m) => ({ name: createStep(m), estimate: { seconds: CREATE_SECONDS, usd: null, unpricedReason: SUNO_CREDITS }, credit: SUNO_CREDITS }));
  return [...creates, LAND].filter((s) => !outputs.has(s.name));
}

export function defineSuno(ports: SunoPorts): Producer {
  return {
    lane: "box.chrome",
    plan: (_job, outputs) => sunoPlan(outputs),
    async perform(step, ctx): Promise<StepOutcome> {
      try {
        if (step.name === "land") {
          await ports.land(ctx.job, ctx);
          return { kind: "produced", output: { landed: true }, costUsd: 0 };
        }
        const model = modelOfStep(step.name);
        if (model === undefined) return { kind: "fatal", code: "invalid", message: `suno: "${step.name}" is not a Suno step` };
        const r = await ports.create(ctx.job, model, ctx);
        return { kind: "produced", output: { model, made: r === "made" }, ...(r === "made" && ctx.meter.used() ? {} : { costUsd: 0 }) };
      } catch (e) {
        if (!(e instanceof Error) || fenceLost(e)) throw e;
        const message = e.message;
        const worn = await ports.fail(ctx.job, message, ctx).then(
          () => message,
          (w: unknown) => `${message} (and suno.json could not record it: ${errorMessage(w)})`,
        );
        if (isAppError(e) && e.code === "budget") return { kind: "money-stop", message: worn };
        return { kind: "fatal", code: isAppError(e) ? e.code : "internal", message: worn };
      }
    },
    ...(ports.health === undefined ? {} : { health: vendorHealth(ports.health) }),
  };
}
