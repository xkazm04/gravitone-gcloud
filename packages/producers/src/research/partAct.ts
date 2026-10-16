import { z } from "zod";
import { parseAt } from "@gt/domain/door";
import { AppError, type Result } from "@gt/domain/errors";
import { estimateSchema, type Estimate } from "@gt/domain/estimate";
import type { EventData } from "@gt/domain/event";
import type { Job } from "@gt/domain/job";
import type { ResourceLane } from "@gt/domain/lane";
import type { Ending, MissingStep, Outputs, Producer, StepContext, StepOutcome } from "@gt/kernel/job-core";

// A STUDIO PART'S ACT AS ONE KERNEL JOB (Phase 4 wave C, L37) - the shape every studio step
// producer shares (research, script, frames, motion, score, cut, still, words, voice). It lives
// beside the first of them because a package path is a write set; the others import it.
//
// What v1 did instead, per act (INVENTORY §7.2-§7.3): a server turn with a 202 + turnId and a
// bell job in localStorage (research, recalibrate, frames direction, poster), or a plain fetch
// with no job at all (motion direct, plate render, score cue, animatic export) - so a reload lost
// the act, a second click bought it twice (only Score's `useCueTakes` single-flighted, per tab),
// and cost was shown "never" for half of them. Here every act is three kinds of step on the one
// job driver (kernel job-run.ts), and each kind absorbs one of v1's lessons:
//
//   plan       reads THIS part's records and books the act's units as the job's FIRST output -
//              the mv producer's rule (its plan is fixed when it starts, a resume never
//              re-derives it from records that moved on). A refusal the work states before any
//              spend (recalibrate's four guards, "a picked idea" missing) fails the job HERE,
//              with the sentence verbatim and nothing bought (v1 recalibrate.ts: "applied before
//              the plan, never after").
//   unit:<n>   ONE paid call (a turn, a plate, a clip, a cue), its output booked by the kernel
//              before the next one starts. A crash after a booking resumes past it: the plan is
//              the missing outputs (v1 lib/sound/mv/queue.ts), so a booked unit is never bought
//              again (v1 extract's never-re-spend). A crash DURING a unit is the kernel's
//              interruption - on a paid lane the lane holds until the operator looks.
//   land       writes every booked output into the part's records in one transaction, as the
//              job (`land`, by the job id: an operator's ⌫ never undoes a machine's work).
//
// The receipt prices the SAME units statically (the binding's `units` is a pure function of the
// part's records), never by performing a step (COMMON decision 3).

/** One unit of an act: a paid call or a free one, with the estimate the ceiling is checked by. */
export type ActUnit = {
  readonly name: string;
  readonly estimate: Estimate;
  /** Credit-priced (a seat, studio credits): why there is no dollar figure (decision 7). */
  readonly credit?: string;
  /** What the unit is about (a card, a unit id, a cue key): plain JSON, booked with the plan. */
  readonly input: EventData;
};

export type ActPlan = { readonly act: string; readonly units: readonly ActUnit[] };

/** What a part job is asked to do, read off its id (`partJobId`). `act: null` is the part's own
 *  plan job (launched from Plan): the binding resolves the kind's default act from its records. */
export type ActAsk = { readonly partId: string; readonly act: string | null; readonly rev?: number; readonly target?: string; readonly n?: number };

/** `job:part:<partId>` (the Plan's job), or `job:part:<partId>:<act>:<rev>[:<target>]` with
 *  `~<n>` for a later launch at the same rev (a re-run after an unchanged landing). */
export function partJobId(ask: ActAsk): string {
  const base = `job:part:${ask.partId}`;
  if (ask.act === null) return base;
  const target = ask.target === undefined ? "" : `:${encodeURIComponent(ask.target)}`;
  return `${base}:${ask.act}:${ask.rev ?? 0}${target}${ask.n === undefined || ask.n <= 1 ? "" : `~${ask.n}`}`;
}

const ACT_RE = /^:([a-z][a-z0-9-]*):(\d+)(?::([^:~]+))?(?:~([1-9][0-9]*))?$/;

