// WHAT A REEL'S FILM MAY LOSE, AND WHEN - the retention rules as data and one pure function (spark reel-studio,
// the owner's rule of 2026-11-18: "the sizing will be unsustainable"). No fs here: lib/reel/archive.ts reads the
// folder, asks `dueFiles`, keeps the recipe, deletes, and records what it took.
//
//   master-14d        film-desktop.mp4 / film-phone.mp4, 14 days after its render - but the clock is PAUSED while
//                     the film still needs them: waiting for its verdict (review), or taken and not yet released
//                     (sound, release: the mixes and copies are made from the masters). A redo, a drop or a
//                     release lets them go. A render older than 14 days at that moment goes on the next sweep.
//   mix-encoded       mix-<face>.mp4 (master-sized, the bed laid under the picture) once that face's copy is encoded
//                     from it: it is an intermediate, nothing reads it after.
//   cut-3d-published  release-<face>.mp4 and the Calendar's copy in the exports root, 3 days after that face's slot
//                     REALLY published (a dry publication starts no clock: nothing went out).
//   bed-with-cut      the bed, once both faces' cuts are gone: its Suno prompt in the recipe is what remains.
//
// Registry: production-pipeline-phasing/asset-vs-disposable-render (masters and copies are disposables once a person
// decided; the decision is the asset) and review-iteration-loops/gate-record-outlives-the-media (record the
// destruction in the item, never remove the item).

import type { FilmStage } from "./film.ts";
import { FILM_FACES, FILM_SPEC, type ArchiveRule, type FilmFace, type FilmRecord } from "./types.ts";

export const MASTER_DAYS = 14;
export const CUT_DAYS = 3;
const DAY_MS = 86_400_000;

/** The stages in which a master is still needed: its clock does not run. */
export const MASTER_HELD: readonly FilmStage[] = ["idea", "data", "authoring", "rendering", "review", "sound", "release"];

/** One face's publication, as the Calendar recorded it. */
export type FacePublication = { readonly at: string; readonly dry: boolean };

/** A file the sweep should delete now. `file` is film-relative, or `exports:<name>` for the exports root's copy. */
export type DueFile = { readonly file: string; readonly rule: ArchiveRule; readonly bytes: number; readonly sha?: string; readonly face?: FilmFace };

const past = (fromIso: string, days: number, now: Date): boolean => {
  const t = Date.parse(fromIso);
  return Number.isFinite(t) && now.getTime() >= t + days * DAY_MS;
};

/** Every file already archived, by name. */
export const archivedNames = (film: FilmRecord): ReadonlySet<string> => new Set((film.archived ?? []).map((a) => a.file));

/** When a master's 14 days end (ISO), or undefined while its clock is paused or there is no master. */
export function masterDueAt(film: FilmRecord, face: FilmFace, stage: FilmStage): string | undefined {
  const r = film.renders[face];
  if (r === undefined || MASTER_HELD.includes(stage)) return undefined;
  return new Date(Date.parse(r.renderedAt) + MASTER_DAYS * DAY_MS).toISOString();
}

/**
 * The files due now. `exportOf(face)` names the Calendar's copy of that face in the exports root (the landing's
 * export id + `.mp4`), and `published(face)` its real publication, both read by the caller from the kernel.
 */
export function dueFiles(o: {
  readonly film: FilmRecord;
  readonly stage: FilmStage;
  readonly now: Date;
  readonly published: (face: FilmFace) => FacePublication | undefined;
  readonly exportOf: (face: FilmFace) => string | undefined;
}): DueFile[] {
  const { film, stage, now } = o;
  // Candidates, not decisions: a name can come back (a new bed makes a new mix, a re-render a new master), so the
  // caller deletes only what EXISTS and records a missing file once per (name, sha) - see lib/reel/archive.ts.
  const gone = archivedNames(film);
  const out: DueFile[] = [];
  const add = (d: DueFile): void => {
    out.push(d);
  };
  for (const face of FILM_FACES) {
    const spec = FILM_SPEC[face];
    const r = film.renders[face];
    if (r !== undefined && !MASTER_HELD.includes(stage) && past(r.renderedAt, MASTER_DAYS, now)) add({ file: r.file, rule: "master-14d", bytes: r.bytes, sha: r.sha, face });
    const copy = film.copies[face];
    // The mix's bytes are not recorded anywhere; the caller stats the file and fills them in.
    if (copy !== undefined) add({ file: spec.mix, rule: "mix-encoded", bytes: 0, face });
    const pub = o.published(face);
    if (copy !== undefined && pub !== undefined && !pub.dry && past(pub.at, CUT_DAYS, now)) {
      add({ file: copy.file, rule: "cut-3d-published", bytes: copy.bytes, sha: copy.sha, face });
      const ex = o.exportOf(face);
      if (ex !== undefined) add({ file: `exports:${ex}`, rule: "cut-3d-published", bytes: copy.bytes, sha: copy.sha, face });
    }
  }
  // The bed goes once BOTH faces' cuts are gone (archived before, or due in this same sweep).
  const bed = film.bed;
  if (bed !== undefined) {
    const cutGone = (face: FilmFace): boolean => {
      const c = film.copies[face];
      return c !== undefined && (gone.has(c.file) || out.some((d) => d.file === c.file));
    };
    if (FILM_FACES.every(cutGone)) add({ file: bed.file, rule: "bed-with-cut", bytes: 0, sha: bed.sha });
  }
  return out;
}

/** Bytes the archive has freed, over every recorded deletion. */
export const archivedBytes = (film: FilmRecord | undefined): number => (film?.archived ?? []).reduce((n, a) => n + a.bytes, 0);
