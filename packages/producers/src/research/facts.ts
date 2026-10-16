import { createHash } from "node:crypto";

import { disciplineOf, templateOf, type Discipline } from "@gt/catalog/projects";
import { recipeById } from "@gt/catalog/recipes";
import { AppError, err, ok, type Result } from "@gt/domain/errors";
import type { Actor } from "@gt/domain/event";
import { LANE_CAPACITY } from "@gt/domain/lane";
import type { ModelOption, PlanView, Receipt, ReceiptMode, WorkPlanPart } from "@gt/domain/produce";
import { isStepKind } from "@gt/domain/steps/registry";
import { armLive, DRY as DRY_MODE, dryOnlyFrom } from "@gt/kernel/dryrun";
import type { StepContext } from "@gt/kernel/job-core";
import { gateContext } from "@gt/kernel/parts/gates";
import { projectRecords, readPartIn, type PartSnapshot } from "@gt/kernel/parts/driver";
import { launchOf } from "@gt/kernel/records/options";
import { planViewIn, readQueue } from "@gt/kernel/records/read";
import { receiptFor, type PlanLine } from "@gt/kernel/records/receipt";
import type { Reader, Store } from "@gt/kernel/store";
import type { Job } from "@gt/domain/job";
import { askOf, type ActAsk, type ActPlan, type UnitPrice } from "./partAct.ts";
import { enqueueActIn, projectOf } from "./partJob.ts";

// A PART ACT'S FACTS AND ITS RECEIPT (Phase 4 wave C, L37) - what every studio step binding
// reads of its part before it plans (the plan row, the chosen option, the project's clock and
// records) and the receipt-then-confirm every act goes through (decision 3). Kernel and catalog
// only, so it sits in the package; lib/producers/research.ts re-exports it for the bindings.

/** v1's short digest (the fixture side's `hash.ts`): a brief's identity, a spine's key. */
export const shortDigest = (x: unknown): string => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 24);

export type PartFacts = {
  readonly plan: PlanView;
  readonly part: WorkPlanPart;
  readonly option: ModelOption;
  readonly discipline: Discipline;
  readonly targetS: number | null;
  /** Every step record of the project, decoded - what a part with no records of its own (still,
   *  words, voice) reads of its upstream. */
  readonly records: PartSnapshot["records"];
};

export function disciplineFor(recipeId: string): Discipline {
  const r = recipeById(recipeId);
  if (r?.template !== undefined) return disciplineOf(r.template);
  return r?.family === "album" ? "music-video" : "educational";
}

/** The part's plan row and project clock, read in `r` (the same read the editor's view makes). */
export function partFactsIn(r: Reader, projectId: string, partId: string, now: number): PartFacts {
  const plan = planViewIn(r, projectId, gateContext(r, now));
  const part = plan.parts.find((p): p is WorkPlanPart => p.id === partId && "options" in p);
  if (part === undefined) throw new AppError("not-found", `project ${projectId} has no work part ${partId}`);
  const option = part.options.find((o) => o.key === part.chosen) ?? part.options[0];
  if (option === undefined) throw new AppError("internal", `part ${partId} has no model option`);
  const recipe = recipeById(plan.project.recipe);
  const targetS = plan.project.runtimeS ?? (recipe?.template === undefined ? null : templateOf(recipe.template).defaultS);
  return { plan, part, option, discipline: disciplineFor(plan.project.recipe), targetS, records: projectRecords(r, projectId).records };
}

export function partFacts(ctx: StepContext): Result<PartFacts> {
  return ctx.fx.tx("part.facts", (t) => partFactsIn(t, projectOf(ctx.job), ctx.job.of.id, Date.parse(t.at)));
}

/** The text seat's words (catalog SEAT): billed after the turn, never priced before it. */
export const TEXT_SEAT = "a text turn bills the operator's text seat or a model that reports its cost after the turn; nothing prices it before";

