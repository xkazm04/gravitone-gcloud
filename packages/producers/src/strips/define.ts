import { AppError, type Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { CallIntent } from "@gt/kernel/dryrun";
import { usd6, type Ending, type MissingStep, type Producer, type StepContext, type StepOutcome } from "@gt/kernel/job-core";
import { assertFence } from "@gt/kernel/lease";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { lintOutput, parseStep, planStrips, renderOutput, turnOutput, type CardStep, type RunView, type TurnKind } from "./plan.ts";

// THE STRIP RUN AS A JOB (Phase 4, L33). v1 (pipeline/strips/run.mts) was a script whose
// driver was its own process: an in-process pool of three card workers, two render slots,
// one shared Chromium, and NO holder - a run whose process died read `running` forever, and
// `--resume` paid again for every card that had not reached `rendered`. The job is the
// driver's record now and kernel/lease its lock; what v1 knew moves here or stays:
//
//   KEPT, HERE: the card loop (plan.ts), and what each turn's outcome means to the card and
//     to the job - classified at the boundary that still holds the seat's own outcome word
//     (retry-backoff: error-classification-for-retry):
//       completed        the page lands on the card; lint, render and the gates follow
//       timed-out|errored  the turn was PAID and failed: the card settles as v1 settled it
//                        (`author-failed` on round 0, the last good render after), and the
//                        job goes on - never a vendor failure, whose retry would buy it again
//       unavailable      the seat never served (no binary, no login) and reported no cost: a
//                        vendor failure, so the breaker stops a run whose seat is gone after
//                        three cards instead of marking all forty `author-failed`
//       seat-limit       the subscription's window is spent: a money stop, never the breaker's
//   KEPT, BEHIND A PORT: the workspace and the agent seam (lib/foundry/strips/author.ts), the
//     lint, the headless capture and its gates (pipeline/strips/render.mts), the supporting
//     image (the imaging router), and run.json as the artefact store, written after every step
//     for v1's readers (the Strips tab, the Ledger, the Board's packet).
//   UPGRADED: every turn is a declared paid call through the job's meter - the seat's own
//     report booked against job, step and card, a silent seat booked unpriced with its reason -
//     and a dry job is answered by stand-ins (a placeholder page, a placeholder image, a capture
//     that is not taken): one mechanism where v1's `--dry` only printed the card list.
//
// THE CEILING HOLDS INSIDE A TURN (cost-metering: one-pot-across-delegation). The kernel admits
// a turn against its $3.20 estimate; one turn has reported $13. So the writer's own
// `--max-budget-usd` is set to what the job has left, as lib/articles/loop.ts did for its runs.

/** What a seat turn's result must carry for the meter and the classification. */
export type TurnReport = { readonly outcome: string; readonly costUsd?: number; readonly errors: readonly string[] };

/** One turn as the would-call and the ledger row name it. */
export type TurnFacts = { readonly model: string; readonly effort: string; readonly promptChars: number };

/** What every port act is handed: whether the job is dry, and the fence asked before an artefact write. */
export type StepIO = { readonly dry: boolean; readonly stillHeld: () => void };

export type TurnStep = Extract<CardStep, { kind: TurnKind }>;
export type CardWork = Extract<CardStep, { kind: "lint" | "render" }>;

/** A served supporting image. A cost absent is unpriced, never free. */
export type AssetServed = { readonly file: string; readonly provider: string; readonly costUsd?: number };
export type AssetCall = { readonly payload: unknown; readonly live: () => Promise<AssetServed>; readonly stand: () => Promise<AssetServed> };

export type StripsPorts<I, R extends TurnReport> = {
  /** run.json and the cards' directories, synchronously: the plan is read inside the job's transaction. */
  load(runId: string): Result<RunView>;
  /** The card's isolated workspace for this turn, and the agent input that runs in it. Spends nothing. */
  prepare(runId: string, step: TurnStep, io: StepIO): Promise<I>;
  describe(input: I): TurnFacts;
  /** The turn on the operator's seat (lib/agent/cliSeam.ts `runAgent`). */
  live(input: I): Promise<R>;
  /** The dry stand-in: a placeholder page written where the seat would write one. */
  stand(input: I): Promise<R>;
  /** The same turn with its writer budget lowered to `usd`. */
  capped(input: I, usd: number): I;
  /** What the turn left, landed on the card (fenced): did it leave a page, did it change the one it was shown. */
  land(runId: string, step: TurnStep, input: I, result: R, io: StepIO): Promise<{ readonly ok: boolean; readonly changed: boolean }>;
  lint(runId: string, step: CardWork, io: StepIO): Promise<{ readonly ok: boolean; readonly findings: readonly string[] }>;
  /** The capture and its four gates; a dry job's capture is not taken. */
  render(runId: string, step: CardWork, io: StepIO): Promise<{ readonly ok: boolean; readonly pass: boolean; readonly error?: string }>;
  /** One supporting image through `call` (metered); a failure is the card's to live without (v1). */
  asset(runId: string, approach: string, call: (c: AssetCall) => Promise<AssetServed>, io: StepIO): Promise<EventData>;
  /** Every card settled: replica discrimination (live only) and the run handed to triage. */
  triage(runId: string, io: StepIO): Promise<EventData>;
  /** The job ended without its triage step (kernel `Producer.settle`): run.json told what the kernel decided. */
  settle(job: Job, ending: Ending): Promise<void>;
};

/** The strip run a job serves: a Run's id is the manifest's (`job:run:<runId>[~n]`). */
export const runIdOf = (job: Job): string => job.of.id;

const SEAT_NOTE = "a seat turn is priced by the seat's own report after it ends";
const IMAGE_NOTE = "a supporting image, admitted at the imaging router's pre-call estimate";

function must<T>(r: Result<T>): T {
  if (!r.ok) throw r.error;
  return r.value;
}

function stillHeld(ctx: StepContext): () => void {
  return () => {
    const { slot, lease } = ctx.job;
    if (slot === undefined || lease === undefined) throw new AppError("conflict", `job ${ctx.job.id} holds no slot; run.json is not written`);
    must(ctx.fx.tx("strips.fence", (t) => assertFence(t, slot, lease.fence)));
  };
}

const ioOf = (ctx: StepContext): StepIO => ({ dry: ctx.job.mode.kind === "dry", stillHeld: stillHeld(ctx) });

/** The seat's own report as a ledger row: its figure, or an unpriced row with the reason (usage-ledgers: failed calls are rows). */
export function seatEntry(r: TurnReport, step: TurnStep): SettleEntry {
  const axes = { producer: "strips", card: step.card, turn: step.kind };
  const outcome = r.outcome === "completed" ? "served" : "failed";
  return r.costUsd === undefined ? { amount: undefined, outcome, basis: "seat-report", axes, reason: "seat reported no cost" } : { amount: r.costUsd, outcome, basis: "seat-report", axes };
}

/** A supporting image's booking: the vendor's figure, or the estimate AND an unpriced count (v1 extract `book`). */
export function imageEntries(s: AssetServed, estimate: number, approach: string): SettleEntry[] {
  const axes = { producer: "strips", asset: approach, model: s.provider };
  if (typeof s.costUsd === "number" && Number.isFinite(s.costUsd) && s.costUsd > 0) return [{ amount: s.costUsd, outcome: "served", basis: "vendor", axes }];
  return [
    { amount: estimate, outcome: "served", basis: "estimate", axes },
    { amount: undefined, outcome: "served", basis: "estimate", axes, reason: `${s.provider} reported no cost for a supporting image; booked at its $${estimate} estimate` },
  ];
}

async function meteredTurn<I, R extends TurnReport>(ctx: StepContext, ports: StripsPorts<I, R>, raw: I, step: TurnStep): Promise<R> {
  const ceiling = ctx.job.ceilingUsd;
  const input = ceiling === undefined ? raw : ports.capped(raw, usd6(Math.max(0, ceiling - ctx.job.spend.usd)));
  const f = ports.describe(input);
  const intent: CallIntent<Promise<R>> = {
    provider: "claude-seat",
    model: f.model,
    usage: {},
    quote: { usd: null, basis: "unpriced", note: SEAT_NOTE },
    payload: { turn: `strip-${step.kind}`, card: step.card, round: step.round, model: f.model, effort: f.effort, promptChars: f.promptChars },
    subject: { kind: "job", id: ctx.job.id },
    stand: () => ports.stand(input),
  };
  const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
    const out = await ports.live(input);
    return { value: Promise.resolve(out), entries: [seatEntry(out, step)] };
  });
  return must(r);
}

