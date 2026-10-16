import type { AppErrorCode, Result } from "@gt/domain/errors";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import { paid, type CallIntent } from "@gt/kernel/dryrun";
import { usd6, type MissingStep, type Producer, type StepContext, type StepOutcome } from "@gt/kernel/job-core";
import type { SettleEntry } from "@gt/kernel/spend/ledger";
import { JOB_USD } from "@gt/kernel/spend/meter";
import { isWorkStep, parseArticleJob, planArticle, type WorkStep } from "./plan.ts";

// THE ARTICLE PRODUCER - lib/articles' drive moved onto kernel/job (Phase 4, L30). The
// engine's steps stay where they are (behind `ports.step`, bound to lib/articles/drive.ts
// `walk` by lib/producers/article.ts); what moves here is the RUNNER: which step is next,
// what a step's outcome means to the job, and how every agent turn inside a step is paid.
//
// EVERY TURN IS A DECLARED PAID CALL (decision 4, decision 7). A step is not one vendor
// call: the critique alone is 8 to 26 agent turns across four engines. So the meter does
// not wrap the step, it wraps the TURN - `turn` is what the step's writer and reviewer
// calls go through. Each turn is `ctx.meter.paid` on the count-only job class:
//   live  the seat runs, and its self-reported cost is booked against job, step and turn
//         (cost-metering: usage-ledgers - "failed calls are rows", with the outcome); a
//         turn whose engine reports nothing (codex, agy) is an UNPRICED row with the
//         reason "seat reported no cost", counted and never invented as dollars;
//   dry   the kernel's dry port answers with the stand-in (the stub agent, the same argv)
//         and books a would-call; the seat is never entered, whatever the environment.
// v1 kept the step's cost as a sum on run.json (`steps[].costUsd`), which stays for its
// readers; the job's spend is the meter's projection of the turn rows.
//
// THE CEILING HOLDS INSIDE A STEP (cost-metering: one-pot-across-delegation). The kernel
// admits a step against its estimate; a critique admitted at $54 can still run long. So a
// turn is refused before it starts once the job's spend plus this step's reported turns
// reach the ceiling, and a writer turn is capped (`--max-budget-usd`) at what is left -
// lib/articles/loop.ts `guardedDeps` did exactly this for the loop's runs, and every job
// gets it now. A refused turn fails the step the engine's way; the job stops for money.
//
// A FAILED STEP FAILS THE JOB (v1: the run went `failed` and waited for a human resume).
// No breaker retries it: an agent turn that failed already spent, and v1 never re-spent
// on its own. The operator's retry is v1's resume - the walk takes the run back to the
// step that did not finish.
//
// LANDING IS OUTWARD, NOT PAID: a branch pushed to the registry and a PR opened. It is a
// declared call all the same (`paid` through `ctx.fx`), so a dry landing job books a
// would-call and pushes nothing - and it is never metered, because it costs nothing.

/** What the engine's turn result must carry for the meter. */
export type TurnReport = { readonly outcome: string; readonly costUsd?: number };

/** One turn, as the would-call and the ledger row name it. */
export type TurnFacts = { readonly engine: string; readonly model: string; readonly effort: string; readonly turn: string; readonly promptChars: number };

/** How a step's walk ended, in the engine's words. */
export type StepReport = { readonly ok: true; readonly status: string; readonly skipped: boolean } | { readonly ok: false; readonly message: string };

export type ArticlePorts<I, R extends TurnReport> = {
  describe(input: I): TurnFacts;
  /** The turn on the operator's seat (lib/agent/cliSeam.ts). */
  live(input: I): Promise<R>;
  /** The dry stand-in: the stub agent with the seam's argv (lib/articles/dryAgent.ts). */
  stand(input: I): Promise<R>;
  /** A turn refused before it started, in the engine's own result shape. */
  refused(input: I, reason: string): R;
  /** The same turn with its writer budget lowered to `usd` (a reviewer ignores it). */
  capped(input: I, usd: number): I;
  /** The Run's article manifest exists (created from the Run's input when it does not). */
  ensureRun(job: Job): Promise<Result<{ readonly runId: string; readonly created: boolean }>>;
  /** Walk the run until `name` has finished, with every agent turn through `turn`. */
  step(runId: string, name: WorkStep, turn: (input: I) => Promise<R>): Promise<StepReport>;
  /** The landing, live: the registry write-back. */
  land(runId: string): Promise<StepReport>;
  /** Who the landing pushes to, for its declared intent. */
  registry(): string;
};

const SEAT_NOTE = "a seat turn is priced by the seat's own report after it ends";

