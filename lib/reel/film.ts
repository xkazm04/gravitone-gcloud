// THE FILM'S STAGE MACHINE, as data and pure functions (spark reel-studio). No fs and no node:crypto here: the
// producers and the /reels screen read a folder, call one of these, and write; a client island may import it.
//
// A film walks: idea -> data -> authoring -> rendering -> review -> (redo -> authoring | dropped | sound) -> release
// -> released. Nothing stores the walk: `filmStageOf` derives it from the state and the recorded verdicts, so a
// stage can never disagree with the records it is read from.
//
// WHERE "THE PAGE PAIR EXISTS" IS CHECKED: in the writer, never here. A film record is written only once both pages
// are on disk - pipeline/reel-import.mts copies them before it writes `film`, and the author job sets
// `film.authoredAt` after both pages landed. So a film record IS the pages' existence, and `authoredAt` is the
// instant the current pair was written: a render older than it is a picture of the previous pages.
//
// A VERDICT IS OF THE FILM AS A PAIR: `filmSubjectSha` joins the two faces' stored shas, so a re-render of either
// face is a new subject and the stop opens a new round (lib/reel/store.ts roundOf). The shas are the ones each
// render or copy recorded when it landed; nothing here (or anywhere on a read) hashes a 750 MB master.

import { sha256Text } from "./sha256.ts";
import type { ReelVerdict, ReelVerdicts } from "./store.ts";
import { ReelError, type BedRecord, type FilmCopy, type FilmFace, type FilmRecord, type FilmRender, type ReelState } from "./types.ts";

export type FilmStage = "idea" | "data" | "authoring" | "rendering" | "review" | "redo" | "sound" | "release" | "released" | "dropped";
export const FILM_STAGES: readonly FilmStage[] = ["idea", "data", "authoring", "rendering", "review", "redo", "sound", "release", "released", "dropped"];

/** The sha a film or release verdict is OF: sha256 of the two faces' shas joined by "\n" (desktop first). Undefined until both faces exist. */
export function filmSubjectSha(film: FilmRecord, stop: "film" | "release"): string | undefined {
  const pair = stop === "film" ? film.renders : film.copies;
  const d = pair.desktop?.sha;
  const p = pair.phone?.sha;
  return d === undefined || p === undefined ? undefined : sha256Text(`${d}\n${p}`);
}

/** A render is of the current pages: rendered at or after the pair was last written (ISO instants compare as text). */
const currentRender = (film: FilmRecord, r: FilmRender | undefined): boolean => r !== undefined && (film.authoredAt === undefined || r.renderedAt >= film.authoredAt);

/** The stop's verdict when it is about exactly these bytes; undefined when the subject was made again (or never judged). */
const verdictOn = (v: ReelVerdict | undefined, subject: string | undefined): ReelVerdict | undefined => (v !== undefined && subject !== undefined && v.of === subject ? v : undefined);

/** Where a reel stands, read from its state and its verdicts. */
export function filmStageOf(state: ReelState, verdicts: ReelVerdicts): FilmStage {
  const film = state.film;
  // A drop is final whichever round it was given in: an abandoned reel does not come back by being re-rendered.
  if (verdicts.stops.film?.verdict === "drop") return "dropped";
  if (film === undefined) {
    if (state.stage === "idea" || state.tableSha === undefined) return "idea";
    // The table is accepted at the data stop; until then the reel is still at its data.
    return verdicts.stops.data?.verdict === "keep" ? "authoring" : "data";
  }
  // From here a film record exists, so its pages do: an imported film has no table and is past data all the same.
  const fv = verdictOn(verdicts.stops.film, filmSubjectSha(film, "film"));
  if (fv?.verdict === "reject") {
    // Sent back: redo until the pages are written again, then the new pair waits for its render.
    return film.authoredAt !== undefined && film.authoredAt > fv.at ? "rendering" : "redo";
  }
  if (!currentRender(film, film.renders.desktop) || !currentRender(film, film.renders.phone)) return "rendering";
  if (fv === undefined) return "review";
  // fv is a keep: the film is taken, and what is left is its sound and its publish copies.
  const bed = film.bed;
  const carries = (c: FilmCopy | undefined): boolean => c !== undefined && c.bedSha === bed?.sha;
  if (bed === undefined || !carries(film.copies.desktop) || !carries(film.copies.phone)) return "sound";
  const rv = verdictOn(verdicts.stops.release, filmSubjectSha(film, "release"));
  if (rv === undefined) return "release";
  return rv.verdict === "keep" ? "released" : "sound";
}

