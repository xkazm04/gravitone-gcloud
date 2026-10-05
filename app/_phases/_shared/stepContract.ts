// THE STEP CONTRACT — what a step reads, whom it applies to, and what its
// records say about its progress, as one pure function per step.
//
// WHY (card WORKSPACE-A, docs/concepts/moonshots-2026-10-05/01-studio-hub.md).
// A step's progress is written today by an effect inside the step's own surface
// (usePhaseReport, and useFrames' copy of it), so it is only ever as true as the
// last time somebody had that step open. Cut and the standard Score have no
// reporter at all, so they can never be signed off; a reporter whose step was
// cleared says nothing, so the shelf keeps the old word; and Frames' `blocked`
// partly derives from session state, so the word survives a reload while its
// reason does not.
//
// The contract moves the rule out of the surfaces. Each step declares a module
// in `app/_phases/<step>/verdict.ts`:
//
//   · `records` — the step-record keys its verdict reads, each resolved to a
//     def from the record registry (./records), so every read is versioned and
//     parsed, and a record nobody can read is refused rather than taken as
//     absent;
//   · `reads` — the steps that own those records (and any it waits on), the
//     edge stage 2's recompute follows when an upstream step writes;
//   · `appliesTo(discipline)` — Score does not apply to a music video, and a
//     step that does not apply has no verdict rather than an asserted `done`;
//   · `verdict(input)` — PURE: the project plus the decoded records in, a state,
//     its reasons and a basis out. No React, no storage, no clock
//     (tests/golden-path/step-verdicts.probe.spec.ts holds it to that, down the
//     whole import graph).
//
// `done` IS NOT A VERDICT. It reads as "locked" everywhere, and a lock is a
// human sign-off (`signOff` in lib/projects). The type below cannot say it; a
// step whose checkpoint is reached says `review`, and names the checkpoint.
//
// STAGE 1 IS ADDITIVE. Nothing writes these verdicts yet: the mounted reporters
// still own `Project.progress`, and the probe's parity table records, row by row,
// where the two agree and why they do not. Stage 2 (progress.ts#recompute) is
// the switch.
//
// A SIXTH STEP registers by writing its verdict module and adding it to
// STEP_MODULES — and declaring any record it reads in its own records.ts. A
// phase with no module is simply not covered: `stepModule` answers undefined and
// the legacy reporter keeps the cell.

import { getProject, PHASE_TITLE, type Discipline, type PhaseKey, type PhaseState, type Project } from "@/lib/projects";

import { readRecord, type RecordDef } from "./records/registry";

import { CUT } from "../cut/records";
import { FRAMES } from "../frames/records";
import { MUSIC_VIDEO_SOURCE, RESEARCH, RESEARCH_BEATS, RESEARCH_SCOPE } from "../research/records";
import { SCORE } from "../score/records";
import { SCRIPT_ADOPTED, SCRIPT_TRAILER, SCRIPT_VERSIONS } from "../script/records";

import { CUT_STEP } from "../cut/verdict";
import { FRAMES_STEP } from "../frames/verdict";
import { RESEARCH_STEP } from "../research/verdict";
import { SCORE_STEP } from "../score/verdict";
import { SCRIPT_STEP } from "../script/verdict";

/* ─────────────────────────────── the contract ─────────────────────────────── */

/** What a verdict may say. `empty` is `null` (nothing to say); `done` is a
 *  sign-off and belongs to `signOff`, never to a derivation. */
export type VerdictState = Exclude<PhaseState, "empty" | "done"> | null;

/** One reason, in the work's own words. `code` is stable and machine-read;
 *  `text` is short enough for a Hint; `ref` names the thing (a frame id, a card
 *  id) when there is one. */
export interface VerdictReason {
  code: string;
  text: string;
  ref?: string;
}

export interface StepVerdict {
  state: VerdictState;
  /** Worst first. A state with no reason is allowed only for `null`. */
  reasons: VerdictReason[];
  /** The inputs the verdict depended on, compactly — what stage 3 compares to
   *  say a downstream sign-off is older than the upstream it stood on. */
  basis: string;
}