/** One unit on `option`, as the receipt priced it. A text turn with no price is a seat: credit. */
export function priceOf(option: ModelOption, opts: { readonly text?: boolean; readonly units?: number } = {}): UnitPrice {
  const n = opts.units ?? 1;
  if (option.usdPerUnit !== null) return { seconds: option.secondsPerUnit * n, usd: Math.round(option.usdPerUnit * n * 1e6) / 1e6 };
  const why = option.unpricedReason ?? "unpriced";
  return { seconds: option.secondsPerUnit * n, usd: null, unpricedReason: why, ...(opts.text === true || option.lane === "seat.text" ? { credit: opts.text === true ? `${why}; ${TEXT_SEAT}` : why } : {}) };
}

/* ── a part act's receipt, then its confirm (decision 3) ──────────────────── */

/** An act's units for its receipt AND its job's plan step: one pure function of the records. */
export type UnitsFn = (s: PartSnapshot | null, f: PartFacts, ask: Pick<ActAsk, "act" | "target">) => Result<ActPlan>;

/**
 * A step producer's preflight (kernel job-core `Producer.preflight`) from its units function: the
 * part job's act planned statically over the records as they stand, and its REFUSAL - the work's
 * own sentence, the one the job's plan step would fail it with ("compose cut needs a composed
 * spine") - as the reason the part is held. Only `refused` holds: any other code is a defect, and
 * holding it would hide it, so the part is released and its drive names it. The same for a read
 * that throws here: it runs inside the release transaction, and a preflight that cannot read is
 * no reason to roll back the booking of the job that finished.
 */
export function preflightFrom(units: UnitsFn, now: () => number = Date.now): (job: Job, r: Reader) => string | undefined {
  return (job, r) => {
    const ask = askOf(job);
    if (!ask.ok) return undefined;
    let plan: Result<ActPlan>;
    try {
      const f = partFactsIn(r, projectOf(job), ask.value.partId, now());
      const s = isStepKind(f.part.kind) ? readPartIn(r, { projectId: f.plan.project.id, partId: ask.value.partId }) : null;
      plan = units(s, f, { act: ask.value.act, ...(ask.value.target === undefined ? {} : { target: ask.value.target }) });
    } catch (e) {
      // Deliberately released: the drive reads the same records and fails with the defect named.
      void e;
      return undefined;
    }
    return !plan.ok && plan.error.code === "refused" ? plan.error.message : undefined;
  };
}

/** A part kind with step records reads them; still, words and voice have none (null). */
export const withRecords =
  (fn: (s: PartSnapshot, f: PartFacts, ask: Pick<ActAsk, "act" | "target">) => Result<ActPlan>): UnitsFn =>
  (s, f, ask) =>
    s === null ? err("internal", `${f.part.kind} parts hold no step records`) : fn(s, f, ask);
export type PartActRef = { readonly projectId: string; readonly partId: string; readonly act: string; readonly target?: string };
export type StepReceipt = Omit<Receipt, "subject"> & { readonly subject: { readonly kind: "part"; readonly projectId: string; readonly partId: string; readonly rev: number; readonly act: string; readonly target?: string } };
export type ReceiptOptions = { readonly mode: ReceiptMode; readonly ceilingUsd?: number; readonly now: number };

/** The act as one receipt line on its option's lane: its units' summed pace and price (a unit with
 *  no price makes the line unpriced, with its reason - never a guessed figure). */
function actOption(plan: ActPlan, option: ModelOption): ModelOption {
  const seconds = plan.units.reduce((n, u) => n + u.estimate.seconds, 0);
  const unpriced = plan.units.find((u) => u.estimate.usd === null);
  const usd = plan.units.reduce((n, u) => n + (u.estimate.usd ?? 0), 0);
  const { unpricedReason: _drop, ...base } = option;
  return {
    ...base,
    key: `${option.key}#${plan.act}`,
    secondsPerUnit: seconds,
    usdPerUnit: unpriced === undefined ? Math.round(usd * 1e6) / 1e6 : null,
    ...(unpriced === undefined ? {} : { unpricedReason: unpriced.credit ?? unpriced.estimate.unpricedReason ?? "unpriced" }),
  };
}

