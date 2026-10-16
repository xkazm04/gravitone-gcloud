// THE MUSIC-VIDEO PLAN, PURE - which steps a track still needs, in which order,
// and what each one costs to admit. Absorbed from v1 lib/sound/mv/queue.ts,
// whose header is the long form of every rule below; the v1 module now
// re-exports these so the board, the batch and the probes read one table.
//
// A FIRST RUN DOES WHAT IS MISSING (v1 `missingSteps`): a step runs when its
// output is absent from the record, so a stopped or crashed track resumes at
// the missing step with no bookkeeping. A REGENERATE (`redo`) also runs its
// part's steps although their outputs exist, and every redo step that lands is
// written to the record's `progress` ledger in the SAME write that lands its
// output (lib/sound/mv/store.ts) - so the ledger can only ever certify what
// was done, never what was merely attempted (delivery-guarantees:
// marker-certifies-what-was-done). `planOf(track, progress)` minus what the
// ledger holds is therefore the never-re-spend rule: a step whose output the
// record already holds is skipped, whoever asks and however often.
//
// WRITING RUNS BEFORE RENDERING: a metadata answer that fails the YouTube
// validator fails the track in seconds instead of after a multi-minute render.
//
// Upgraded on the kernel (Phase 4): v1 re-derived the plan on every loop turn
// from a file another process might be rewriting; the producer now books the
// plan as the job's FIRST output (producer.ts), so a job's step list is fixed
// when it starts and its progress total is honest from the first claim.

export type MvStep = "fetch" | "analyse" | "treat" | "motion" | "still" | "metadata" | "video";
export type MvPart = "image" | "motion" | "metadata";
export type MvPhase = "fetching" | "analysing" | "treating" | "imaging" | "rendering" | "writing";

export const STEP_ORDER: readonly MvStep[] = ["fetch", "analyse", "treat", "motion", "still", "metadata", "video"];

export const PHASE_OF: { readonly [S in MvStep]: MvPhase } = {
  fetch: "fetching",
  analyse: "analysing",
  treat: "treating",
  motion: "treating",
  still: "imaging",
  metadata: "writing",
  video: "rendering",
};

/** What each Regenerate part redoes; everything it does not name stays byte-identical. */
export const REDO_STEPS: { readonly [P in MvPart]: readonly MvStep[] } = {
  image: ["treat", "still", "video"],
  motion: ["motion", "video"],
  metadata: ["metadata"],
};

/** The record as the plan reads it - a structural view, so a v1 `MvJob` is one as it stands. */
export type MvTrack = {
  readonly files: { readonly audio?: string; readonly still?: string; readonly video?: string; readonly envelope?: string };
  readonly analysis?: unknown;
  readonly treatment?: unknown;
  readonly metadata?: unknown;
  readonly redo?: readonly MvPart[];
  /** A picture the operator supplied: the still step copies it and buys nothing. */
  readonly stillFrom?: string;
};

/** Steps whose output is absent from the record. */
export function missingSteps(j: MvTrack): Set<MvStep> {
  const out = new Set<MvStep>();
  if (j.files.audio === undefined) out.add("fetch");
  if (j.analysis === undefined || j.files.envelope === undefined) out.add("analyse");
  if (j.treatment === undefined) out.add("treat");
  if (j.files.still === undefined) out.add("still");
  if (j.metadata === undefined) out.add("metadata");
  if (j.files.video === undefined) out.add("video");
  return out;
}

/** What this run still has to do, in order; `done` is the record's progress ledger for a regenerate. */
export function planOf(j: MvTrack, done: readonly MvStep[] = []): MvStep[] {
  const missing = missingSteps(j);
  const redo = new Set((j.redo ?? []).flatMap((p) => REDO_STEPS[p]));
  // A motion redo on a track with no treatment at all is a first run's treat.
  if (missing.has("treat")) redo.delete("motion");
  return STEP_ORDER.filter((s) => missing.has(s) || (redo.has(s) && !done.includes(s)));
}

/** The never-re-spend check, asked against a FRESH read before a step performs. */
export const stillNeeded = (j: MvTrack, done: readonly MvStep[], step: MvStep): boolean => planOf(j, done).includes(step);

/** Does this run buy a still? (the health pause and the receipt ask) */
export const buysStill = (j: MvTrack, done: readonly MvStep[] = []): boolean => j.stillFrom === undefined && planOf(j, done).includes("still");

export const isMvStep = (s: string): s is MvStep => (STEP_ORDER as readonly string[]).includes(s);
