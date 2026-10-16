import { AppError, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { CallIntent } from "@gt/kernel/dryrun";
import type { MissingStep, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { next, stepName, unitEstimate, unitLabel, type CallEstimates, type CallKind, type ManifestView, type Unit } from "./units.ts";

// THE STYLE EXTRACTOR AS A JOB (Phase 4, L29). v1 (lib/foundry/extract/) was a
// step machine whose driver was whoever called it - a browser pumping /step, or
// the CLI looping `runToEnd` - with a manifest lease (`m.lease`, six minutes, no
// fence) and an in-process promise chain deciding who may step. The job is now the
// driver's record and kernel/lease its lock; what v1 knew moves here or stays:
//
//   KEPT, HERE: the unit order (`next`, units.ts), the step's estimate the ceiling
//     is checked against before the unit starts (kernel job-core `next`, v1
//     perform.ts), and the classification of what a unit did - a served unit, a
//     vendor failure (the breaker's count), a MONEY stop (never the breaker's: v1
//     breaker.ts tells why), a finish with nothing readable.
//   KEPT, BEHIND A PORT: the unit itself (v1 `step` and its per-kind perform
//     files), the manifest as the artefact store, rewritten after every unit for
//     v1's readers (§5.4).
//   UPGRADED: every vendor call is metered against the job (`meteredCall`), and a
//     dry job is answered by stand-ins - one mechanism for v1's `--dry` estimate
//     print and the probes' `__setExtractIO`.
//
// THE PLAN IS THE MANIFEST. v1 never-re-spend lives in the manifest: a round
// whose image exists but whose critique failed is KEPT (pruneFailures keeps any
// round with a file), so `next` moves past it. The plan therefore reads run.json
// and names one unit - the next - rather than projecting the rest from outputs:
// which units follow depends on what a unit produced (grouping makes the styles,
// a critique's score settles a loop). A unit booked on the job but absent from
// the manifest is refused, never performed twice.

/** A served call (v1 engine.ts `Served`): a cost absent is UNPRICED, never free. */
export type Served<T> = { readonly value: T; readonly model: string; readonly costUsd?: number | undefined; readonly basis?: "vendor-reported" | "estimated" | "unpriced" | undefined };

/** One vendor call a unit makes, declared before it is made. */
export type VendorCall<T> = {
  readonly kind: CallKind;
  /** The request as plain JSON - its digest makes two would-calls comparable. Never the image bytes. */
  readonly payload: unknown;
  readonly live: () => Promise<Served<T>>;
  /** What a dry job continues with. It costs nothing (`costUsd: 0`), so v1's manifest books $0 for it. */
  readonly stand: () => Served<T>;
};

export type StepIO = {
  readonly call: <T>(c: VendorCall<T>) => Promise<Served<T>>;
  /** The job's breaker count; v1's own (`tripped`, `m.fail_streak`) is seeded with it so both trip at once. */
  readonly streak: number;
  /** Throws when this drive no longer holds its slot: asked before every manifest write. */
  readonly stillHeld: () => void;
  readonly dry: boolean;
};

export type ExtractPorts = {
  /** run.json, synchronously: the plan is read inside the job's store transaction. */
  load(runId: string): Result<ManifestView>;
  /** Pre-call estimates per call kind for this run's IO (v1 `estimateUsd`, else DEFAULT_CALL_ESTIMATE_USD). */
  estimates(runId: string): CallEstimates;
  /** v1 `step` on run.json, which must take exactly `unit`; the manifest as saved. */
  step(runId: string, unit: Unit, io: StepIO): Promise<ManifestView>;
  /** A retried job's first act on a failed run: v1 `pruneFailures`, and the run back in a live stage. */
  revive(runId: string, io: Pick<StepIO, "stillHeld">): Promise<ManifestView>;
  /** How many transfer scenes exist (v1 prompts.ts TRANSFER_SCENES). */
  readonly scenes: number;
};

/** The extract run a job serves: a Run's id is the manifest's (`job:run:<manifestId>`). */
export const runIdOf = (job: Job): string => job.of.id;

const REVIVE = "revive:a";
const HALT = "halt:a";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

/**
 * What a performed unit did, read off the manifest before and after it (pure).
 * v1 records a unit's failure ON its element and moves on, so the element says
 * which of the four it was.
 */
export function classify(before: ManifestView, after: ManifestView, unit: Unit): StepOutcome {
  if (after.stopped !== undefined && after.stopped.at !== before.stopped?.at) {
    return { kind: "money-stop", message: after.error ?? `the spend window refused ${unitLabel(unit)}` };
  }
  const fail = (message: string): StepOutcome => ({ kind: "vendor-failure", message });
  const made = (output: EventData): StepOutcome => ({ kind: "produced", output });
  switch (unit.kind) {
    case "read": {
      const s = after.sources.find((x) => x.id === unit.source);
      if (s?.readback) return made({ source: unit.source });
      return fail(`${unitLabel(unit)}: ${s?.error ?? "no readback was recorded"}`);
    }
    case "group":
      return made({ styles: after.styles.map((s) => s.id) });
    case "replica": {
      const round = after.styles.find((s) => s.id === unit.style)?.replicas.find((r) => r.source === unit.source)?.rounds[unit.round - 1];
      if (round === undefined) return { kind: "fatal", code: "internal", message: `${unitLabel(unit)} left no round on run.json` };
      // An image with a failed critique is a vendor failure for the breaker, and the
      // pixels stay on the manifest: the next plan moves past the round, never re-draws it.
      if (round.error) return fail(`${unitLabel(unit)}: ${round.error}`);
      return made({ style: unit.style, source: unit.source, round: unit.round, file: round.file, score: round.score });
    }
    case "transfer": {
      const t = after.styles.find((s) => s.id === unit.style)?.transfers.find((x) => x.scene === unit.scene);
      if (t === undefined) return { kind: "fatal", code: "internal", message: `${unitLabel(unit)} left no transfer on run.json` };
      if (t.error) return fail(`${unitLabel(unit)}: ${t.error}`);
      return made({ style: unit.style, scene: unit.scene, file: t.file });
    }
    case "finish":
      if (after.status === "done") return made({ status: "done", styles: after.styles.length });
      return { kind: "fatal", code: "unavailable", message: after.error ?? "No source could be read back." };
  }
}

/** What one served call books on the job: its figure, or its estimate AND an unpriced count (v1 spend.ts `book`). */
export function entriesOf(s: Served<unknown>, kind: CallKind, estimate: number): SettleEntry[] {
  const axes = { call: kind, model: s.model };
  const cost = s.costUsd;
  if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) {
    // A zero from a vendor is a missing figure, never a free call (kernel pricing/quote.ts).
    if (cost === 0) return [{ amount: undefined, outcome: "served", basis: "vendor", axes, reason: `${s.model} reported $0 for a ${kind}` }];
    return [{ amount: cost, outcome: "served", basis: s.basis === "estimated" ? "estimate" : "vendor", axes }];
  }
  return [
    { amount: estimate, outcome: "served", basis: "estimate", axes },
    { amount: undefined, outcome: "served", basis: "estimate", axes, reason: `${s.model} reported no cost for a ${kind}; booked at its $${estimate} estimate` },
  ];
}

/**
 * One vendor call through the job's meter (decision 7). The class is the
 * count-only `job-usd`: v1's routers keep their own period windows (the imaging
 * meter's $5/hour), whose `over-budget` refusal v1 already turns into a money
 * stop; the job meter is what the job's ceiling and its spend projection read.
 */
async function meteredCall<T>(ctx: StepContext, c: VendorCall<T>, est: CallEstimates): Promise<Served<T>> {
  const usd = est[c.kind];
  const intent: CallIntent<Served<T>> = {
    provider: c.kind === "reason" ? "text-router" : "imaging-router",
    model: c.kind,
    usage: c.kind === "generate" ? { image: 1 } : {},
    quote: { usd, basis: "estimated", note: `extract ${c.kind}: the pre-call estimate a unit is admitted on (lib/foundry/extract)` },
    estimate: { seconds: 0, usd },
    payload: c.payload,
    subject: { kind: "job", id: ctx.job.id },
    stand: c.stand,
  };
  const r = await ctx.meter.paid(JOB_USD, usd, intent, async () => {
    const served = await c.live();
    return { value: served, entries: entriesOf(served, c.kind, usd) };
  });
  if (!r.ok) throw r.error;
  return r.value;
}

function stillHeld(ctx: StepContext): () => void {
  return () => {
    const { slot, lease } = ctx.job;
    if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; run.json is not written`);
    must(ctx.fx.tx("extract.fence", (t) => assertFence(t, slot, lease.fence)));
  };
}

const ioOf = (ctx: StepContext, est: CallEstimates): StepIO => ({
  call: (c) => meteredCall(ctx, c, est),
  streak: ctx.job.failStreak,
  stillHeld: stillHeld(ctx),
  dry: ctx.job.mode.kind === "dry",
});

/** The missing steps: the next unit of the run, or what a failed run needs first. */
export function planOf(job: Job, booked: ReadonlySet<string>, m: ManifestView, est: CallEstimates, scenes: number): MissingStep[] {
  if (m.status === "failed") {
    // A retry is the operator's claim the cause was fixed (v1 CLI `--resume`):
    // the attempt's first step revives the run; a run failed again in the same
    // attempt halts with its own sentence rather than reading as done.
    const revive = `${REVIVE}${job.attempt}`;
    if (!booked.has(revive)) return [{ name: revive, estimate: { seconds: 0, usd: 0 } }];
    return [{ name: `${HALT}${job.attempt}`, estimate: { seconds: 0, usd: 0 } }];
  }
  const u = next(m, scenes);
  if (u === null) return [];
  return [{ name: stepName(u), estimate: unitEstimate(u, m.options.grouping, est) }];
}

export function defineExtract(ports: ExtractPorts): Producer {
  return {
    // ONE LANE FOR A JOB THAT CALLS TWO KINDS OF VENDOR. A unit's pixels are the
    // cost and the wait (a generate is ~$0.04 and up to 180 s; a readback or the
    // one synthesis turn is a cent and seconds), and they are Nano Banana's - so
    // the job occupies a `cloud.google` slot, and its text turn routes inside
    // `perform` through the text router as v1 did. Dev eyes on cloud.qwen do not
    // move the job: the lane is where the expensive half waits.
    lane: "cloud.google",
    plan(job, outputs) {
      const m = must(ports.load(runIdOf(job)));
      return planOf(job, new Set(outputs.keys()), m, ports.estimates(runIdOf(job)), ports.scenes);
    },
    async perform(step, ctx) {
      const runId = runIdOf(ctx.job);
      const io = ioOf(ctx, ports.estimates(runId));
      if (step.name.startsWith(REVIVE)) {
        const m = await ports.revive(runId, io);
        return { kind: "produced", output: { status: m.status }, costUsd: 0 };
      }
      const before = must(ports.load(runId));
      if (step.name.startsWith(HALT)) return { kind: "fatal", code: "unavailable", message: before.error ?? `extract run ${runId} failed again after its retry` };
      const unit = next(before, ports.scenes);
      if (unit === null || stepName(unit) !== step.name) {
        return { kind: "fatal", code: "conflict", message: `extract run ${runId} moved under job ${ctx.job.id}: it planned ${step.name}, run.json now says ${unit === null ? "nothing is left" : stepName(unit)}` };
      }
      if (ctx.outputs.has(step.name)) {
        return { kind: "fatal", code: "internal", message: `${step.name} is booked on job ${ctx.job.id} but run.json does not show it; it is not performed again` };
      }
      const after = await ports.step(runId, unit, io);
      const o = classify(before, after, unit);
      // A unit that made no vendor call (a finish; a group with grouping "none")
      // cost nothing - said so, or the driver would book it unpriced at its $0 estimate.
      return o.kind === "produced" && !ctx.meter.used() ? { ...o, costUsd: 0 } : o;
    },
  };
}
