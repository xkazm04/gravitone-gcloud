import { AppError } from "@gt/domain/errors";

// THE FORGE JOB'S PLAN, PURE - the Node twin of pipeline/foundry/forge_job.py `plan`.
//
// The forge is a Python producer: its steps are PERFORMED by pipeline/foundry/
// worker.py on the card (ComfyUI, the Ollama eye), never by a Node worker - the
// Node worker leaves a gpu.local forge job queued (`workLoop` names it an orphan
// and never skips it). What stays Node-side is what must be known BEFORE anything
// runs: the receipt (how many plates, how long, what it costs - $0 on the local
// card) and the job's identity. Both read the plan, so the plan exists twice, and
// ./plan-cases.json holds the two to the same answers on literal views
// (tests/next-server/producer-forge.test.ts runs every case through both).
//
// What the plan absorbs from forge.py (v1 resume, per stage):
//   - every annotation, then every generation, then every grade: one card, two
//     engines, "every stage loads its engine ONCE";
//   - a PNG on disk is a finished generation whatever the manifest says
//     (`adopt_plate`): no generate step for it, and it is graded;
//   - `unmeasured` is resumable (a grade the annotator failed is owed again): the
//     grade step carries the job's attempt, so within one attempt a booked grade is
//     not taken twice and the next attempt takes it again;
//   - a generation needs its scene's annotation (the prompt is compiled from it);
//   - `abandoned`: ComfyUI could not be recycled after a failure in this drive, so
//     no more plates are planned in it (v1's `break`) - the grades still are.
// Never re-spend: a booked step is never planned again (and on the card a booked
// plate is also on disk - either fact keeps it out).

export type ForgeCandidateView = {
  readonly id: string;
  readonly scene: string;
  readonly status: "pending" | "generated" | "graded" | "unmeasured" | "failed";
  /** Its PNG exists in the run directory. */
  readonly plate: boolean;
};
export type ForgeView = {
  readonly scenes: readonly { readonly id: string; readonly annotated: boolean }[];
  readonly candidates: readonly ForgeCandidateView[];
};
export type ForgePlanOptions = { readonly skipGrade?: boolean; readonly abandoned?: boolean };

const GRADABLE: ReadonlySet<string> = new Set(["generated", "unmeasured"]);
const UNMADE: ReadonlySet<string> = new Set(["pending", "failed"]);

export const gradeStep = (candidate: string, attempt: number): string => `grade:${candidate}:a${attempt}`;

/** The missing step names, in the order the engines take them. */
export function forgeSteps(view: ForgeView, booked: ReadonlySet<string>, attempt: number, opts: ForgePlanOptions = {}): string[] {
  if (!Number.isInteger(attempt) || attempt < 1) throw new AppError("invalid", `a job attempt is counted from 1; got ${attempt}`);
  const annotated = new Set(view.scenes.filter((s) => s.annotated).map((s) => s.id));
  const steps = view.scenes.filter((s) => !s.annotated).map((s) => `annotate:${s.id}`);
  if (opts.abandoned !== true) {
    for (const c of view.candidates) if (!c.plate && UNMADE.has(c.status) && annotated.has(c.scene)) steps.push(`generate:${c.id}`);
  }
  if (opts.skipGrade !== true) {
    for (const c of view.candidates) if (GRADABLE.has(c.status) || (c.plate && UNMADE.has(c.status))) steps.push(gradeStep(c.id, attempt));
  }
  return steps.filter((s) => !booked.has(s));
}

/**
 * The receipt's pace, per step kind. A plate's 96 s is the catalog's (@gt/catalog
 * partOptions `forge`, marked illustrative there); an annotation and a grade are
 * one Ollama read each - assumed at a quarter of a plate, a figure no run has
 * measured yet, which is why the receipt's source tag stays `illustrative`.
 */
export const FORGE_PACE = { plateSeconds: 96, readSeconds: 24 } as const;

/**
 * What is left of the WHOLE run, for the receipt - not the next drive's step list,
 * which plans no plate for a scene not yet annotated and no grade for a plate not
 * yet drawn. Every unannotated scene is one read; every candidate without a plate
 * is a plate; every candidate not yet `graded` is a grade (unless grading is
 * skipped). The receipt is computed statically and never by performing a step.
 */
export function forgeWork(view: ForgeView, opts: { readonly skipGrade?: boolean } = {}): { readonly plates: number; readonly reads: number; readonly seconds: number } {
  const plates = view.candidates.filter((c) => !c.plate && UNMADE.has(c.status)).length;
  const grades = opts.skipGrade === true ? 0 : view.candidates.filter((c) => c.status !== "graded" && (c.plate || UNMADE.has(c.status) || GRADABLE.has(c.status))).length;
  const reads = view.scenes.filter((s) => !s.annotated).length + grades;
  return { plates, reads, seconds: plates * FORGE_PACE.plateSeconds + reads * FORGE_PACE.readSeconds };
}

/** A forge run's job id. A run id is a directory name: no colon, never empty. */
export function forgeJobId(runId: string, k = 1): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(runId)) throw new AppError("invalid", `not a forge run id: ${JSON.stringify(runId)}`);
  return k === 1 ? `job:run:forge:${runId}` : `job:run:forge:${runId}~${k}`;
}

/** The Run a forge job serves (`of.id`): its run directory, named for its producer. */
export const forgeRunOf = (runId: string): string => `forge:${runId}`;
