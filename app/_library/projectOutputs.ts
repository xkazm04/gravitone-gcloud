// A PROJECT'S OUTPUTS — what its own step records hold, as one list.
//
// The shelf used to be the Glass Harbor fixture for every project. This is the
// project's real reel: each step that owns pictures or sound exports a
// collector next to its own record (`frames/outputs.ts`, `score/outputs.ts`),
// and this module only lists them and keeps them from taking each other down.
// It lives in `_library`, not `_shared`, because phase-shared-B edits `_shared`.
//
// AN OUTPUT'S STATE DESCRIBES THE ARTIFACT, NEVER THE STEP. `in-cut` is the
// plate or take the cut uses; `alternative` was kept beside it; `unresolved` is
// kept with no choice made; `missing` is a row that names what the cut lacks and
// is not counted. Nothing here is "approved", "done" or "final": a sign-off is a
// human act on a step (lib/projects.ts) and changes no output.
//
// INVENT NOTHING. The fixture `Asset` carries a tone, a collection and a mock
// preview that no record holds; they are not here, and a shelf that wants one
// of them has to go without it.

export type OutputKind = "image" | "audio";
export type OutputState = "in-cut" | "alternative" | "unresolved" | "missing";

export interface Output {
  /** Derived from the record's own id, so one artifact is one id across reads. */
  id: string;
  kind: OutputKind;
  title: string;
  state: OutputState;
  /** A `missing` row's reason, the same code the step's verdict uses. */
  code?: string;
  /** Absent on a missing row. */
  src?: string;
  provenance: { step: OutputStep; model?: string; run?: string; costUsd?: number };
}

export type OutputStep = "frames" | "score";

/** One source's read. `refused` is the record registry's own answer: a record
 *  this build cannot interpret, which is not the same as one that is absent. */
export type SourceRead =
  | { state: "loaded"; outputs: Output[]; /** Part of the source that could not be read. */ note?: string }
  | { state: "empty" }
  | { state: "unavailable"; reason: string }
  | { state: "refused"; refused: "future" | "malformed"; reason: string };

export interface OutputSource {
  step: OutputStep;
  collect: (projectId: string) => Promise<SourceRead>;
}

export interface ProjectOutputs {
  projectId: string;
  sources: Record<OutputStep, SourceRead>;
  /** Every source's outputs, missing rows included. */
  outputs: Output[];
  /** What is on the shelf: everything but the missing rows. */
  count: number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Imports are lazy so a surface that never opens the shelf never loads the
 *  collectors, and a collector that throws costs only its own source. */
export const OUTPUT_SOURCES: readonly OutputSource[] = [
  { step: "frames", collect: async (id) => (await import("../_phases/frames/outputs")).collectFramesOutputs(id) },
  { step: "score", collect: async (id) => (await import("../_phases/score/outputs")).collectScoreOutputs(id) },
];

export async function readOutputs(projectId: string): Promise<ProjectOutputs> {
  const reads = await Promise.all(
    OUTPUT_SOURCES.map(async (s): Promise<[OutputStep, SourceRead]> => {
      try {
        return [s.step, await s.collect(projectId)];
      } catch (e) {
        return [s.step, { state: "unavailable", reason: message(e) }];
      }
    }),
  );
  const sources = Object.fromEntries(reads) as Record<OutputStep, SourceRead>;
  const outputs = reads.flatMap(([, r]) => (r.state === "loaded" ? r.outputs : []));
  return { projectId, sources, outputs, count: outputs.filter((o) => o.state !== "missing").length };
}