async function meteredAsset(ctx: StepContext, approach: string, usd: number, c: AssetCall): Promise<AssetServed> {
  const intent: CallIntent<Promise<AssetServed>> = {
    provider: "imaging-router",
    model: "generate",
    usage: { image: 1 },
    quote: { usd, basis: "estimated", note: IMAGE_NOTE },
    estimate: { seconds: 30, usd },
    payload: c.payload,
    subject: { kind: "job", id: ctx.job.id },
    stand: c.stand,
  };
  const r = await ctx.meter.paid(JOB_USD, usd, intent, async () => {
    const served = await c.live();
    return { value: Promise.resolve(served), entries: imageEntries(served, usd, approach) };
  });
  return must(r);
}

/** A step that metered nothing cost nothing: said so, or the driver books its estimate (projection.ts). */
const free = (ctx: StepContext, output: EventData): StepOutcome => (ctx.meter.used() ? { kind: "produced", output } : { kind: "produced", output, costUsd: 0 });

async function performTurn<I, R extends TurnReport>(ports: StripsPorts<I, R>, runId: string, step: TurnStep, ctx: StepContext): Promise<StepOutcome> {
  const io = ioOf(ctx);
  const input = await ports.prepare(runId, step, io);
  const r = await meteredTurn(ctx, ports, input, step);
  const why = r.errors.join(" | ");
  if (r.outcome === "seat-limit") return { kind: "money-stop", message: `the text seat's usage window is spent (${step.name}): ${why || "seat limit"}` };
  if (r.outcome === "unavailable" && r.costUsd === undefined) return { kind: "vendor-failure", message: `the text seat did not serve ${step.name}: ${why || "unavailable"}` };
  const landed = await ports.land(runId, step, input, r, io);
  return free(ctx, turnOutput({ ok: landed.ok, changed: landed.changed, outcome: r.outcome }));
}