function entryOf(r: TurnReport, f: TurnFacts): SettleEntry {
  const axes = { producer: "article", engine: f.engine, turn: f.turn };
  const outcome = r.outcome === "completed" ? "served" : "failed";
  return r.costUsd === undefined ? { amount: undefined, outcome, basis: "seat-report", axes, reason: "seat reported no cost" } : { amount: r.costUsd, outcome, basis: "seat-report", axes };
}

type Turns<I, R> = { readonly turn: (input: I) => Promise<R>; readonly tripped: () => string | undefined; readonly used: () => number };

/** The step's turn function: ceiling first, then the declared, metered call. */
export function meteredTurns<I, R extends TurnReport>(ctx: StepContext, ports: ArticlePorts<I, R>): Turns<I, R> {
  let stepUsd = 0;
  let count = 0;
  let trip: string | undefined;
  const ceiling = ctx.job.ceilingUsd;
  const turn = async (raw: I): Promise<R> => {
    const spent = usd6(ctx.job.spend.usd + stepUsd);
    if (ceiling !== undefined && spent >= ceiling) {
      trip ??= `run-ceiling: reported cost $${spent.toFixed(2)} reached the job's $${ceiling.toFixed(2)} ceiling`;
      return ports.refused(raw, trip);
    }
    const input = ceiling === undefined ? raw : ports.capped(raw, usd6(ceiling - spent));
    const f = ports.describe(input);
    count++;
    const intent: CallIntent<Promise<R>> = {
      provider: `${f.engine}-seat`,
      model: f.model,
      usage: {},
      quote: { usd: null, basis: "unpriced", note: SEAT_NOTE },
      payload: { turn: f.turn, engine: f.engine, model: f.model, effort: f.effort, promptChars: f.promptChars },
      subject: { kind: "job", id: ctx.job.id },
      stand: () => ports.stand(input),
    };
    const r = await ctx.meter.paid(JOB_USD, 0, intent, async () => {
      const out = await ports.live(input);
      return { value: Promise.resolve(out), entries: [entryOf(out, f)] };
    });
    if (!r.ok) throw r.error;
    const out = await r.value;
    stepUsd += out.costUsd ?? 0;
    return out;
  };
  return { turn, tripped: () => trip, used: () => count };
}

const fatal = (code: AppErrorCode, message: string): StepOutcome => ({ kind: "fatal", code, message });

/** A step that ran no turn paid nothing: say so, or the driver books its estimate (projection.ts). */
const produced = (output: EventData, turns: number): StepOutcome => (turns === 0 ? { kind: "produced", output, costUsd: 0 } : { kind: "produced", output });

export function defineArticle<I, R extends TurnReport>(ports: ArticlePorts<I, R>): Producer {
  return {
    lane: "seat.text",
    plan: (job, outputs) => planArticle(job.id, outputs),
    async perform(step: MissingStep, ctx: StepContext): Promise<StepOutcome> {
      const { runId } = parseArticleJob(ctx.job.id);
      if (step.name === "create") {
        const r = await ports.ensureRun(ctx.job);
        return r.ok ? produced({ runId: r.value.runId, created: r.value.created }, 0) : fatal(r.error.code, r.error.message);
      }
      if (step.name === "land") {
        const intent: CallIntent<StepReport> = {
          provider: "ai-registry",
          model: "publication-landing",
          usage: {},
          quote: { usd: 0, basis: "estimated", note: "a branch push and a pull request: outward, not priced" },
          payload: { runId, registry: ports.registry() },
          subject: { kind: "job", id: ctx.job.id },
          stand: () => ({ ok: true, status: "approved", skipped: true }),
        };
        const r = await ctx.fx.call("ai-registry/landing", paid(intent, () => ports.land(runId)));
        if (!r.ok) return fatal("unavailable", r.message);
        return produced({ runId, status: r.status, ...(ctx.job.mode.kind === "dry" ? { dry: true } : {}) }, 0);
      }
      if (!isWorkStep(step.name)) return fatal("internal", `article: no step called ${step.name}`);
      const t = meteredTurns(ctx, ports);
      const r = await ports.step(runId, step.name, t.turn);
      if (r.ok) return produced({ runId, step: step.name, status: r.status, skipped: r.skipped }, t.used());
      const trip = t.tripped();
      // A turn refused at the ceiling is a money stop, never a vendor failure (v1 extract's breaker
      // story). KERNEL GAP: a producer can only say `money-stop`, which the job records as
      // `period-ceiling`; the sentence names the run ceiling until StepOutcome can.
      return trip === undefined ? fatal("unavailable", r.message) : { kind: "money-stop", message: `${r.message} (${trip})` };
    },
  };
}
