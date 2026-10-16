import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError } from "@gt/domain/errors";
import type { Estimate } from "@gt/domain/estimate";
import type { Job } from "@gt/domain/job";
import type { MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { isMvStep, STEP_ORDER, type MvStep } from "./plan.ts";

// THE MUSIC-VIDEO PRODUCER - one track's video as one kernel job on `box.render`.
//
// What v1 lib/sound/mv/queue.ts was, and where each part went:
//   the worker singleton (`globalThis.__gtMvWorker`), its pid lease (mv.json
//   `worker`) and `kickMvWorker`      -> the kernel lease on `box.render#1`, fenced:
//                                       two drivers cannot both hold the slot,
//                                       and a woken old driver writes nothing;
//   recover() on first start          -> kernel `recover` (startup-sweeps): the job
//                                       is `interrupted`, naming the step in flight;
//   `queue.running` / `interrupted`   -> per-job pause and interruption; the
//                                       column's Start/Stop act on the jobs;
//   `__setMvEngines`                  -> the job's MODE: every paid call is declared
//                                       through the meter with a stand-in, so a dry
//                                       job runs end to end and books would-calls.
// What is kept verbatim: the step order and the redo table (./plan.ts), the
// progress ledger, the never-re-spend check against a FRESH read, a still that
// lands whole or not at all (landFile), "ANY THROW fails the job with the
// engine's sentence VERBATIM", and the health pause before a bought still.
//
// ONE JOB, ONE LANE - and why the lane is `box.render`, not `box.chrome`. The
// render dominates the job (minutes of Chromium + ffmpeg per track); the catalog
// already names `mv` the render producer on box.render, and v1 ran the MV and
// Suno queues side by side (the studio's Chrome and Suno's are two profiles on
// two CDP ports). Putting the whole track on box.chrome would serialise every
// album render behind Suno, which v1 never did. What the free lane loses - a
// crash at the still does not HOLD it - the bound producer's health gives back:
// while an mv job sits interrupted at `still`, no mv job is claimed (v1's
// "a still may have been spent in the Leonardo studio - check it first").
//
// THE PLAN IS THE JOB'S FIRST OUTPUT. Step `plan` asks the v1 record what it
// still needs (planOf over mv.json and its progress ledger) and books the
// answer; every later plan() reads that booked list, so the steps of a job are
// fixed when it starts and a resume never re-derives them from a file that has
// moved on. The last step `land` writes the record's own `done`.

/** What the producer needs from the outside world; lib/producers/mv.ts binds it to v1's engines. */
export type MvPorts = {
  /** The v1 record's remaining steps (planOf over its progress ledger); marks the record running. */
  plan(job: Job, ctx: StepContext): Promise<{ readonly steps: readonly MvStep[]; readonly supplied: boolean }>;
  /**
   * One step against a fresh read of the record. `skipped` when the record
   * already holds the step's output - landed by a drive that died before the
   * kernel booked it - so it is never bought twice. Paid calls go through
   * `ctx.meter` (declared, with stand-ins).
   */
  step(job: Job, step: MvStep, ctx: StepContext): Promise<"made" | "skipped">;
  /** The record lands: done, its redo and progress ledger cleared. */
  land(job: Job, ctx: StepContext): Promise<void>;
  /** The record wears the failure, verbatim. */
  fail(job: Job, message: string, ctx: StepContext): Promise<void>;
  health?(): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
};

/** The catalog's words for a studio still (packages/catalog partOptions STUDIO_CREDITS). */
export const STUDIO_CREDITS = "Leonardo studio credits from the prepaid plan (71 for one still, read 2026-10-12); no USD per credit is checked";
/** A text turn: priced after the turn when the model reports it, never before. */
export const TEXT_TURN = "a text turn bills the operator's text seat or a model that reports its cost after the turn; nothing prices it before";

const free = (seconds: number): Estimate => ({ seconds, usd: 0 });
const credited = (seconds: number, why: string): Estimate => ({ seconds, usd: null, unpricedReason: why });

/** Illustrative pace per step (v1 measured none; the render dominates). */
const SECONDS: { readonly [S in MvStep]: number } = { fetch: 5, analyse: 20, treat: 30, motion: 30, still: 60, metadata: 30, video: 240 };
const TEXT_STEPS: ReadonlySet<MvStep> = new Set(["treat", "motion", "metadata"]);

/** One step as the kernel admits it: free work at $0, a bought still or a text turn credit-priced with its reason. */
export function mvStep(step: MvStep, supplied: boolean): MissingStep {
  if (step === "still" && !supplied) return { name: step, estimate: credited(SECONDS.still, STUDIO_CREDITS), credit: STUDIO_CREDITS };
  if (TEXT_STEPS.has(step)) return { name: step, estimate: credited(SECONDS[step], TEXT_TURN), credit: TEXT_TURN };
  return { name: step, estimate: free(step === "still" ? 1 : SECONDS[step]) };
}

const PLAN: MissingStep = { name: "plan", estimate: free(1) };
const LAND: MissingStep = { name: "land", estimate: free(1) };

const plannedSchema = z.object({ steps: z.array(z.enum(STEP_ORDER as readonly [MvStep, ...MvStep[]])), supplied: z.boolean() });

function planned(outputs: Outputs): { steps: readonly MvStep[]; supplied: boolean } | undefined {
  const booked = outputs.get("plan");
  if (booked === undefined) return undefined;
  const p = parseAt("mv plan output", plannedSchema, booked.value);
  if (!p.ok) throw p.error;
  return p.value;
}

/** The pure plan: `plan` first; then the booked step list and `land`, minus what is booked. */
export function mvPlan(outputs: Outputs): MissingStep[] {
  const p = planned(outputs);
  if (p === undefined) return [PLAN];
  return [...p.steps.map((s) => mvStep(s, p.supplied)), LAND].filter((s) => !outputs.has(s.name));
}

/**
 * The kernel's fence refused a write (lease.ts assertFence): this driver was
 * taken over. Nothing of it may land - not the kernel booking, which the
 * driver's own fence check refuses, and not the artefact store either, so the
 * failure is not written to the record; it passes up and the job is the new
 * holder's.
 */
export const fenceLost = (e: unknown): boolean => e instanceof AppError && e.code === "conflict" && (e.detail === "taken-over" || e.detail === "released" || e.detail === "expired");

export function defineMv(ports: MvPorts): Producer {
  const fail = async (e: Error, ctx: StepContext): Promise<StepOutcome> => {
    if (fenceLost(e)) throw e;
    const message = e.message;
    // The record wears the sentence; a record that cannot be written is said
    // in the same sentence rather than swallowed.
    const worn = await ports.fail(ctx.job, message, ctx).then(
      () => message,
      (w: unknown) => `${message} (and mv.json could not record it: ${w instanceof Error ? w.message : String(w)})`,
    );
    if (e instanceof AppError && e.code === "budget") return { kind: "money-stop", message: worn };
    return { kind: "fatal", code: e instanceof AppError ? e.code : "internal", message: worn };
  };
  return {
    lane: "box.render",
    plan: (_job, outputs) => mvPlan(outputs),
    async perform(step, ctx): Promise<StepOutcome> {
      try {
        if (step.name === "plan") {
          const p = await ports.plan(ctx.job, ctx);
          return { kind: "produced", output: { steps: [...p.steps], supplied: p.supplied }, costUsd: 0 };
        }
        if (step.name === "land") {
          await ports.land(ctx.job, ctx);
          return { kind: "produced", output: { landed: true }, costUsd: 0 };
        }
        if (!isMvStep(step.name)) return { kind: "fatal", code: "invalid", message: `mv: "${step.name}" is not a music-video step` };
        const r = await ports.step(ctx.job, step.name, ctx);
        const made = r === "made";
        // Free work, a supplied picture, the operator's own prompt and a skipped
        // step cost nothing; a step that called a vendor costs what the port
        // booked on the meter, and the driver reads the meter, not this outcome.
        return { kind: "produced", output: { step: step.name, made }, ...(made && ctx.meter.used() ? {} : { costUsd: 0 }) };
      } catch (e) {
        // A process death (the crash harness's sentinel) is not an Error and is not ours to record.
        if (!(e instanceof Error)) throw e;
        return fail(e, ctx);
      }
    },
    ...(ports.health === undefined ? {} : { health: ports.health }),
  };
}
