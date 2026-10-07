// A PROJECT'S OUTPUTS — what its own step records hold, as one list.
//
// The shelf used to be the Glass Harbor fixture for every project. This is the
// project's real reel: each step that owns pictures or sound exports a pure
// projection next to its own record (`frames/outputs.ts`, `score/outputs.ts`),
// and this module reads the records, hands them over, and keeps one source's
// failure from taking another down. It lives in `_library`, not `_shared`,
// because phase-shared-B edits `_shared`.
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

import { listTakes, takeFileUrl } from "@/lib/sound/client";

import { readRecord } from "../_phases/_shared/records/registry";
import { framesOutputs } from "../_phases/frames/outputs";
import { FRAMES_ALTS, FRAMES_RECORD } from "../_phases/frames/records";
import { scoreOutputs } from "../_phases/score/outputs";
import { SCORE } from "../_phases/score/records";

export type OutputKind = "image" | "audio";
export type OutputState = "in-cut" | "alternative" | "unresolved" | "missing";
export type OutputStep = "frames" | "score";

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

/** One source's read. `refused` is the record registry's own answer: a record
 *  this build cannot interpret, which is not the same as one that is absent. */
export type SourceRead =
  | {
      state: "loaded";
      outputs: Output[];
      /** The part of the source that could not be read, in the store's words. */
      note?: string;
    }
  | { state: "empty" }
  | { state: "unavailable"; reason: string }
  | { state: "refused"; refused: "future" | "malformed"; reason: string };

export interface ProjectOutputs {
  projectId: string;
  sources: Record<OutputStep, SourceRead>;
  /** Every source's outputs, missing rows included. */
  outputs: Output[];
  /** What is on the shelf: everything but the missing rows. */
  count: number;
}

type Collect = (projectId: string) => Promise<SourceRead>;
type Failed = { ok: false; trouble: { message: string } } | { ok: false; refused: "future" | "malformed"; detail: string };

const failure = (r: Failed): SourceRead =>
  "refused" in r
    ? { state: "refused", refused: r.refused, reason: r.detail }
    : { state: "unavailable", reason: r.trouble.message };

const collectFrames: Collect = async (projectId) => {
  const read = await readRecord(FRAMES_RECORD, projectId);
  if (!read.ok) return failure(read);
  if (!read.data) return { state: "empty" };
  const alts = await readRecord(FRAMES_ALTS, projectId);
  const note = alts.ok ? undefined : `alternatives: ${"refused" in alts ? alts.detail : alts.trouble.message}`;
  const outputs = framesOutputs(read.data, alts.ok ? alts.data : undefined);
  return outputs.length === 0 && !note ? { state: "empty" } : { state: "loaded", outputs, note };
};

/** The sound store is another server: unreachable, the whole source is
 *  `unavailable` with the engine's own words, because half a score is a claim
 *  the record cannot back. It is not asked when no cue has ever had a take. */
const collectScore: Collect = async (projectId) => {
  const read = await readRecord(SCORE, projectId);
  if (!read.ok) return failure(read);
  const spots = read.data?.spots ?? [];
  if (spots.length === 0) return { state: "empty" };
  const takes = new Map<string, { provider: string; src: string }>();
  if (spots.some((s) => s.activeTakeId || (s.takeIds ?? []).length > 0)) {
    const res = await listTakes({ projectId });
    if (!res.ok) return { state: "unavailable", reason: res.error };
    for (const t of res.data.takes) takes.set(t.id, { provider: t.provider, src: takeFileUrl(t.id) });
  }
  return { state: "loaded", outputs: scoreOutputs(spots, takes) };
};

const SOURCES: Record<OutputStep, Collect> = { frames: collectFrames, score: collectScore };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function readOutputs(projectId: string): Promise<ProjectOutputs> {
  const reads = await Promise.all(
    (Object.keys(SOURCES) as OutputStep[]).map(async (step): Promise<[OutputStep, SourceRead]> => {
      try {
        return [step, await SOURCES[step](projectId)];
      } catch (e) {
        return [step, { state: "unavailable", reason: message(e) }];
      }
    }),
  );
  const sources = Object.fromEntries(reads) as Record<OutputStep, SourceRead>;
  const outputs = reads.flatMap(([, r]) => (r.state === "loaded" ? r.outputs : []));
  return { projectId, sources, outputs, count: outputs.filter((o) => o.state !== "missing").length };
}