/** The decoded records a verdict reads, by record key. `undefined` = never
 *  written. Only keys the module declared are present. */
export type RecordSnapshot = Readonly<Record<string, unknown>>;

export interface VerdictInput {
  project: Project;
  records: RecordSnapshot;
}

/** What `verdict` receives: the input, with the discipline resolved once. */
export interface ResolvedInput extends VerdictInput {
  discipline: Discipline;
}

export interface StepModule {
  key: PhaseKey;
  reads: readonly PhaseKey[];
  records: readonly string[];
  appliesTo: (discipline: Discipline) => boolean;
  verdict: (input: ResolvedInput) => StepVerdict;
}

/* ───────────────────────────── the registered steps ───────────────────────── */

/** In production order. Order matters only to readers that walk it. */
export const STEP_MODULES: readonly StepModule[] = [RESEARCH_STEP, SCRIPT_STEP, FRAMES_STEP, SCORE_STEP, CUT_STEP];

export function stepModule(key: PhaseKey): StepModule | undefined {
  return STEP_MODULES.find((m) => m.key === key);
}

/** The discipline a project record is read as — the same fallback every
 *  surface applies to a record from before disciplines existed. */
export const disciplineIn = (p: Pick<Project, "discipline">): Discipline => p.discipline ?? "educational";

/** A step's verdict over an input. Pure. A step that does not apply to the
 *  project's discipline says nothing, and says why. */
export function verdictOf(m: StepModule, input: VerdictInput): StepVerdict {
  const discipline = disciplineIn(input.project);
  if (!m.appliesTo(discipline))
    return {
      state: null,
      reasons: [{ code: "not-applicable", text: `no ${PHASE_TITLE[m.key]} in a ${discipline} project` }],
      basis: `${m.key}:n/a:${discipline}`,
    };
  return m.verdict({ ...input, discipline });
}

/* ──────────────────────────────── reading ─────────────────────────────────── */

const RECORD_DEFS: readonly RecordDef<object>[] = [
  RESEARCH,
  RESEARCH_BEATS,
  RESEARCH_SCOPE,
  MUSIC_VIDEO_SOURCE,
  SCRIPT_ADOPTED,
  SCRIPT_VERSIONS,
  SCRIPT_TRAILER,
  FRAMES,
  SCORE,
  CUT,
];

export function recordDefFor(key: string): RecordDef<object> | undefined {
  return RECORD_DEFS.find((d) => d.key === key);
}

/** Why an input could not be assembled. A verdict over a record nobody could
 *  read would be a verdict about nothing, so there is none. */
export interface Unreadable {
  ok: false;
  /** The record key, or `"project"`. */
  key: string;
  refused: "future" | "malformed" | "unreadable" | "no-project" | "undeclared";
  detail: string;
}

/** The project and every record the module declares, read through the
 *  registry. No component, no hook. */
export async function readVerdictInput(
  projectId: string,
  m: StepModule,
): Promise<{ ok: true; input: VerdictInput } | Unreadable> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, key: "project", refused: "no-project", detail: `no project ${projectId}` };
  const records: Record<string, unknown> = {};
  for (const key of m.records) {
    const def = recordDefFor(key);
    if (!def) return { ok: false, key, refused: "undeclared", detail: `${m.key} reads ${key}, which no step declares` };
    const r = await readRecord(def, projectId);
    if (!r.ok)
      return "refused" in r
        ? { ok: false, key, refused: r.refused, detail: r.detail }
        : { ok: false, key, refused: "unreadable", detail: r.trouble.message };
    records[key] = r.data;
  }
  return { ok: true, input: { project, records } };
}

/** One step's verdict for one stored project, from storage alone. */
export async function computeVerdict(
  projectId: string,
  key: PhaseKey,
): Promise<{ ok: true; verdict: StepVerdict } | Unreadable> {
  const m = stepModule(key);
  if (!m) return { ok: false, key, refused: "undeclared", detail: `no step module for ${key}` };
  const read = await readVerdictInput(projectId, m);
  if (!read.ok) return read;
  return { ok: true, verdict: verdictOf(m, read.input) };
}