const emptyFilm = (frames: number): FilmRecord => ({ frames, renders: {}, copies: {} });

const filmOf = (state: ReelState, what: string): FilmRecord => {
  if (state.film === undefined) throw new ReelError(`reel ${state.slug} has no film yet: ${what} needs its pages first`);
  return state.film;
};

/** A face was rendered. A new render of either face drops the bed's mixes and every copy (they were made of the old picture). */
export function withFilmRender(state: ReelState, face: FilmFace, render: FilmRender, frames: number, now: string): ReelState {
  const film = state.film ?? emptyFilm(frames);
  // The same bytes again (a redelivered job) change nothing, so the copies made of them stand.
  if (film.renders[face]?.sha === render.sha && film.frames === frames) return state;
  // The bed stays (it is the operator's upload, not made of the picture); its mixes are files the producer deletes.
  const next: FilmRecord = { ...film, frames, renders: { ...film.renders, [face]: render }, copies: {} };
  return { ...state, film: next, updatedAt: now };
}

/** The sentence that refuses a bed, or undefined when it fits: a bed must be at least as long as the desktop film. */
export function bedProblem(bed: Pick<BedRecord, "seconds">, desktopSeconds: number): string | undefined {
  if (!(bed.seconds > 0)) return "the bed has no length: it does not read as audio";
  // A hair of tolerance: a container's duration rounds, and a bed 99.98 s long under a 100 s film is not short.
  if (bed.seconds + 0.05 >= desktopSeconds) return undefined;
  return `the bed is ${bed.seconds.toFixed(1)} s and the desktop film is ${desktopSeconds.toFixed(1)} s: ask Suno for a track of at least ${Math.ceil(desktopSeconds)} s`;
}

/** The desktop film's length: its render when there is one, else the timeline at 30 fps. */
const desktopSeconds = (film: FilmRecord): number => film.renders.desktop?.seconds ?? film.frames / 30;

/** A bed was attached. A different bed drops every copy. Refused (ReelError) when `bedProblem` says so. */
export function withBed(state: ReelState, bed: BedRecord, now: string): ReelState {
  const film = filmOf(state, "a bed");
  const problem = bedProblem(bed, desktopSeconds(film));
  if (problem !== undefined) throw new ReelError(problem);
  // The same bytes keep the copies (a prompt backfilled later is a new record of the same bed).
  const copies = film.bed?.sha === bed.sha ? film.copies : {};
  return { ...state, film: { ...film, bed, copies }, updatedAt: now };
}

/** A publish copy was encoded. Refused when it carries a bed other than the film's (or a bed the film no longer has). */
export function withCopy(state: ReelState, face: FilmFace, copy: FilmCopy, now: string): ReelState {
  const film = filmOf(state, "a publish copy");
  if (film.renders[face] === undefined) throw new ReelError(`reel ${state.slug}: the ${face} face is not rendered, so it has no copy to encode`);
  if (copy.bedSha !== film.bed?.sha) throw new ReelError(`reel ${state.slug}: the ${face} copy carries ${copy.bedSha === undefined ? "no bed" : `bed ${copy.bedSha.slice(0, 12)}`} and the film's bed is ${film.bed === undefined ? "none" : film.bed.sha.slice(0, 12)}: encode it again`);
  return { ...state, film: { ...film, copies: { ...film.copies, [face]: copy } }, updatedAt: now };
}
