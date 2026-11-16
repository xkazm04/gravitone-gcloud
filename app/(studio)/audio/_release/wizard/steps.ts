// THE WIZARD'S STEPS (spark audio-distribution, S1, variant "wizard"): the eight stops of the walk
// and the rule that files every problem of `releaseProblems` under the step that fixes it. A step's
// problems are a predicate over the model (registry wizard-flows/progress-communication: everything
// displayed is a derivation) - never a flag a step sets on its way out - so an edit anywhere moves
// every tally on the rail at once.
import type { Dispatch } from "react";

import type { Release } from "@gt/domain/release";
import type { ProblemCode, ReleaseProblem } from "@gt/domain/release.problems";

import type { ReleaseRead } from "../_port/port.ts";
import type { DraftEvent } from "../draft.ts";

export const STEPS = ["tracks", "details", "rights", "sleeve", "master", "channels", "extras", "review"] as const;
export type StepId = (typeof STEPS)[number];

export const STEP_LABEL: Readonly<Record<StepId, string>> = {
  tracks: "Tracks",
  details: "Details",
  rights: "AI & rights",
  sleeve: "Sleeve",
  master: "Master",
  channels: "Channels",
  extras: "Extras",
  review: "Review",
};

/** Where a track-level code is fixed. Title and identifier codes belong to the track list; the people
 *  on a track to the details; provenance to AI & rights; loudness to the master. */
const TRACK_CODE_STEP: Partial<Record<ProblemCode, StepId>> = {
  "title-missing": "tracks",
  "title-has-feat": "tracks",
  "title-has-version": "tracks",
  "title-all-caps": "tracks",
  "isrc-malformed": "tracks",
  "songwriter-missing": "details",
  "songwriter-not-full-name": "details",
  "persona-unstated": "rights",
  "rights-nc-licence": "rights",
  "rights-unknown-licence": "rights",
  "rights-unknown-vendor": "rights",
  "rights-unknown-tier": "rights",
  unmastered: "master",
  "master-off-target": "master",
};

/** The 0-based track a problem sits on, or null for the release, sleeve, splits and channels. */
export function trackIndexOf(p: ReleaseProblem): number | null {
  if (!p.at.startsWith("track:")) return null;
  const n = Number(p.at.slice("track:".length));
  return Number.isInteger(n) && n >= 1 ? n - 1 : null;
}

export function stepOf(p: ReleaseProblem): StepId {
  if (p.at === "sleeve") return "sleeve";
  if (p.at === "splits") return "extras";
  if (p.at === "channels") return "channels";
  if (p.at === "release") return p.code === "no-tracks" ? "tracks" : "details";
  return TRACK_CODE_STEP[p.code] ?? "tracks";
}

/** The problems a step fixes; the review owns none of its own, it gathers every other step's. */
export const problemsOf = (all: readonly ReleaseProblem[], step: StepId): ReleaseProblem[] =>
  step === "review" ? [...all] : all.filter((p) => stepOf(p) === step);

export const problemsOnTrack = (all: readonly ReleaseProblem[], step: StepId, index: number): ReleaseProblem[] =>
  problemsOf(all, step).filter((p) => trackIndexOf(p) === index);

export interface Severity {
  readonly block: number;
  readonly warn: number;
}

export const severityOf = (ps: readonly ReleaseProblem[]): Severity => ({
  block: ps.filter((p) => p.severity === "block").length,
  warn: ps.filter((p) => p.severity === "warn").length,
});

/** Where a release opens: a new one at its first step, an existing one at its first blocked step,
 *  or at the review when nothing blocks. */
export function entryStep(all: readonly ReleaseProblem[], fresh: boolean): StepId {
  if (fresh) return "tracks";
  return STEPS.find((s) => s !== "review" && problemsOf(all, s).some((p) => p.severity === "block")) ?? "review";
}

/** What every step receives: the open release, the read, every live problem, and the walk's position. */
export interface StepProps {
  readonly release: Release;
  readonly read: ReleaseRead;
  readonly problems: readonly ReleaseProblem[];
  readonly dispatch: Dispatch<DraftEvent>;
  /** The track this step is looking at (0-based, clamped by the caller). */
  readonly track: number;
  readonly setTrack: (index: number) => void;
  readonly go: (step: StepId, track?: number) => void;
}