/** The receipt, read in `r`: units statically from the records, placed among the live queue. */
export function actReceiptIn(r: Reader, ref: PartActRef, units: UnitsFn, o: ReceiptOptions): Result<StepReceipt> {
  const f = partFactsIn(r, ref.projectId, ref.partId, o.now);
  const s = isStepKind(f.part.kind) ? readPartIn(r, { projectId: ref.projectId, partId: ref.partId }) : null;
  const plan = units(s, f, { act: ref.act, ...(ref.target === undefined ? {} : { target: ref.target }) });
  if (!plan.ok) return plan;
  const option = actOption(plan.value, f.option);
  const n = plan.value.units.length;
  const line: PlanLine = { key: `${ref.partId}:${ref.act}`, label: `${ref.act}${ref.target === undefined ? "" : ` ${ref.target}`} · ${n} unit${n === 1 ? "" : "s"}`, lane: option.lane, units: 1, option, after: [], order: Number.MAX_SAFE_INTEGER, status: "pending" };
  const rc = receiptFor({ subject: { kind: "project", id: ref.projectId, rev: s?.rev ?? 1 }, lines: [line], plan: [line], queue: readQueue(r), capacity: LANE_CAPACITY, now: o.now, mode: o.mode, ...(o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd }) });
  const subject = { kind: "part" as const, projectId: ref.projectId, partId: ref.partId, rev: s?.rev ?? 1, act: ref.act, ...(ref.target === undefined ? {} : { target: ref.target }) };
  // The act and its unit are in the token: a receipt for one plate cannot confirm another.
  return ok({ ...rc, subject, token: shortDigest({ t: rc.token, act: ref.act, target: ref.target ?? null, units: plan.value.units.map((u) => u.name) }) });
}

export function partActReceipt(store: Store, ref: PartActRef, units: UnitsFn, o: ReceiptOptions): Result<StepReceipt> {
  const r = store.read((x) => actReceiptIn(x, ref, units, o));
  return r.ok ? r.value : r;
}

export type ActLaunched = { readonly kind: "stale"; readonly fresh: StepReceipt } | { readonly kind: "launched"; readonly jobId: string; readonly adopted: boolean; readonly receipt: StepReceipt };

/**
 * Confirm an act's receipt: ONE transaction recomputes it, answers a stale token with the fresh
 * receipt (nothing written), else enqueues the act's job (`enqueueActIn`: a live job for the same
 * act and unit is adopted - a double click is one purchase). Live needs an arm and is refused
 * under GRAVITONE_DRY_ONLY. The job is the part kind's producer on the chosen option's lane.
 */
export function launchPartAct(store: Store, ref: PartActRef, units: UnitsFn, o: ReceiptOptions & { readonly token: string; readonly actor: Actor; readonly dryOnly?: boolean }): Result<ActLaunched> {
  const r = store.tx((t): Result<ActLaunched> => {
    const fresh = actReceiptIn(t, ref, units, o);
    if (!fresh.ok) return fresh;
    if (fresh.value.token !== o.token) return ok({ kind: "stale", fresh: fresh.value });
    const f = partFactsIn(t, ref.projectId, ref.partId, o.now);
    const picked = launchOf(f.part.kind, f.option.key, new Date(o.now).toISOString().slice(0, 10));
    const mode = o.mode === "live" ? armLive(o.actor, t.at, `receipt ${o.token.slice(0, 12)} confirmed`, { dryOnly: o.dryOnly ?? dryOnlyFrom(process.env) }) : ok(DRY_MODE);
    if (!mode.ok) return mode;
    const ask = { partId: ref.partId, act: ref.act, rev: fresh.value.subject.rev, ...(ref.target === undefined ? {} : { target: ref.target }) };
    const q = enqueueActIn(t, { ask, projectId: ref.projectId, producer: picked?.producer ?? f.part.kind, lane: f.option.lane, mode: mode.value, ...(o.ceilingUsd === undefined ? {} : { ceilingUsd: o.ceilingUsd }) }, o.actor);
    return ok({ kind: "launched", jobId: q.jobId, adopted: q.adopted, receipt: fresh.value });
  });
  return r.ok ? r.value : r;
}
