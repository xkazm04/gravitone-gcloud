// THE TRIAL INDEX — `public/trials/index.json`, read through a type.
//
// The index is written by pipeline/build-style-trials.mts and read here and in
// lib/useAssets.ts (which keeps its own narrower copy for seeding the shelf).
// Everything below is pure, so the matrix's shape can be proved without a DOM.
//
// A LANE IS THE DIRECTORY THE PLATE LIVES IN, NOT THE `provider` FIELD. Measured
// 2026-10-12 on the committed index: 60 entries, of which 30 sit under
// /trials/google/ but only 7 carry `provider: "google"` — the other 23 are
// `provider: "local"` (a local flux render filed in the google grid) and carry
// no grade at all. The cell's `src` is the file, so the lane that decides which
// plates are shown together is the one the file path names. The ungraded 23 are
// kept as cells with no readback flags rather than dropped: a missing grade is
// "not read", never "clean".

import type { Preset } from "./presets";
import type { Trial } from "./trials";

export interface TrialGrade {
  hasText?: boolean;
  drewWhatWasAsked?: boolean;
  clutter?: number;
}

export interface TrialEntry {
  styleId: string;
  trialId: string;
  file: string;
  provider?: string;
  model?: string;
  grade?: TrialGrade;
}

export interface TrialIndex {
  entries: TrialEntry[];
}

export interface MatrixCell {
  trial: Trial;
  /** Absent when the index holds no plate for this preset x trial in the lane. */
  entry?: TrialEntry;
}

export interface MatrixRow {
  preset: Preset;
  cells: MatrixCell[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function readGrade(v: unknown): TrialGrade | undefined {
  if (!isRecord(v)) return undefined;
  const g: TrialGrade = {};
  if (typeof v.hasText === "boolean") g.hasText = v.hasText;
  if (typeof v.drewWhatWasAsked === "boolean") g.drewWhatWasAsked = v.drewWhatWasAsked;
  if (typeof v.clutter === "number" && Number.isFinite(v.clutter)) g.clutter = v.clutter;
  return g;
}

/** Narrow parsed JSON once, at the door. A malformed entry is dropped, not
 *  thrown on: a gallery that dies on one bad row hides the other fifty-nine. */
export function parseTrialIndex(raw: unknown): TrialIndex {
  const list = isRecord(raw) && Array.isArray(raw.entries) ? raw.entries : [];
  const entries: TrialEntry[] = [];
  for (const e of list) {
    if (!isRecord(e)) continue;
    if (typeof e.styleId !== "string" || typeof e.trialId !== "string" || typeof e.file !== "string") continue;
    entries.push({
      styleId: e.styleId,
      trialId: e.trialId,
      file: e.file,
      provider: typeof e.provider === "string" ? e.provider : undefined,
      model: typeof e.model === "string" ? e.model : undefined,
      grade: readGrade(e.grade),
    });
  }
  return { entries };
}

/** `/trials/google/blueprint/flywheel.jpg` gives `google`. */
export function laneOf(file: string): string | null {
  const m = /^\/trials\/([^/]+)\/[^/]+\/[^/]+$/.exec(file);
  return m ? m[1] : null;
}

/** Lanes present in the index, in first-seen order. */
export function lanesOf(index: TrialIndex): string[] {
  const seen: string[] = [];
  for (const e of index.entries) {
    const l = laneOf(e.file);
    if (l && !seen.includes(l)) seen.push(l);
  }
  return seen;
}

/** Rows are presets, columns are trials, one lane. A preset the index never
 *  rendered keeps its row with empty cells. */
export function buildMatrix(
  index: TrialIndex,
  lane: string,
  presets: readonly Preset[],
  trials: readonly Trial[],
): MatrixRow[] {
  const byKey = new Map<string, TrialEntry>();
  for (const e of index.entries) {
    if (laneOf(e.file) === lane) byKey.set(`${e.styleId}/${e.trialId}`, e);
  }
  return presets.map((preset) => ({
    preset,
    cells: trials.map((trial) => ({ trial, entry: byKey.get(`${preset.id}/${trial.id}`) })),
  }));
}
