// THE STEPS AS STATES, read from the reel's detail (spark reel-studio WP4). Pure: the Steps server component and
// its islands both read it, so the tally on a folded step and the body of the open one cannot disagree.
//
// Five steps, one per job the reel walks through, and each is in one of five states: `empty` (nothing made yet),
// `running` (its job is open), `failed` (its job's last run failed; the error is verbatim on the step), `waiting`
// (made, and the operator's act is next) and `done`. The step that is open is the stage's.
import type { JobState } from "@gt/domain/job";

import type { FilmStage } from "../../../../../lib/reel/film.ts";
import type { ReelJobKind, ReelJobView } from "../../../../../lib/producers/reel.ts";
import type { ReelPin } from "../../../../../lib/reel/store.ts";
import { FILM_SPEC, type FilmFace } from "../../../../../lib/reel/types.ts";
import type { ReelDetail } from "../../_port/types.ts";

export type StepKey = "data" | "author" | "render" | "sound" | "release";
export const STEP_KEYS: readonly StepKey[] = ["data", "author", "render", "sound", "release"];
export const STEP_TITLE: Readonly<Record<StepKey, string>> = { data: "Data", author: "Author", render: "Render", sound: "Sound", release: "Release" };
export const STEP_JOB: Readonly<Record<StepKey, ReelJobKind | undefined>> = { data: "reel-data", author: "reel-author", render: "reel-render", sound: undefined, release: "reel-release" };

export type StepState = "empty" | "running" | "failed" | "waiting" | "done";

const OPEN_JOB: ReadonlySet<JobState> = new Set(["planned", "queued", "running", "paused"]);
export const isOpenJob = (j: Pick<ReelJobView, "state">): boolean => OPEN_JOB.has(j.state);

/** The job of one kind the step shows: the open one, else the latest. */
export function jobOf(jobs: readonly ReelJobView[], kind: ReelJobKind | undefined): ReelJobView | undefined {
  if (kind === undefined) return undefined;
  const mine = jobs.filter((j) => j.kind === kind);
  return mine.find(isOpenJob) ?? mine.at(-1);
}

/** The step a stage opens; undefined for a dropped reel (every step folds). */
export function openStepOf(stage: FilmStage): StepKey | undefined {
  switch (stage) {
    case "idea":
    case "data":
      return "data";
    case "authoring":
    case "redo":
      return "author";
    case "rendering":
    case "review":
      return "render";
    case "sound":
      return "sound";
    case "release":
    case "released":
      return "release";
    case "dropped":
      return undefined;
  }
}

/** The redo verdict's pins in time order: what the next author turn reads. Empty when the film was not sent back. */
export function redoPins(detail: Pick<ReelDetail, "verdicts" | "film">): readonly ReelPin[] {
  const v = detail.verdicts.film;
  if (v === undefined || v.verdict !== "reject" || !v.current) return [];
  // Pages written after the redo already answered its pins (lib/reel/film.ts filmStageOf's rule).
  const authored = detail.film?.authoredAt;
  if (authored !== undefined && authored > v.at) return [];
  return [...(v.pins ?? [])].sort((a, b) => a.t - b.t);
}

const bothFaces = <T>(rec: Partial<Record<FilmFace, T>> | undefined): boolean => rec?.desktop !== undefined && rec.phone !== undefined;

/** What was made at a step, before its job's state is laid over it. */
function madeState(key: StepKey, d: ReelDetail): StepState {
  switch (key) {
    case "data": {
      // A reel with a film is past its data (an imported one has no table of this pipeline's at all).
      if (d.film !== undefined) return "done";
      if (d.table === undefined) return "empty";
      const v = d.verdicts.data;
      return v?.verdict === "keep" && v.current ? "done" : "waiting";
    }
    case "author":
      if (d.film === undefined) return "empty";
      return redoPins(d).length > 0 ? "waiting" : "done";
    case "render":
      return bothFaces(d.film?.renders) ? "done" : "empty";
    case "sound":
      // The bed is the operator's next act only once the film was taken (the sound stage).
      return d.film?.bed !== undefined ? "done" : d.stage === "sound" ? "waiting" : "empty";
    case "release": {
      if (!bothFaces(d.film?.copies)) return "empty";
      return d.stage === "released" ? "done" : "waiting";
    }
  }
}

export function stepState(key: StepKey, d: ReelDetail): StepState {
  const job = jobOf(d.jobs, STEP_JOB[key]);
  if (job !== undefined && isOpenJob(job)) return "running";
  if (job?.state === "failed" || job?.state === "interrupted") return "failed";
  return madeState(key, d);
}

/** The words a folded step's tally shows. */
export const STATE_WORD: Readonly<Record<StepState, string>> = { empty: "empty", running: "running", failed: "failed", waiting: "waiting", done: "done" };

/* ── numbers the steps show ────────────────────────────────────────────────── */

export const fmtSeconds = (s: number): string => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : `${s.toFixed(1)} s`);
export const fmtMb = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`;
export const targetOf = (face: FilmFace): number => FILM_SPEC[face].targetBytes;
/** A copy's distance from its target, signed, in MB ("+1.2 MB", "−3.4 MB"). */
export function overTarget(face: FilmFace, bytes: number): string {
  const d = (bytes - targetOf(face)) / 1_000_000;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)} MB`;
}
/** The owner's band: ±30 MB around the target (lib/reel/types.ts FILM_SPEC). */
export const inBand = (face: FilmFace, bytes: number): boolean => Math.abs(bytes - targetOf(face)) <= 30_000_000;

/** The pin's moment on the desktop timeline, `m:ss`. */
export const pinTime = (t: number): string => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