/** The ask a part job carries. The part id is the job's own `of.id`, so a project id holding a
 *  colon cannot be mis-split; only the suffix is parsed. */
export function askOf(job: Pick<Job, "id" | "of">): Result<ActAsk> {
  if (job.of.kind !== "part") return { ok: false, error: new AppError("invalid", `job ${job.id} serves a run, not a part`) };
  const base = `job:part:${job.of.id}`;
  if (!job.id.startsWith(base)) return { ok: false, error: new AppError("invalid", `job ${job.id} does not name part ${job.of.id}`) };
  const rest = job.id.slice(base.length);
  if (rest === "") return { ok: true, value: { partId: job.of.id, act: null } };
  const m = ACT_RE.exec(rest);
  if (m === null || m[1] === undefined || m[2] === undefined) return { ok: false, error: new AppError("invalid", `job ${job.id}: "${rest}" is not <act>:<rev>[:<target>]`) };
  return {
    ok: true,
    value: {
      partId: job.of.id,
      act: m[1],
      rev: Number(m[2]),
      ...(m[3] === undefined ? {} : { target: decodeURIComponent(m[3]) }),
      ...(m[4] === undefined ? {} : { n: Number(m[4]) }),
    },
  };
}

/** The ports a studio step binds (lib/producers/<step>.ts). */
export type PartActPorts = {
  /** The act's units from the part's records as they are now; a refusal is the work's sentence. */
  plan(job: Job, ask: ActAsk, ctx: StepContext): Promise<Result<ActPlan>>;
  /** One unit: paid calls through `ctx.meter` with stand-ins. Its output is the unit's booking. */
  perform(job: Job, plan: ActPlan, unit: ActUnit, ctx: StepContext): Promise<StepOutcome>;
  /** Every unit's output into the part's records, as the job. `rev` after; `unchanged` when the
   *  outputs equal what the records already hold (a dry re-run). */
  land(job: Job, plan: ActPlan, made: ReadonlyMap<string, EventData>, ctx: StepContext): Promise<Result<{ readonly rev: number; readonly unchanged: boolean }>>;
  /** After the job ended (kernel settle hook): open what the moved verdict now allows. */
  settled?(job: Job, ending: Ending): Promise<void>;
  health?(): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }>;
};

const free = (seconds: number): Estimate => ({ seconds, usd: 0 });
const PLAN: MissingStep = { name: "plan", estimate: free(1) };
const LAND: MissingStep = { name: "land", estimate: free(1) };
export const unitStep = (name: string): string => `unit:${name}`;

const unitSchema = z.object({ name: z.string().min(1), estimate: estimateSchema, credit: z.string().min(1).optional(), input: z.record(z.string(), z.unknown()) });
const planSchema = z.object({ act: z.string().min(1), units: z.array(unitSchema) });

/** The booked plan, read back through its door. */
export function bookedPlan(outputs: Outputs): ActPlan | undefined {
  const b = outputs.get("plan");
  if (b === undefined) return undefined;
  const p = parseAt("part act plan", planSchema, b.value);
  if (!p.ok) throw p.error;
  return { act: p.value.act, units: p.value.units.map((u) => ({ name: u.name, estimate: u.estimate, ...(u.credit === undefined ? {} : { credit: u.credit }), input: u.input })) };
}

/** The pure plan: `plan`, then every unit not yet booked in plan order, then `land`. */
export function actSteps(outputs: Outputs): MissingStep[] {
  const p = bookedPlan(outputs);
  if (p === undefined) return [PLAN];
  const units = p.units.map((u): MissingStep => ({ name: unitStep(u.name), estimate: u.estimate, ...(u.credit === undefined ? {} : { credit: u.credit }) }));
  return [...units, LAND].filter((s) => !outputs.has(s.name));
}

/** A plan whose unit names collide would book one output for two calls: refused at the plan. */
function checked(plan: ActPlan): Result<ActPlan> {
  const seen = new Set<string>();
  for (const u of plan.units) {
    if (seen.has(u.name)) return { ok: false, error: new AppError("internal", `${plan.act}: unit ${u.name} is planned twice`) };
    seen.add(u.name);
  }
  return { ok: true, value: plan };
}

