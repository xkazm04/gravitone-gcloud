// THE FILM'S STAGE MACHINE, as data and pure functions (spark reel-studio). No fs here: the producers and the
// /reels screen read a folder, call one of these, and write.
//
// A film walks: idea -> data -> authoring -> rendering -> review -> (redo -> authoring | dropped | sound) -> release
// -> released. Nothing stores the walk: `filmStageOf` derives it from the state and the recorded verdicts, so a
// stage can never disagree with the records it is read from.
//
// WP-0 STUB: the signatures are the contract; WP1 fills the bodies.

import type { ReelVerdicts } from "./store.ts";
import { ReelError, type BedRecord, type FilmCopy, type FilmFace, type FilmRecord, type FilmRender, type ReelState } from "./types.ts";

export type FilmStage = "idea" | "data" | "authoring" | "rendering" | "review" | "redo" | "sound" | "release" | "released" | "dropped";
export const FILM_STAGES: readonly FilmStage[] = ["idea", "data", "authoring", "rendering", "review", "redo", "sound", "release", "released", "dropped"];

const notBuilt = (name: string): never => {
  throw new ReelError(`${name} is not built yet (spark reel-studio WP1)`, "unbuilt");
};

/** Where a reel stands, read from its state and its verdicts. */
export function filmStageOf(state: ReelState, verdicts: ReelVerdicts): FilmStage {
  void state;
  void verdicts;
  return notBuilt("filmStageOf");
}

/** The sha a film or release verdict is OF: sha256 of the two faces' shas joined by "\n" (desktop first). Undefined until both faces exist. */
export function filmSubjectSha(film: FilmRecord, stop: "film" | "release"): string | undefined {
  void film;
  void stop;
  return notBuilt("filmSubjectSha");
}

/** A face was rendered. A new render of either face drops the bed's mixes and every copy (they were made of the old picture). */
export function withFilmRender(state: ReelState, face: FilmFace, render: FilmRender, frames: number, now: string): ReelState {
  void state;
  void face;
  void render;
  void frames;
  void now;
  return notBuilt("withFilmRender");
}

/** A bed was attached. A different bed drops every copy. Refused (ReelError) when `bedProblem` says so. */
export function withBed(state: ReelState, bed: BedRecord, now: string): ReelState {
  void state;
  void bed;
  void now;
  return notBuilt("withBed");
}

/** A publish copy was encoded. */
export function withCopy(state: ReelState, face: FilmFace, copy: FilmCopy, now: string): ReelState {
  void state;
  void face;
  void copy;
  void now;
  return notBuilt("withCopy");
}

/** The sentence that refuses a bed, or undefined when it fits: a bed must be at least as long as the desktop film. */
export function bedProblem(bed: Pick<BedRecord, "seconds">, desktopSeconds: number): string | undefined {
  void bed;
  void desktopSeconds;
  return notBuilt("bedProblem");
}
