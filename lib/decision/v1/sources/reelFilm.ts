import "server-only";

import type { Decision } from "@gt/domain/decision";
import { err, ok, type Result } from "@gt/domain/errors";
import type { ItemWords } from "@gt/ui/board/port";
import { decodeSchedule, scheduleWords } from "@gt/ui/components/review/schedule.ts";

import { reelExportId, reelLandingProblem, reelScheduleOf, reelSlotId } from "../../../producers/reelActs.ts";
import { exportsRoot } from "../../../publish/exports.ts";
import { FILM_PUBLISH, decideReelStop, filmPublishOf, type DecideOptions } from "../../../reel/decide.ts";
import { filmSubjectSha } from "../../../reel/film.ts";
import type { ReelPublish, ReelVerdict, ReelVerdicts, Stop } from "../../../reel/store.ts";
import { FILM_DIR, FILM_FACES, type BedRecord, type FilmCopy, type FilmRecord, type FilmRender, type ReelState } from "../../../reel/types.ts";
import type { Preview } from "../types.ts";

type ConsequenceWrite = Preview["consequence"]["writes"][number];

// THE FILM'S TWO STOPS ON THE BOARD (spark reel-studio) - `pkt:reel:<slug>:film` (the rendered pair: take, or send
// back with reasons) and `pkt:reel:<slug>:release` (the bed and both publish copies: keep lands them on the
// Calendar). ./reel.ts reads, mints and applies every reel stop; what is the film's own lives here.
//
// ONE CELL, THE DESKTOP FACE. A matrix cull decides each cell on its own, and the film is one decision about a
// pair: two cells would let a desktop keep sit beside a phone reject, which the film stop cannot record. So the
// cell shows the desktop face with its poster; the phone face is judged beside it on /reels (linked players). The
// cell's media sha is the one the render (or the copy) recorded when it landed - `mediaRef`'s `known` - never a
// hash of a 750 MB file on read.
//
// A VERDICT IS OF THE PAIR (lib/reel/film.ts filmSubjectSha). The packet freezes the desktop face's sha; the apply
// refuses a desktop face made again since, and records the verdict of the pair as it stands, through the same
// writer the /reels screen calls (lib/reel/decide.ts). The pair's sha is in the preview's digest too, so a phone
// face made again between the preview and the commit is a stale preview. What is not caught: the phone face alone
// made again between the commit and its delivery - the record says which pair it took, and /reels shows it.
// Board verdicts are keep or reject; a drop is said on /reels.

export type FilmFacts = { readonly kind: "film"; readonly desktop: FilmRender; readonly phone: FilmRender; readonly frames: number; readonly bed?: BedRecord };
export type ReleaseFacts = { readonly kind: "release"; readonly desktop: FilmCopy; readonly phone: FilmCopy; readonly bed?: BedRecord; readonly publish: ReelPublish | string };

/** Whether the film or release stop has something to judge: both faces rendered (copied), and for a release, the film taken. */
export function filmReached(state: ReelState, stop: Stop, verdicts: ReelVerdicts): boolean {
  const film = state.film;
  if (film === undefined) return false;
  if (stop.kind === "film") return filmSubjectSha(film, "film") !== undefined && !(verdicts.stops.film?.verdict === "drop" && verdicts.stops.film.of !== filmSubjectSha(film, "film"));
  const fv = verdicts.stops.film;
  return fv?.verdict === "keep" && fv.of === filmSubjectSha(film, "film") && filmSubjectSha(film, "release") !== undefined;
}

/** The sha the stop's cell freezes (the desktop face) and the sha the verdict is of (the pair). */
export function filmShas(film: FilmRecord, stop: Stop): { readonly cell: string; readonly subject: string } | undefined {
  const key = stop.kind === "film" ? "film" : "release";
  const cell = key === "film" ? film.renders.desktop?.sha : film.copies.desktop?.sha;
  const subject = filmSubjectSha(film, key);
  return cell === undefined || subject === undefined ? undefined : { cell, subject };
}

export async function filmFactsOf(state: ReelState, stop: Stop, dir: string): Promise<Result<FilmFacts | ReleaseFacts>> {
  const film = state.film;
  const bed = film?.bed === undefined ? {} : { bed: film.bed };
  if (stop.kind === "film") {
    const d = film?.renders.desktop;
    const p = film?.renders.phone;
    if (film === undefined || d === undefined || p === undefined) return err("not-found", `reel ${stop.slug}: the film is not rendered`);
    return ok({ kind: "film", desktop: d, phone: p, frames: film.frames, ...bed });
  }
  const d = film?.copies.desktop;
  const p = film?.copies.phone;
  if (film === undefined || d === undefined || p === undefined) return err("not-found", `reel ${stop.slug}: the publish copies are not encoded`);
  const { publish } = await filmPublishOf(dir, state);
  return ok({ kind: "release", desktop: d, phone: p, ...bed, publish });
}

