import { AppError, isAppError, type Result } from "@gt/domain/errors";
import type { Job } from "@gt/domain/job";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { MissingStep, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { entriesOf, type Served } from "../extract/define.ts";
import { cycleOf, dojoGooglePlan, googleRepeats, type GenSpecView, type GoogleArmView, type GoogleEstimates } from "./plan.ts";

// A DOJO CYCLE ON THE GOOGLE STACK, AS A JOB (Phase 4, L34) - v1's pipeline/
// foundry/dojo-pairs-nb.mts, whose every call went through lib/imaging/router
// with a google steer (budget metering, provenance, reroute trail) but whose
// spend reached no ledger (scout §DOJO: "Google stack billed (no ledger write)").
//
//   KEPT: the walk (./plan.ts `dojoGooglePlan`), the google steer on both calls -
//     pixels AND eyes - so the local eye never touches a google cycle (purity), the
//     repeats in one call, the files and readbacks.json the gate surface reads.
//   UPGRADED: every call is metered against the job (`ctx.meter.paid`), so the
//     cycle's spend is the meter's and its ceiling is the job's; a dry job is
//     answered by stand-ins (placeholder PNGs, a stand-in readback) end to end.
//
// THE LOCAL STACK IS NOT DEFINED HERE. Its perform is Python's (pipeline/foundry/
// worker.py, on the card); its plan and receipt are ./plan.ts. This producer's lane
// is cloud.google, and kernel runJob refuses it a gpu.local job before anything is
// claimed ("a cloud.google producer may not run it").

const STAND_MODEL = "dry/stand-in";
/** A 1x1 PNG: what a dry generate "draws". A real file, so the gate surface's disk path runs whole. */
export const STAND_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

export type CycleView = { readonly spec: GenSpecView; readonly arms: readonly GoogleArmView[] };

export type DojoGooglePorts = {
  /** The cycle's spec and what is on disk, read synchronously: the plan runs inside the job's store transaction. */
  view(cycleId: string): Result<CycleView>;
  /** Pre-call estimates: the imaging layer's per-image figure and a readback's. */
  estimates(): GoogleEstimates;
  /** One router generate with the google steer: `count` images. A refusal for money throws AppError `budget`. */
  generate(req: { readonly prompt: string; readonly aspect: string; readonly count: number }): Promise<Served<readonly string[]>>;
  /** One router readback of a PNG with the google steer (v1: extract's readback instruction and schema). */
  recognize(req: { readonly base64: string }): Promise<Served<unknown>>;
  /** The arm's candidates as `pairs/<key>--r<i>.png`. */
  writeImages(cycleId: string, key: string, images: readonly string[]): Promise<void>;
  readImage(cycleId: string, file: string): Promise<string>;
  writeReadback(cycleId: string, key: string, entry: unknown): Promise<void>;
};

const cycleIdOf = (job: Job): string => cycleOf(job.of.id);

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

function stillHeld(ctx: StepContext): void {
  const { slot, lease } = ctx.job;
  if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; the cycle is not written`);
  must(ctx.fx.tx("dojo.fence", (t) => assertFence(t, slot, lease.fence)));
}

/** A thrown call, as the breaker and the ceiling read it: money is never a vendor failure (v1 extract breaker.ts). */
function failureOf(e: unknown): StepOutcome {
  if (isAppError(e) && e.code === "budget") return { kind: "money-stop", message: e.message };
  if (e instanceof Error) return { kind: "vendor-failure", message: e.message };
  throw e; // not an Error: a process death (the crash harness's sentinel), never a producer outcome
}

async function metered<T>(ctx: StepContext, kind: "generate" | "recognize", usd: number, payload: unknown, images: number, live: () => Promise<Served<T>>, stand: () => Served<T>): Promise<Served<T>> {
  const intent: CallIntent<Served<T>> = {
    provider: "imaging-router",
    model: kind,
    usage: kind === "generate" ? { image: images } : {},
    quote: { usd, basis: "estimated", note: `dojo ${kind} on the google stack: the pre-call estimate (lib/imaging/pricing estimatePerImage)` },
    estimate: { seconds: 0, usd },
    payload,
    subject: { kind: "job", id: ctx.job.id },
    stand,
  };
  const r = await ctx.meter.paid(JOB_USD, usd, intent, async () => {
    try {
      const served = await live();
      return { value: served, entries: entriesOf(served, kind, usd) };
    } catch (e) {
      // "Failures are spend" (cost-metering): a call that reached the provider and threw leaves a row with
      // its reason, so the breaker's retries are visible. A refusal for money never reached it (money-stop below).
      if (e instanceof Error && !(isAppError(e) && e.code === "budget")) {
        ctx.meter.book(JOB_USD, { amount: undefined, outcome: "failed", basis: "estimate", axes: { call: kind }, reason: `dojo ${kind} failed after the call was made: ${e.message}` });
      }
      throw e;
    }
  });
  if (!r.ok) throw r.error;
  return r.value;
}

function armOf(spec: GenSpecView, key: string): { readonly prompt: string } {
  const cut = key.lastIndexOf("--");
  const pair = (spec.pairs ?? []).find((p) => p.id === key.slice(0, cut));
  const arm = key.slice(cut + 2);
  const prompt = arm === "baseline" || arm === "challenger" ? pair?.[arm]?.prompt : undefined;
  if (typeof prompt !== "string" || prompt === "") throw new AppError("conflict", `the gen-spec has no prompt for ${key}; it changed under the job`);
  return { prompt };
}

export function defineDojoGoogle(ports: DojoGooglePorts): Producer {
  return {
    lane: "cloud.google",
    plan(job, outputs): MissingStep[] {
      const v = must(ports.view(cycleIdOf(job)));
      return dojoGooglePlan(v.arms, new Set(outputs.keys()), ports.estimates());
    },
    async perform(step, ctx) {
      const cycleId = cycleIdOf(ctx.job);
      const v = must(ports.view(cycleId));
      const est = ports.estimates();
      const [kind, key] = [step.name.slice(0, step.name.indexOf(":")), step.name.slice(step.name.indexOf(":") + 1)];
      if (kind === "generate") {
        const { prompt } = armOf(v.spec, key);
        const count = googleRepeats(v.spec);
        const aspect = typeof v.spec.aspect === "string" ? v.spec.aspect : "16:9";
        let served: Served<readonly string[]>;
        try {
          served = await metered(ctx, "generate", est.perImageUsd * count, { prompt, aspect, count, prefer: "google" }, count, () => ports.generate({ prompt, aspect, count }), () => ({ value: Array.from({ length: count }, () => STAND_PNG), model: STAND_MODEL, costUsd: 0 }));
        } catch (e) {
          return failureOf(e);
        }
        stillHeld(ctx);
        if (served.value.length !== count) {
          // Paid for and kept (v1's never-re-spend rule); a retry of the step would buy all `count` again, so a human decides.
          if (served.value.length > 0) await ports.writeImages(cycleId, key, served.value);
          return { kind: "fatal", code: "unavailable", message: `generate ${key}: ${served.model} returned ${served.value.length} of ${count} image(s)` };
        }
        await ports.writeImages(cycleId, key, served.value);
        return { kind: "produced", output: { key, images: count, model: served.model } };
      }
      if (kind === "readback") {
        const png = await ports.readImage(cycleId, `pairs/${key}.png`);
        let served: Served<unknown>;
        try {
          served = await metered(ctx, "recognize", est.readbackUsd, { key, bytes: png.length, prefer: "google" }, 0, () => ports.recognize({ base64: png }), () => ({ value: { look: "a dry stand-in: no vendor was called" }, model: STAND_MODEL, costUsd: 0 }));
        } catch (e) {
          return failureOf(e);
        }
        stillHeld(ctx);
        // v1's entry shape (dojo-pairs-nb.mts): the readback under `style`, and which eye read it.
        await ports.writeReadback(cycleId, key, { style: { readback: served.value }, eye: served.model, ...(ctx.job.mode.kind === "dry" ? { dry: true } : {}) });
        return { kind: "produced", output: { key, eye: served.model } };
      }
      return { kind: "fatal", code: "internal", message: `dojo has no step kind ${JSON.stringify(kind)} (${step.name})` };
    },
  };
}