export function defineStrips<I, R extends TurnReport>(ports: StripsPorts<I, R>): Producer {
  return {
    // ONE LANE FOR A JOB THAT ALSO CAPTURES. The author, fix and review turns are the cost and
    // the wait (879 s and $3.19 a turn against 142 s of capture a round, strips-r1), and they
    // are the text seat's - so the job occupies a `seat.text` slot and captures inside its
    // step, as v1 did. A separate box.render job per capture would be the honest shape only
    // if captures queued behind other renders; today they do not, and a second job per round
    // would cost the run a queue wait between every turn and its own feedback.
    lane: "seat.text",
    plan(job, outputs) {
      return planStrips(must(ports.load(runIdOf(job))), outputs);
    },
    settle: (job, ending) => ports.settle(job, ending),
    async perform(step: MissingStep, ctx: StepContext): Promise<StepOutcome> {
      const runId = runIdOf(ctx.job);
      const s = parseStep(step.name);
      if (s === undefined) return { kind: "fatal", code: "internal", message: `strips: no step called ${step.name}` };
      if (ctx.outputs.has(step.name)) return { kind: "fatal", code: "internal", message: `${step.name} is booked on job ${ctx.job.id}; it is not performed again` };
      const io = ioOf(ctx);
      switch (s.kind) {
        case "author":
        case "fix":
        case "review":
          return performTurn(ports, runId, s, ctx);
        case "lint": {
          const l = await ports.lint(runId, s, io);
          return free(ctx, lintOutput(l.ok, l.findings));
        }
        case "render": {
          const r = await ports.render(runId, s, io);
          return free(ctx, renderOutput(r.ok, r.pass, r.error));
        }
        case "asset":
          return free(ctx, await ports.asset(runId, s.approach, (c) => meteredAsset(ctx, s.approach, step.estimate.usd ?? 0, c), io));
        case "triage":
          return free(ctx, await ports.triage(runId, io));
      }
    },
  };
}