/** A part act producer on `lane` (the part's chosen option's lane: a job runs on its own). */
export function definePartAct(lane: ResourceLane, ports: PartActPorts, opts: { readonly breakerLimit?: number } = {}): Producer {
  return {
    lane,
    ...(opts.breakerLimit === undefined ? {} : { breakerLimit: opts.breakerLimit }),
    plan: (_job, outputs) => actSteps(outputs),
    async perform(step, ctx): Promise<StepOutcome> {
      if (step.name === "plan") {
        const ask = askOf(ctx.job);
        if (!ask.ok) return { kind: "fatal", code: ask.error.code, message: ask.error.message };
        const p = await ports.plan(ctx.job, ask.value, ctx);
        const c = p.ok ? checked(p.value) : p;
        // The work's own refusal, verbatim: nothing was bought, and the job says why.
        if (!c.ok) return { kind: "fatal", code: c.error.code, message: c.error.message };
        return { kind: "produced", output: { act: c.value.act, units: c.value.units.map((u) => ({ ...u })) }, costUsd: 0 };
      }
      const plan = bookedPlan(ctx.outputs);
      if (plan === undefined) return { kind: "fatal", code: "internal", message: `${step.name} ran before the act was planned` };
      if (step.name === "land") {
        const made = new Map<string, EventData>();
        for (const u of plan.units) {
          const o = ctx.outputs.get(unitStep(u.name));
          if (o === undefined) return { kind: "fatal", code: "internal", message: `land: unit ${u.name} has no booked output` };
          made.set(u.name, o.value);
        }
        const l = await ports.land(ctx.job, plan, made, ctx);
        if (!l.ok) return { kind: "fatal", code: l.error.code, message: l.error.message };
        return { kind: "produced", output: { rev: l.value.rev, unchanged: l.value.unchanged }, costUsd: 0 };
      }
      const unit = plan.units.find((u) => unitStep(u.name) === step.name);
      if (unit === undefined) return { kind: "fatal", code: "internal", message: `${step.name} is not in the booked plan` };
      return ports.perform(ctx.job, plan, unit, ctx);
    },
    ...(ports.settled === undefined ? {} : { settle: ports.settled }),
    ...(ports.health === undefined ? {} : { health: ports.health }),
  };
}

/**
 * What one unit of an option costs, as the receipt priced it (the part's chosen `ModelOption`):
 * seconds, and dollars or the reason there are none. `credit` marks a unit billed in something
 * other than dollars (a text seat reported after the turn, studio credits): admitted under a USD
 * ceiling and booked unpriced with its reason. An unpriced unit WITHOUT `credit` (a cloud call the
 * table cannot price) stops under a ceiling - fail-closed (kernel job-core `next`).
 */
export type UnitPrice = { readonly seconds: number; readonly usd: number | null; readonly unpricedReason?: string; readonly credit?: string };

export const FREE: UnitPrice = { seconds: 1, usd: 0 };

/** A unit of `price`, named and about `input`. */
export function unitOf(name: string, price: UnitPrice, input: EventData): ActUnit {
  const estimate: Estimate = price.usd === null ? { seconds: price.seconds, usd: null, unpricedReason: price.unpricedReason ?? price.credit ?? "unpriced" } : { seconds: price.seconds, usd: price.usd };
  return { name, estimate, ...(price.credit === undefined ? {} : { credit: price.credit }), input };
}

/** A refusal in the work's own words: the act is not planned and nothing is bought. */
export const refuse = (message: string): Result<never> => ({ ok: false, error: new AppError("refused", message) });

/** A unit that called nothing and cost nothing (a pure step, a skipped unit). */
export const madeFree = (output: EventData): StepOutcome => ({ kind: "produced", output, costUsd: 0 });

/** A unit that paid through the meter: the driver reads the meter, never a figure here. */
export const madePaid = (output: EventData, ctx: StepContext): StepOutcome => ({ kind: "produced", output, ...(ctx.meter.used() ? {} : { costUsd: 0 }) });