const mb = (bytes: number): string => `${(bytes / 1_000_000).toFixed(1)} MB`;
const s = (seconds: number): string => `${Math.round(seconds)} s`;

export function filmWords(state: ReelState, facts: FilmFacts | ReleaseFacts, poster: string | undefined): ItemWords {
  const p = poster === undefined ? {} : { poster };
  if (facts.kind === "film") {
    return { label: state.idea.title, meta: [`desktop ${s(facts.desktop.seconds)}`, `phone ${s(facts.phone.seconds)}`, `${facts.frames} frames`].join(" · "), prompt: state.idea.hook, ...p };
  }
  const vmaf = facts.desktop.vmaf === undefined ? [] : [`VMAF ${facts.desktop.vmaf.mean.toFixed(1)}`];
  return { label: typeof facts.publish === "string" ? state.idea.title : facts.publish.title, meta: [`desktop ${mb(facts.desktop.bytes)}`, `phone ${mb(facts.phone.bytes)}`, ...vmaf, facts.bed === undefined ? "silent" : "with its bed"].join(" · "), prompt: state.idea.hook, ...p };
}

/** What a film or release decision writes, said before the commit. */
export function filmWrites(o: { readonly stop: Stop; readonly facts: FilmFacts | ReleaseFacts; readonly round: number; readonly d: Decision | undefined; readonly record: string; readonly cell: string; readonly shown: (abs: string) => string }): Result<ConsequenceWrite[]> {
  const { stop, facts, round, d, record, cell } = o;
  const writes: ConsequenceWrite[] = [];
  if (d?.verdict === "keep") {
    writes.push({ kind: "index-row", target: record, candidate: cell, detail: `keep${round > 1 ? ` · round ${round}` : ""}` });
    if (facts.kind === "release") {
      if (typeof facts.publish === "string") return err("invalid", `reel ${stop.slug}: ${facts.publish}`);
      const when = reelScheduleOf(d.note, new Date(0).toISOString());
      if (!when.ok) return when;
      const proposed = decodeSchedule(d.note).kind === "none";
      for (const face of FILM_FACES) {
        const exportId = reelExportId(stop.slug, face, round);
        const problem = reelLandingProblem(exportId, facts.publish);
        if (problem !== null) return err("invalid", `reel ${stop.slug}: ${FILM_PUBLISH}: ${problem}`);
        writes.push({ kind: "file", target: `${o.shown(exportsRoot())}/${exportId}.mp4`, candidate: cell, detail: `copied: ${FILM_DIR}/${facts[face].file}` });
        writes.push({ kind: "index-row", target: `calendar · ${proposed ? `${when.value.channel} · the day after the decision, 08:00 UTC` : scheduleWords(when.value)}`, candidate: cell, detail: `slot ${reelSlotId(stop.slug, face, round)}: ${facts.publish.title}` });
      }
    }
  } else if (d?.verdict === "reject") {
    const then = facts.kind === "film" ? " · the pages are written again" : " · the bed and copies are made again";
    writes.push({ kind: "index-row", target: record, candidate: cell, detail: `reject${d.reasons.length === 0 ? "" : ` (${d.reasons.join(", ")})`}${then}` });
  }
  return ok(writes);
}

/**
 * The Board's apply of a film or release stop: the judged desktop sha must still be the face on record, and the
 * verdict goes through the one writer (lib/reel/decide.ts) as a verdict of the pair as it stands.
 */
export async function applyFilmStop(o: { readonly stop: Stop; readonly state: ReelState; readonly judged: string; readonly verdict: Omit<ReelVerdict, "of">; readonly opts: DecideOptions }): Promise<Result<void>> {
  const { stop, state } = o;
  const shas = state.film === undefined ? undefined : filmShas(state.film, stop);
  if (shas === undefined) return err("not-found", `reel ${stop.slug}: there is nothing to judge at the ${stop.key} stop`);
  if (shas.cell !== o.judged) return err("conflict", `reel ${stop.slug}: the film was made again since you looked`);
  const key = stop.kind === "film" ? "film" : "release";
  const done = await decideReelStop(stop.slug, key, { ...o.verdict, of: shas.subject }, o.opts);
  return done.ok ? ok(undefined) : done;
}
